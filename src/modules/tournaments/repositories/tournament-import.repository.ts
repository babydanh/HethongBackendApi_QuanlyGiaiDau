import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb, AppTx } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import {
  and,
  asc,
  eq,
  exists,
  inArray,
  isNull,
  like,
  ne,
  notExists,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { TournamentPaymentRepository } from './tournament-payment.repository';
import {
  assertCapacityHasRoom,
  lockCapacityOwner,
  readEffectiveCapacity,
} from '../services/tournament-capacity.service';
import { calculateRequestedTeamSlots } from '../utils/tournament-participant-status';
import { resolveFootballTeamConfig } from '../utils/football-team-config';
import {
  findEligibleRosterAccountIds,
  findExistingRosterImportEmails,
  eligibleRosterAccountCondition,
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
import type {
  AddAthleteCandidateDto,
  AddAthleteDirectDto,
  ListAddAthleteCandidatesQueryDto,
} from '../dto/add-athlete.dto';

const INACTIVE_PARTICIPANT_STATUSES = [
  'WITHDRAWN',
  'REJECTED',
  'KICKED',
  'EXPIRED',
  'CANCELLED',
] as const;

function escapeLikeQuery(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function assertRegularAddOpen(
  tournament: typeof schema.tournaments.$inferSelect,
  division: typeof schema.tournamentDivisions.$inferSelect | null,
): void {
  if (tournament.status === 'COMPLETED') {
    throw new BadRequestException('Giải đấu đã kết thúc');
  }
  if (
    tournament.status === 'REGISTRATION_CLOSED' ||
    tournament.isRegistrationLocked ||
    division?.isRegistrationLocked
  ) {
    throw new BadRequestException(
      'Đăng ký đã được khóa. Không thể thêm VĐV.',
    );
  }
}

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
type AddAthleteRepositoryResult = {
  participant: {
    participantId: string;
    teamName: string;
    teamStatus: string;
    rosterRole?: 'MAIN' | 'RESERVE';
  };
  divisionId: string | null;
  linkedAccountNotifications: Array<{
    rosterId: string;
    userId: string;
    status: string;
    divisionId: string | null;
  }>;
  footballRosterConfirmation?: {
    participantId: string;
    divisionId: string | null;
    userId: string;
  };
};

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
  async listAddAthleteCandidates(
    tournamentId: string,
    organizerId: string,
    communityId: string | null,
    dto: ListAddAthleteCandidatesQueryDto,
  ): Promise<{ items: Array<{ userId: string; fullName: string }> }> {
    let teamId: string | undefined;
    if (dto.participantId) {
      const [target] = await this.db
        .select({
          teamId: schema.tournamentParticipants.footballTeamId,
          teamStatus: schema.tournamentParticipants.teamStatus,
          rosterLockedAt: schema.tournamentParticipants.rosterLockedAt,
          entryStatus: schema.tournamentTeamEntries.status,
        })
        .from(schema.tournamentParticipants)
        .innerJoin(
          schema.tournamentTeamEntries,
          and(
            eq(
              schema.tournamentTeamEntries.tournamentId,
              schema.tournamentParticipants.tournamentId,
            ),
            eq(
              schema.tournamentTeamEntries.divisionId,
              schema.tournamentParticipants.tournamentDivisionId,
            ),
            eq(
              schema.tournamentTeamEntries.teamId,
              schema.tournamentParticipants.footballTeamId,
            ),
          ),
        )
        .where(
          and(
            eq(schema.tournamentParticipants.id, dto.participantId),
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
          ),
        )
        .limit(1);
      if (
        !target?.teamId ||
        target.rosterLockedAt ||
        !['PENDING', 'PENDING_APPROVAL', 'COMPLETE', 'APPROVED'].includes(
          target.teamStatus,
        ) ||
        !['DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED'].includes(
          target.entryStatus,
        )
      ) {
        throw new BadRequestException('Roster đội bóng không thể cập nhật.');
      }
      teamId = target.teamId;
    }

    if (dto.source === 'CLUB' && !communityId) {
      return { items: [] };
    }

    const friendship = this.db
      .select({ id: schema.friendships.id })
      .from(schema.friendships)
      .where(
        and(
          eq(schema.friendships.status, 'ACCEPTED'),
          isNull(schema.friendships.deletedAt),
          or(
            and(
              eq(schema.friendships.senderId, organizerId),
              eq(schema.friendships.receiverId, schema.users.id),
            ),
            and(
              eq(schema.friendships.receiverId, organizerId),
              eq(schema.friendships.senderId, schema.users.id),
            ),
          ),
        ),
      );
    const communityMembership = this.db
      .select({ id: schema.communityMembers.id })
      .from(schema.communityMembers)
      .innerJoin(
        schema.communities,
        eq(schema.communities.id, schema.communityMembers.communityId),
      )
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId ?? ''),
          eq(schema.communityMembers.userId, schema.users.id),
          eq(schema.communityMembers.status, 'JOINED'),
          eq(schema.communities.status, 'ACTIVE'),
          isNull(schema.communities.deletedAt),
        ),
      );
    const activeRoster = this.db
      .select({ id: schema.tournamentRosters.id })
      .from(schema.tournamentRosters)
      .innerJoin(
        schema.tournamentParticipants,
        eq(
          schema.tournamentParticipants.id,
          schema.tournamentRosters.participantId,
        ),
      )
      .where(
        and(
          eq(schema.tournamentRosters.userId, schema.users.id),
          eq(schema.tournamentRosters.status, 'ACTIVE'),
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          notInArray(
            schema.tournamentParticipants.teamStatus,
            INACTIVE_PARTICIPANT_STATUSES,
          ),
        ),
      );
    const activeTeamMembership = teamId
      ? this.db
          .select({ id: schema.footballTeamMembers.id })
          .from(schema.footballTeamMembers)
          .where(
            and(
              eq(schema.footballTeamMembers.teamId, teamId),
              eq(schema.footballTeamMembers.userId, schema.users.id),
              eq(schema.footballTeamMembers.status, 'ACTIVE'),
            ),
          )
      : undefined;
    const search = dto.q?.trim();
    const trimmedName = sql<string>`btrim(${schema.profiles.fullName})`;
    const rows = await this.db
      .select({ userId: schema.users.id, fullName: trimmedName })
      .from(schema.users)
      .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
      .where(
        and(
          eligibleRosterAccountCondition(this.db),
          sql`btrim(${schema.profiles.fullName}) <> ''`,
          dto.source === 'FRIENDS' ? ne(schema.users.id, organizerId) : undefined,
          dto.source === 'FRIENDS'
            ? exists(friendship)
            : exists(communityMembership),
          search
            ? like(
                schema.profiles.fullName,
                `%${escapeLikeQuery(search)}%`,
              )
            : undefined,
        ),
      )
      .orderBy(asc(trimmedName), asc(schema.users.id))
      .limit(dto.limit ?? 25);

    return { items: rows };
  }

  async addAthleteCandidate(
    tournamentId: string,
    organizerId: string,
    dto: AddAthleteCandidateDto,
  ): Promise<AddAthleteRepositoryResult> {
    if (dto.participantId) {
      throw new BadRequestException(
        'Football roster additions use the participant repository.',
      );
    }

    return this.db.transaction(async (tx) => {
      await lockCapacityOwner(tx, {
        tournamentId,
        divisionId: dto.tournamentDivisionId,
      });
      const { tournament, division } = await this.loadRegularAddScope(
        tx,
        tournamentId,
        dto.tournamentDivisionId,
      );
      assertRegularAddOpen(tournament, division);
      if (
        resolveFootballTeamConfig(tournament.tournamentConfig).isTeamSport
      ) {
        throw new BadRequestException(
          'Nội dung đội bóng cần thêm VĐV vào đội hiện có.',
        );
      }

      await this.assertCandidateRelationship(
        tx,
        tournament.communityId,
        organizerId,
        dto.source,
        dto.userId,
      );
      const candidate = await this.findEligibleAddAthlete(tx, dto.userId);
      if (!candidate) {
        throw new ConflictException('Ứng viên không còn đủ điều kiện.');
      }
      await this.assertNoActiveRoster(tx, tournamentId, dto.userId);

      const capacity = await readEffectiveCapacity(tx, {
        tournamentId,
        divisionId: dto.tournamentDivisionId,
      });
      assertCapacityHasRoom(
        capacity,
        calculateRequestedTeamSlots(
          division?.matchType ?? tournament.matchType,
          1,
          { tournamentConfig: tournament.tournamentConfig },
        ),
      );
      const entryFeeAtRegistration = (
        await this.tournamentPaymentRepository.resolveDivisionEntryFee(
          tx,
          tournament,
          dto.tournamentDivisionId,
        )
      ).toFixed(2);
      const [participant] = await tx
        .insert(schema.tournamentParticipants)
        .values({
          tournamentId,
          tournamentDivisionId: dto.tournamentDivisionId ?? null,
          registeredBy: organizerId,
          teamName: candidate.fullName,
          entryFeeAtRegistration,
          teamStatus: 'PENDING_APPROVAL',
        })
        .returning();
      const [roster] = await tx
        .insert(schema.tournamentRosters)
        .values({ participantId: participant.id, userId: dto.userId, role: 'MAIN' })
        .returning({ id: schema.tournamentRosters.id });

      return {
        participant: {
          participantId: participant.id,
          teamName: participant.teamName,
          teamStatus: participant.teamStatus,
        },
        divisionId: participant.tournamentDivisionId,
        linkedAccountNotifications: [
          {
            rosterId: roster.id,
            userId: dto.userId,
            status: participant.teamStatus,
            divisionId: participant.tournamentDivisionId,
          },
        ],
      };
    });
  }

  async addDirectAthlete(
    tournamentId: string,
    organizerId: string,
    dto: AddAthleteDirectDto,
  ): Promise<AddAthleteRepositoryResult> {
    return this.db.transaction(async (tx) => {
      await lockCapacityOwner(tx, {
        tournamentId,
        divisionId: dto.tournamentDivisionId,
      });
      const { tournament, division } = await this.loadRegularAddScope(
        tx,
        tournamentId,
        dto.tournamentDivisionId,
      );
      assertRegularAddOpen(tournament, division);
      if (
        resolveFootballTeamConfig(tournament.tournamentConfig).isTeamSport
      ) {
        throw new BadRequestException(
          'Không thể thêm tên trực tiếp vào nội dung đội bóng.',
        );
      }

      const capacity = await readEffectiveCapacity(tx, {
        tournamentId,
        divisionId: dto.tournamentDivisionId,
      });
      assertCapacityHasRoom(
        capacity,
        calculateRequestedTeamSlots(
          division?.matchType ?? tournament.matchType,
          1,
          { tournamentConfig: tournament.tournamentConfig },
        ),
      );
      const entryFeeAtRegistration = (
        await this.tournamentPaymentRepository.resolveDivisionEntryFee(
          tx,
          tournament,
          dto.tournamentDivisionId,
        )
      ).toFixed(2);
      const [participant] = await tx
        .insert(schema.tournamentParticipants)
        .values({
          tournamentId,
          tournamentDivisionId: dto.tournamentDivisionId ?? null,
          registeredBy: organizerId,
          teamName: dto.name,
          entryFeeAtRegistration,
          teamStatus: 'PENDING_APPROVAL',
          customResponses: { importedFrom: 'ORGANIZER_DIRECT' },
        })
        .returning();

      return {
        participant: {
          participantId: participant.id,
          teamName: participant.teamName,
          teamStatus: participant.teamStatus,
        },
        divisionId: participant.tournamentDivisionId,
        linkedAccountNotifications: [],
      };
    });
  }

  private async loadRegularAddScope(
    tx: AppTx,
    tournamentId: string,
    divisionId?: string,
  ) {
    const [tournament] = await tx
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let division: typeof schema.tournamentDivisions.$inferSelect | null = null;
    if (divisionId) {
      const [foundDivision] = await tx
        .select()
        .from(schema.tournamentDivisions)
        .where(
          and(
            eq(schema.tournamentDivisions.id, divisionId),
            eq(schema.tournamentDivisions.tournamentId, tournamentId),
          ),
        )
        .limit(1);
      if (!foundDivision) {
        throw new BadRequestException('Nội dung thi đấu không thuộc giải này.');
      }
      division = foundDivision;
    }
    return { tournament, division };
  }

  private async assertCandidateRelationship(
    tx: AppTx,
    communityId: string | null,
    organizerId: string,
    source: AddAthleteCandidateDto['source'],
    candidateId: string,
  ): Promise<void> {
    if (source === 'FRIENDS') {
      const [friendship] = await tx
        .select({ id: schema.friendships.id })
        .from(schema.friendships)
        .where(
          and(
            eq(schema.friendships.status, 'ACCEPTED'),
            isNull(schema.friendships.deletedAt),
            or(
              and(
                eq(schema.friendships.senderId, organizerId),
                eq(schema.friendships.receiverId, candidateId),
              ),
              and(
                eq(schema.friendships.receiverId, organizerId),
                eq(schema.friendships.senderId, candidateId),
              ),
            ),
          ),
        )
        .for('update')
        .limit(1);
      if (!friendship || candidateId === organizerId) {
        throw new ConflictException('Quan hệ bạn bè không còn hợp lệ.');
      }
      return;
    }

    if (!communityId) {
      throw new ConflictException('Thành viên CLB không còn hợp lệ.');
    }
    const [membership] = await tx
      .select({ id: schema.communityMembers.id })
      .from(schema.communityMembers)
      .innerJoin(
        schema.communities,
        eq(schema.communities.id, schema.communityMembers.communityId),
      )
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId),
          eq(schema.communityMembers.userId, candidateId),
          eq(schema.communityMembers.status, 'JOINED'),
          eq(schema.communities.status, 'ACTIVE'),
          isNull(schema.communities.deletedAt),
        ),
      )
      .for('update')
      .limit(1);
    if (!membership) {
      throw new ConflictException('Thành viên CLB không còn hợp lệ.');
    }
  }

  private async findEligibleAddAthlete(tx: AppTx, userId: string) {
    const trimmedName = sql<string>`btrim(${schema.profiles.fullName})`;
    const [candidate] = await tx
      .select({ userId: schema.users.id, fullName: trimmedName })
      .from(schema.users)
      .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
      .where(
        and(
          eq(schema.users.id, userId),
          eligibleRosterAccountCondition(tx),
          sql`btrim(${schema.profiles.fullName}) <> ''`,
        ),
      )
      .for('update')
      .limit(1);
    return candidate;
  }

  private async assertNoActiveRoster(
    tx: AppTx,
    tournamentId: string,
    userId: string,
  ): Promise<void> {
    const [existingRoster] = await tx
      .select({ id: schema.tournamentRosters.id })
      .from(schema.tournamentRosters)
      .innerJoin(
        schema.tournamentParticipants,
        eq(
          schema.tournamentParticipants.id,
          schema.tournamentRosters.participantId,
        ),
      )
      .where(
        and(
          eq(schema.tournamentRosters.userId, userId),
          eq(schema.tournamentRosters.status, 'ACTIVE'),
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          notInArray(
            schema.tournamentParticipants.teamStatus,
            INACTIVE_PARTICIPANT_STATUSES,
          ),
        ),
      )
      .for('update')
      .limit(1);
    if (existingRoster) {
      throw new ConflictException('VĐV đã có roster đang hoạt động trong giải.');
    }
  }

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
      rosterId: string;
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
      rosterId: string;
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
        const [rosterRow] = await tx
          .insert(schema.tournamentRosters)
          .values({
            participantId: participant.id,
            userId: linkedUserId,
            role: 'MAIN',
          })
          .returning({ id: schema.tournamentRosters.id });
        linkedAccountNotifications.push({
          rosterId: rosterRow.id,
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
