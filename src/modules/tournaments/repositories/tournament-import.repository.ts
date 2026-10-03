import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb, AppTx } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import { and, eq } from 'drizzle-orm';
import { TournamentPaymentRepository } from './tournament-payment.repository';
import {
  assertCapacityHasRoom,
  lockCapacityOwner,
  readEffectiveCapacity,
} from '../services/tournament-capacity.service';
import { calculateRequestedTeamSlots } from '../utils/tournament-participant-status';
import {
  findEligibleRosterAccountIds,
  findExistingRosterImportEmails,
  isBlockingRosterStatus,
  normalizeRosterEmail,
  ROSTER_EMAIL_PATTERN,
  resolveRosterAccountStatuses,
  validateRosterRows,
} from '../validation/roster-import';
import type {
  RosterImportItem,
  RosterPreviewRow,
  RosterRowStatus,
} from '../validation/roster-import';
import type { ImportSource, RosterEntryType } from '../dto/roster-import.dto';
import type { RosterImportPreviewDto } from '../dto/roster-import-preview.dto';

function getRosterValidationMessage(
  rowIndex: number,
  status: RosterRowStatus,
): string {
  const rowNumber = rowIndex + 1;
  switch (status) {
    case 'MISSING_NAME':
      return `Dòng ${rowNumber} thiếu tên VĐV 1`;
    case 'MISSING_EMAIL':
      return `Dòng ${rowNumber} thiếu email VĐV`;
    case 'INVALID_EMAIL':
      return `Dòng ${rowNumber} có email không hợp lệ`;
    case 'DUPLICATE_IN_FILE':
      return `Dòng ${rowNumber} dùng email đã xuất hiện trong danh sách`;
    case 'DUPLICATE_IN_TOURNAMENT':
      return `Dòng ${rowNumber} có VĐV đã tham gia giải`;
    case 'PLAYER2_REQUIRED':
      return `Dòng ${rowNumber} có thông tin VĐV 2 nhưng thiếu tên`;
    case 'PLAYER2_NOT_ALLOWED':
      return `Dòng ${rowNumber} của nội dung đơn có dữ liệu VĐV 2`;
    case 'DIVISION_UNKNOWN':
      return `Dòng ${rowNumber} có nội dung thi đấu không khớp`;
    case 'FOUND':
    case 'NOT_FOUND':
      return `Dòng ${rowNumber} không hợp lệ`;
  }
}

function getRosterEmails(items: readonly RosterImportItem[]): string[] {
  return items.flatMap((item) =>
    [item.player1Email, item.player2Email]
      .filter((email): email is string => Boolean(email))
      .map(normalizeRosterEmail),
  );
}

function applyAccountStatuses(
  rows: RosterPreviewRow[],
  eligibleEmails: ReadonlySet<string>,
): void {
  for (const row of rows) {
    const emails = [row.player1Email, row.player2Email].filter(
      (email): email is string =>
        typeof email === 'string' && ROSTER_EMAIL_PATTERN.test(email),
    );
    for (const email of emails) {
      row.status.push(eligibleEmails.has(email) ? 'FOUND' : 'NOT_FOUND');
    }
  }
}

/**
 * Legacy `POST /tournaments/:id/import-participants` payloads predate roster
 * import: emails are optional and provenance is not declared. They stay
 * accepted so already released clients keep working.
 */
export type LegacyImportItem = {
  teamName: string;
  player1Name: string;
  player1Email?: string;
  player1Phone?: string;
  player2Name?: string;
  player2Email?: string;
  player2Phone?: string;
  elo?: number;
  isPaid?: boolean;
  autoApprove?: boolean;
  customResponses?: Record<string, unknown>;
};

type ImportPersistRow = {
  teamName: string;
  player1Name: string;
  player1Email: string;
  player1Phone?: string;
  player2Name: string;
  player2Email: string;
  player2Phone?: string;
  elo?: number;
  isPaid?: boolean;
  autoApprove?: boolean;
  customResponses?: Record<string, unknown>;
  importMetadata: Record<string, unknown>;
  registeredByUserId: string | null;
  partnerUserId: string | null;
};

