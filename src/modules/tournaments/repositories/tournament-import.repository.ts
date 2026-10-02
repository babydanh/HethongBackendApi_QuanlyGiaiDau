import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import { and, eq } from 'drizzle-orm';
import { TournamentPaymentRepository } from './tournament-payment.repository';
import {
  assertCapacityHasRoom,
  lockCapacityOwner,
  readEffectiveCapacity,
} from '../services/tournament-capacity.service';
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
import type {
  ImportSource,
  RosterEntryType,
} from '../dto/import-participants.dto';
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
            : Math.max(
                0,
                capacity.maxTeamSlots - capacity.occupiedTeamSlots,
              ),
      };
    });
  }

  async importParticipants(
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

      const eligibleAccountIds = await findEligibleRosterAccountIds(
        emails,
        tx,
      );
      const results: (typeof schema.tournamentParticipants.$inferSelect)[] = [];
      const linkedAccountNotifications: Array<{
        userId: string;
        status: 'COMPLETE' | 'PENDING_APPROVAL';
        divisionId: string | null;
      }> = [];

      for (const item of items) {
        const player1Name = item.player1Name.trim();
        const player2Name = item.player2Name?.trim() || '';
        const teamName = item.teamName.trim() || player1Name;
        const p1Email = normalizeRosterEmail(item.player1Email);
        const p2Email = item.player2Email
          ? normalizeRosterEmail(item.player2Email)
          : '';
        const p1Phone = item.player1Phone?.trim();
        const p2Phone = item.player2Phone?.trim();
        const user1Id = eligibleAccountIds.get(p1Email) ?? null;
        const user2Id =
          isDoubles && p2Email
            ? (eligibleAccountIds.get(p2Email) ?? null)
            : null;
        const teamStatus =
          item.autoApprove && (item.isPaid ?? true)
            ? 'COMPLETE'
            : 'PENDING_APPROVAL';

        const importMetadata: Record<string, unknown> = {
          importedFrom: item.source,
          player1Email: p1Email,
        };
        if (item.entryType === 'WILD_CARD_REQUEST') {
          importMetadata.entryType = 'WILD_CARD_REQUEST';
        }
        if (p1Phone) importMetadata.player1Phone = p1Phone;
        if (player2Name) importMetadata.player2Name = player2Name;
        if (p2Email) importMetadata.player2Email = p2Email;
        if (p2Phone) importMetadata.player2Phone = p2Phone;

        const customResponses = { ...(item.customResponses ?? {}) };
        for (const key of [
          'importedFrom',
          'entryType',
          'player1Email',
          'player1Phone',
          'player2Name',
          'player2Email',
          'player2Phone',
        ]) {
          delete customResponses[key];
        }

        const [participant] = await tx
          .insert(schema.tournamentParticipants)
          .values({
            tournamentId,
            tournamentDivisionId: divisionId ?? null,
            registeredBy: user1Id || managerUserId,
            teamName: teamName || 'Đội đăng ký',
            isPaid: item.isPaid ?? true,
            entryFeeAtRegistration: (
              await this.tournamentPaymentRepository.resolveDivisionEntryFee(
                tx,
                tournament,
                divisionId,
              )
            ).toFixed(2),
            teamStatus,
            partnerUserId: user2Id || null,
            seed: item.elo ? Math.round(item.elo) : null,
            // Import-owned fields must come from validated request fields;
            // unrelated form answers remain untouched.
            customResponses: {
              ...customResponses,
              ...importMetadata,
            },
          })
          .returning();

        if (user1Id) {
          await tx.insert(schema.tournamentRosters).values({
            participantId: participant.id,
            userId: user1Id,
            role: 'MAIN',
          });
        }

        if (user2Id) {
          await tx.insert(schema.tournamentRosters).values({
            participantId: participant.id,
            userId: user2Id,
            role: 'MAIN',
          });
        }

        for (const linkedUserId of new Set(
          [user1Id, user2Id].filter((value): value is string => Boolean(value)),
        )) {
          linkedAccountNotifications.push({
            userId: linkedUserId,
            status: teamStatus,
            divisionId: divisionId ?? null,
          });
        }

        results.push(participant);
      }

      return {
        importedCount: results.length,
        linkedAccountNotifications,
        participants: results,
      };
    });
  }
}