const IMPORT_OWNED_RESPONSE_KEYS = [
  'importedFrom',
  'entryType',
  'player1Email',
  'player1Phone',
  'player2Name',
  'player2Email',
  'player2Phone',
  // A caller must never claim a wildcard slot through form answers;
  // `is_wildcard` is server-owned only.
  'is_wildcard',
] as const;

async function findLegacyUser(
  tx: AppTx,
  email: string,
  phone: string | undefined,
): Promise<string | null> {
  let foundUser: typeof schema.users.$inferSelect | undefined;
  if (email) {
    foundUser = await tx
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1)
      .then((rows) => rows[0]);
  }
  if (!foundUser && phone) {
    const foundProfile = await tx
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.phoneNumber, phone))
      .limit(1)
      .then((rows) => rows[0]);
    if (foundProfile) {
      foundUser = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, foundProfile.userId))
        .limit(1)
        .then((rows) => rows[0]);
    }
  }
  return foundUser?.id ?? null;
}

@Injectable()
export class TournamentImportRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly tournamentPaymentRepository: TournamentPaymentRepository,
  ) {}
  async previewRosterImport(
    tournamentId: string,
    dto: RosterImportPreviewDto,
  ): Promise<{
    divisionMatched: boolean;
    rows: RosterPreviewRow[];
    requestedTeamSlots: number;
    capacityRemaining: number | null;
  }> {
    return this.db.transaction(async (tx) => {
      const tournament = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1)
        .then((rows) => rows[0]);
      if (!tournament) throw new BadRequestException('Giải đấu không tồn tại');
      if (!dto.participants.length) {
        throw new BadRequestException('Danh sách nhập không có dữ liệu hợp lệ');
      }

      let matchType = tournament.matchType;
      let divisionNames: string[] = [];
      if (dto.divisionId) {
        const division = await tx
          .select()
          .from(schema.tournamentDivisions)
          .where(
            and(
              eq(schema.tournamentDivisions.id, dto.divisionId),
              eq(schema.tournamentDivisions.tournamentId, tournamentId),
            ),
          )
          .limit(1)
          .then((rows) => rows[0]);
        if (!division) {
          throw new BadRequestException(
            'Nội dung thi đấu không thuộc giải này',
          );
        }
        matchType = division.matchType;
        divisionNames = [division.name];
      }

      const isDoubles =
        matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES';
      const emails = getRosterEmails(dto.participants);
      const existingEmails = await findExistingRosterImportEmails(
        tournamentId,
        emails,
        tx,
      );
      const validation = validateRosterRows({
        items: dto.participants,
        isDoubles,
        matchType,
        tournamentConfig: tournament.tournamentConfig,
        divisionNames,
        existingEmails,
      });
      const eligibleEmails = await resolveRosterAccountStatuses(emails, tx);
      applyAccountStatuses(validation.rows, eligibleEmails);

      const capacity = await readEffectiveCapacity(tx, {
        tournamentId,
        divisionId: dto.divisionId,
      });

      return {
        divisionMatched: Boolean(dto.divisionId),
        rows: validation.rows,
        requestedTeamSlots: validation.requestedTeamSlots,
        capacityRemaining:
          capacity.maxTeamSlots === null
            ? null
            : Math.max(0, capacity.maxTeamSlots - capacity.occupiedTeamSlots),
      };
    });
  }

  /**
   * Strict roster commit: every row carries a validated source and a player-one
   * email, is checked against the active roster and only claims capacity for
   * rows that will actually be written.
   */
  async importRosterRows(
    tournamentId: string,
    managerUserId: string,
    items: (RosterImportItem & {
      teamName: string;
      player1Name: string;
      player1Email: string;
      source: ImportSource;
      entryType?: RosterEntryType;
    })[],
    divisionId?: string,
  ) {
    return await this.db.transaction(async (tx) => {
      const tournament = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1)
        .then((res) => res[0]);

      if (!tournament) throw new BadRequestException('Giải đấu không tồn tại');

      let divisionMatchType = tournament.matchType;
      let divisionNames: string[] = [];
      if (divisionId) {
        const division = await tx
          .select()
          .from(schema.tournamentDivisions)
          .where(
            and(
              eq(schema.tournamentDivisions.id, divisionId),
              eq(schema.tournamentDivisions.tournamentId, tournamentId),
            ),
          )
          .limit(1)
          .then((res) => res[0]);

        if (!division) {
          throw new BadRequestException(
            'Nội dung thi đấu không thuộc giải này',
          );
        }
        divisionMatchType = division.matchType;
        divisionNames = [division.name];
      }

      const isDoubles =
        divisionMatchType === 'DOUBLES' ||
        divisionMatchType === 'MIXED_DOUBLES';

      if (!items.length) {
        throw new BadRequestException('Danh sách nhập không có dữ liệu hợp lệ');
      }

      await lockCapacityOwner(tx, { tournamentId, divisionId });
      const emails = getRosterEmails(items);
      const existingEmails = await findExistingRosterImportEmails(
        tournamentId,
        emails,
        tx,
      );
      const validation = validateRosterRows({
        items,
        isDoubles,
        matchType: divisionMatchType,
        tournamentConfig: tournament.tournamentConfig,
        divisionNames,
        existingEmails,
      });
      const invalidRow = validation.rows.find((row) => !row.isEligible);
      if (invalidRow) {
        const blockingStatus = invalidRow.status.find(isBlockingRosterStatus);
        if (blockingStatus) {
          throw new BadRequestException(
            getRosterValidationMessage(invalidRow.rowIndex, blockingStatus),
          );
        }
      }

      const limitCapacity = await readEffectiveCapacity(tx, {
        tournamentId,
        divisionId,
      });
      assertCapacityHasRoom(limitCapacity, validation.requestedTeamSlots);

      const eligibleAccountIds = await findEligibleRosterAccountIds(emails, tx);
      const rows: ImportPersistRow[] = items.map((item) => {
        const player1Name = item.player1Name.trim();
        const player2Name = item.player2Name?.trim() || '';
        const player1Email = normalizeRosterEmail(item.player1Email);
        const player2Email = item.player2Email
          ? normalizeRosterEmail(item.player2Email)
          : '';
        const importMetadata: Record<string, unknown> = {
          importedFrom: item.source,
          player1Email,
        };
        if (item.entryType === 'WILD_CARD_REQUEST') {
          importMetadata.entryType = 'WILD_CARD_REQUEST';
        }
        const player1Phone = item.player1Phone?.trim();
        const player2Phone = item.player2Phone?.trim();
        if (player1Phone) importMetadata.player1Phone = player1Phone;
        if (player2Name) importMetadata.player2Name = player2Name;
        if (player2Email) importMetadata.player2Email = player2Email;
        if (player2Phone) importMetadata.player2Phone = player2Phone;
        return {
          teamName: item.teamName.trim() || player1Name,
          player1Name,
          player1Email,
          player1Phone,
          player2Name,
          player2Email,
          player2Phone,
          elo: item.elo,
          isPaid: item.isPaid,
          autoApprove: item.autoApprove,
          customResponses: item.customResponses,
          importMetadata,
          registeredByUserId: eligibleAccountIds.get(player1Email) ?? null,
          partnerUserId:
            isDoubles && player2Email
              ? (eligibleAccountIds.get(player2Email) ?? null)
              : null,
        };
      });

      const { participants, linkedAccountNotifications } =
        await this.persistImportRows(tx, {
          tournamentId,
          managerUserId,
          tournament,
          divisionId,
          rows,
          strippedResponseKeys: IMPORT_OWNED_RESPONSE_KEYS,
        });

      return {
        importedCount: participants.length,
        linkedAccountNotifications,
        participants,
      };
    });
  }

  /**
   * Backward-compatible commit kept for the pre-roster endpoint: optional
   * emails, `GOOGLE_FORM` provenance, phone-based account matching and the
   * original doubles/singles row rules.
   */
  async importParticipants(
    tournamentId: string,
    managerUserId: string,
    items: LegacyImportItem[],
    divisionId?: string,
  ) {
    return await this.db.transaction(async (tx) => {
      const tournament = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1)
        .then((res) => res[0]);

      if (!tournament) throw new BadRequestException('Giải đấu không tồn tại');

      let divisionMatchType = tournament.matchType;
      if (divisionId) {
        const division = await tx
          .select()
          .from(schema.tournamentDivisions)
          .where(
            and(
              eq(schema.tournamentDivisions.id, divisionId),
              eq(schema.tournamentDivisions.tournamentId, tournamentId),
            ),
          )
          .limit(1)
          .then((res) => res[0]);

        if (!division) {
          throw new BadRequestException(
            'Nội dung thi đấu không thuộc giải này',
          );
        }
        divisionMatchType = division.matchType;
      }

      const isDoubles =
        divisionMatchType === 'DOUBLES' ||
        divisionMatchType === 'MIXED_DOUBLES';

      if (!items.length) {
        throw new BadRequestException('Danh sách nhập không có dữ liệu hợp lệ');
      }

      await lockCapacityOwner(tx, { tournamentId, divisionId });
      const limitCapacity = await readEffectiveCapacity(tx, {
        tournamentId,
        divisionId,
      });
      const capacityContext = {
        tournamentConfig: tournament.tournamentConfig,
      };
      assertCapacityHasRoom(
        limitCapacity,
        items.reduce(
          (requestedTeamSlots, item) =>
            requestedTeamSlots +
            calculateRequestedTeamSlots(
              divisionMatchType,
              item.player2Name?.trim() ? 2 : 1,
              capacityContext,
            ),
          0,
        ),
      );

      const rows: ImportPersistRow[] = [];
      for (const [itemIndex, item] of items.entries()) {
        const player1Name = item.player1Name?.trim();
        const player2Name = item.player2Name?.trim() || '';
        const teamName = item.teamName?.trim() || player1Name;
        const p1Email = item.player1Email?.trim()?.toLowerCase();
        const p2Email = item.player2Email?.trim()?.toLowerCase();
        const p1Phone = item.player1Phone?.trim();
        const p2Phone = item.player2Phone?.trim();
        const hasPlayer2Data = Boolean(player2Name || p2Email || p2Phone);

        if (!player1Name) {
          throw new BadRequestException(
            `Dòng ${itemIndex + 1} thiếu tên VĐV 1`,
          );
        }
        if (isDoubles && !player2Name) {
          throw new BadRequestException(
            `Dòng ${itemIndex + 1} của nội dung đôi thiếu VĐV 2`,
          );
        }
        if (!isDoubles && hasPlayer2Data) {
          throw new BadRequestException(
            `Dòng ${itemIndex + 1} của nội dung đơn có dữ liệu VĐV 2`,
          );
        }
        if (
          (p1Email && !ROSTER_EMAIL_PATTERN.test(p1Email)) ||
          (p2Email && !ROSTER_EMAIL_PATTERN.test(p2Email))
        ) {
          throw new BadRequestException(
            `Dòng ${itemIndex + 1} có email không hợp lệ`,
          );
        }
        if (p1Email && p2Email && p1Email === p2Email) {
          throw new BadRequestException(
            `Dòng ${itemIndex + 1} dùng trùng email cho hai VĐV`,
          );
        }

        const importMetadata: Record<string, unknown> = {
          importedFrom: 'GOOGLE_FORM',
        };
        if (p1Email) importMetadata.player1Email = p1Email;
        if (p1Phone) importMetadata.player1Phone = p1Phone;
        if (player2Name) importMetadata.player2Name = player2Name;
        if (p2Email) importMetadata.player2Email = p2Email;
        if (p2Phone) importMetadata.player2Phone = p2Phone;

        rows.push({
          teamName: teamName || 'Đội đăng ký',
          player1Name,
          player1Email: p1Email ?? '',
          player1Phone: p1Phone,
          player2Name,
          player2Email: p2Email ?? '',
          player2Phone: p2Phone,
          elo: item.elo,
          isPaid: item.isPaid,
          autoApprove: item.autoApprove,
          customResponses: item.customResponses,
          importMetadata,
          registeredByUserId: await findLegacyUser(tx, p1Email ?? '', p1Phone),
          partnerUserId:
            isDoubles && hasPlayer2Data
              ? await findLegacyUser(tx, p2Email ?? '', p2Phone)
              : null,
        });
      }

      const { participants, linkedAccountNotifications } =
        await this.persistImportRows(tx, {
          tournamentId,
          managerUserId,
          tournament,
          divisionId,
          rows,
          // Legacy behaviour: caller form answers survive exactly as before.
          strippedResponseKeys: [],
        });

      const unregisteredEmails = rows
        .filter((row) => row.player1Email && !row.registeredByUserId)
        .map((row) => ({
          email: row.player1Email,
          name: row.player1Name,
          teamName: row.teamName,
        }));

      return {
        importedCount: participants.length,
        unregisteredEmails,
        linkedAccountNotifications,
        participants,
      };
    });
  }

  /**
   * Single write path for both endpoints: entry fee is resolved once per batch.
   *
   * `strippedResponseKeys` is the only per-path difference: the strict roster
   * route removes import-owned keys from caller form answers before merging,
   * while the legacy route keeps its original behaviour and merges the caller's
   * answers untouched.
   */
  private async persistImportRows(
    tx: AppTx,
    context: {
      tournamentId: string;
      managerUserId: string;
      tournament: typeof schema.tournaments.$inferSelect;
      divisionId?: string;
      rows: ImportPersistRow[];
      strippedResponseKeys: readonly string[];
    },
  ): Promise<{
    participants: (typeof schema.tournamentParticipants.$inferSelect)[];
    linkedAccountNotifications: Array<{
      userId: string;
      status: 'COMPLETE' | 'PENDING_APPROVAL';
      divisionId: string | null;
    }>;
  }> {
    const {
      tournamentId,
      managerUserId,
      tournament,
      divisionId,
      rows,
      strippedResponseKeys,
    } = context;
    const entryFeeAtRegistration = (
      await this.tournamentPaymentRepository.resolveDivisionEntryFee(
        tx,
        tournament,
        divisionId,
      )
    ).toFixed(2);
    const participants: (typeof schema.tournamentParticipants.$inferSelect)[] =
      [];
    const linkedAccountNotifications: Array<{
      userId: string;
      status: 'COMPLETE' | 'PENDING_APPROVAL';
      divisionId: string | null;
    }> = [];

    for (const row of rows) {
      const teamStatus =
        row.autoApprove && (row.isPaid ?? true)
          ? 'COMPLETE'
          : 'PENDING_APPROVAL';

      const customResponses = { ...(row.customResponses ?? {}) };
      for (const key of strippedResponseKeys) {
        delete customResponses[key];
      }

      const [participant] = await tx
        .insert(schema.tournamentParticipants)
        .values({
          tournamentId,
          tournamentDivisionId: divisionId ?? null,
          registeredBy: row.registeredByUserId || managerUserId,
          teamName: row.teamName || 'Đội đăng ký',
          isPaid: row.isPaid ?? true,
          entryFeeAtRegistration,
          teamStatus,
          partnerUserId: row.partnerUserId || null,
          seed: row.elo ? Math.round(row.elo) : null,
          customResponses: {
            ...customResponses,
            ...row.importMetadata,
          },
        })
        .returning();

      for (const linkedUserId of new Set(
        [row.registeredByUserId, row.partnerUserId].filter(
          (value): value is string => Boolean(value),
        ),
      )) {
        await tx.insert(schema.tournamentRosters).values({
          participantId: participant.id,
          userId: linkedUserId,
          role: 'MAIN',
        });
        linkedAccountNotifications.push({
          userId: linkedUserId,
          status: teamStatus,
          divisionId: divisionId ?? null,
        });
      }

      participants.push(participant);
    }

    return { participants, linkedAccountNotifications };
  }
}
