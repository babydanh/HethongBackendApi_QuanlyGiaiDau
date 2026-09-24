import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb, AppDbOrTx } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNull,
  ne,
  notInArray,
  sql,
} from 'drizzle-orm';
import { AuditService, Transaction } from '../../audit/audit.service';
import {
  isLiteRegistrationTournament,
  isRegistrationFeePaid,
} from '../utils/registration-payment-eligibility';
import { TournamentPaymentRepository } from './tournament-payment.repository';
import { TournamentRatingRepository } from './tournament-rating.repository';

@Injectable()
export class TournamentLiteRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly auditService: AuditService,
    private readonly tournamentPaymentRepository: TournamentPaymentRepository,
    private readonly tournamentRatingRepository: TournamentRatingRepository,
  ) {}
  async countLiteActiveRosterUsers(tournamentId: string): Promise<number> {
    const [result] = await this.db
      .select({
        count: sql<number>`count(distinct ${schema.tournamentRosters.userId})`,
      })
      .from(schema.tournamentRosters)
      .innerJoin(
        schema.tournamentParticipants,
        eq(
          schema.tournamentRosters.participantId,
          schema.tournamentParticipants.id,
        ),
      )
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
          ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
          ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
        ),
      );
    return Number(result?.count ?? 0);
  }
  async findLiteParticipantsWithRosters(tournamentId: string) {
    const participants = await this.db
      .select()
      .from(schema.tournamentParticipants)
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
          ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
          ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
        ),
      )
      .orderBy(schema.tournamentParticipants.registeredAt);

    const pIds = participants.map((p) => p.id);
    const rosters =
      pIds.length > 0
        ? await this.db
            .select()
            .from(schema.tournamentRosters)
            .where(inArray(schema.tournamentRosters.participantId, pIds))
        : [];

    const rosterMap = new Map<string, typeof rosters>();
    for (const r of rosters) {
      const list = rosterMap.get(r.participantId) || [];
      list.push(r);
      rosterMap.set(r.participantId, list);
    }

    // Fetch user profiles for roster members
    const userIds = [...new Set(rosters.map((r) => r.userId))];
    const profiles =
      userIds.length > 0
        ? await this.db
            .select({
              userId: schema.profiles.userId,
              fullName: schema.profiles.fullName,
              avatarUrl: schema.profiles.avatarUrl,
            })
            .from(schema.profiles)
            .where(inArray(schema.profiles.userId, userIds))
        : [];
    const profileMap = new Map(profiles.map((p) => [p.userId, p]));

    return participants.map((p) => ({
      ...p,
      rosters: (rosterMap.get(p.id) || []).map((r) => ({
        ...r,
        profile: profileMap.get(r.userId) || null,
      })),
    }));
  }
  async findLitePendingPartnerParticipants(tournamentId: string) {
    const allParticipants =
      await this.findLiteParticipantsWithRosters(tournamentId);
    return allParticipants.filter(
      (p) =>
        p.teamStatus === 'PENDING_PARTNER' && (p.rosters?.length ?? 0) === 1,
    );
  }
  async hasNonDeletedStagesOrMatches(tournamentId: string): Promise<boolean> {
    const [stageCount] = await this.db
      .select({ count: count() })
      .from(schema.tournamentStages)
      .where(
        and(
          eq(schema.tournamentStages.tournamentId, tournamentId),
          isNull(schema.tournamentStages.deletedAt),
        ),
      );
    if (stageCount.count > 0) return true;

    const [matchCount] = await this.db
      .select({ count: count() })
      .from(schema.matches)
      .where(
        and(
          eq(schema.matches.tournamentId, tournamentId),
          isNull(schema.matches.deletedAt),
        ),
      );
    return matchCount.count > 0;
  }
  async pairLiteParticipantsInTx(
    tx: Transaction,
    tournamentId: string,
    p1Id: string,
    p2Id: string,
    userId: string,
    registrationMode: string,
    teamName: string,
  ) {
    // Lock participants in sorted order to prevent deadlocks
    const sortedIds = [p1Id, p2Id].sort();
    const lockedRows: Record<
      string,
      typeof schema.tournamentParticipants.$inferSelect
    > = {};

    for (const id of sortedIds) {
      const [p] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, id))
        .limit(1)
        .for('update');
      if (!p || p.tournamentId !== tournamentId) {
        throw new BadRequestException(`Participant ${id} không hợp lệ`);
      }
      lockedRows[id] = p;
    }

    const p1 = lockedRows[p1Id];
    const p2 = lockedRows[p2Id];

    if (p1Id === p2Id) {
      throw new BadRequestException('Không thể ghép cặp với chính mình');
    }

    // Idempotency: if p1 is already COMPLETE/PENDING_APPROVAL, p2 is WITHDRAWN,
    // and p2.registeredBy user is now rostered under p1 with exactly 2 rosters, return p1
    if (
      (p1.teamStatus === 'COMPLETE' || p1.teamStatus === 'PENDING_APPROVAL') &&
      p2.teamStatus === 'WITHDRAWN'
    ) {
      const p1RostersCheck = await tx
        .select()
        .from(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.participantId, p1Id));
      if (p1RostersCheck.length === 2) {
        // Verify p2's registeredBy user is one of p1's rosters
        const p2UserInP1 = p1RostersCheck.some(
          (r) => r.userId === p2.registeredBy,
        );
        if (p2UserInP1) {
          return p1;
        }
      }
    }

    // Reject non-PENDING_PARTNER states (idempotency check already handled COMPLETE/PENDING_APPROVAL)
    if (p1.teamStatus !== 'PENDING_PARTNER') {
      throw new BadRequestException(
        `Participant 1 đang ở trạng thái ${p1.teamStatus}, không thể ghép cặp`,
      );
    }
    if (p2.teamStatus !== 'PENDING_PARTNER') {
      throw new BadRequestException(
        `Participant 2 đang ở trạng thái ${p2.teamStatus}, không thể ghép cặp`,
      );
    }

    if (p1.tournamentDivisionId !== p2.tournamentDivisionId) {
      throw new BadRequestException(
        'Chỉ được ghép người chơi trong cùng một nội dung thi đấu.',
      );
    }

    // Check each has exactly 1 roster
    const p1Rosters = await tx
      .select()
      .from(schema.tournamentRosters)
      .where(eq(schema.tournamentRosters.participantId, p1Id));
    const p2Rosters = await tx
      .select()
      .from(schema.tournamentRosters)
      .where(eq(schema.tournamentRosters.participantId, p2Id));

    if (p1Rosters.length !== 1) {
      throw new BadRequestException('Participant 1 phải có đúng 1 thành viên');
    }
    if (p2Rosters.length !== 1) {
      throw new BadRequestException('Participant 2 phải có đúng 1 thành viên');
    }

    const [division] = p1.tournamentDivisionId
      ? await tx
          .select({
            matchType: schema.tournamentDivisions.matchType,
            genderRestriction: schema.tournamentDivisions.genderRestriction,
          })
          .from(schema.tournamentDivisions)
          .where(eq(schema.tournamentDivisions.id, p1.tournamentDivisionId))
          .limit(1)
      : [null];
    const profileRows = await tx
      .select({
        userId: schema.profiles.userId,
        gender: schema.profiles.gender,
      })
      .from(schema.profiles)
      .where(
        inArray(schema.profiles.userId, [
          p1Rosters[0].userId,
          p2Rosters[0].userId,
        ]),
      );
    const genders = new Map(
      profileRows.map((profile) => {
        const raw = (profile.gender || '').trim().toUpperCase();
        const normalized =
          raw === 'NAM' || raw === 'MALE'
            ? 'MALE'
            : raw === 'NỮ' || raw === 'NU' || raw === 'FEMALE'
              ? 'FEMALE'
              : null;
        return [profile.userId, normalized] as const;
      }),
    );
    const p1Gender = genders.get(p1Rosters[0].userId);
    const p2Gender = genders.get(p2Rosters[0].userId);
    const restriction = (division?.genderRestriction || '').toUpperCase();
    const hasGenderRestriction = ['MALE', 'FEMALE', 'MIXED'].includes(
      restriction,
    );
    if (hasGenderRestriction && (!p1Gender || !p2Gender)) {
      throw new BadRequestException(
        'Cả hai VĐV cần cập nhật giới tính trong hồ sơ trước khi BTC ghép đôi.',
      );
    }
    if (
      hasGenderRestriction &&
      ((restriction === 'MALE' &&
        (p1Gender !== 'MALE' || p2Gender !== 'MALE')) ||
        (restriction === 'FEMALE' &&
          (p1Gender !== 'FEMALE' || p2Gender !== 'FEMALE')) ||
        (restriction === 'MIXED' && p1Gender === p2Gender))
    ) {
      throw new BadRequestException(
        'Hai VĐV không phù hợp với giới hạn giới tính của nội dung thi đấu.',
      );
    }

    // Verify neither roster user already appears in another active participant
    const p2UserId = p2Rosters[0].userId;
    const allRostersCheck = await tx
      .select({ userId: schema.tournamentRosters.userId })
      .from(schema.tournamentRosters)
      .innerJoin(
        schema.tournamentParticipants,
        eq(
          schema.tournamentRosters.participantId,
          schema.tournamentParticipants.id,
        ),
      )
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
          ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
          ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
          eq(schema.tournamentRosters.userId, p2UserId),
          ne(schema.tournamentRosters.participantId, p2Id),
        ),
      );
    if (allRostersCheck.length > 0) {
      throw new BadRequestException(
        'Thành viên của Participant 2 đã tham gia đội khác trong giải này',
      );
    }

    // Move p2 roster to p1
    const p2Roster = p2Rosters[0];
    await tx
      .update(schema.tournamentRosters)
      .set({ participantId: p1Id })
      .where(eq(schema.tournamentRosters.id, p2Roster.id));

    // Update p1
    const [pairTournament] = await tx
      .select({ tournamentConfig: schema.tournaments.tournamentConfig })
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1);
    const tournamentConfig = pairTournament?.tournamentConfig;
    const targetStatus =
      registrationMode === 'APPROVAL' ? 'PENDING_APPROVAL' : 'COMPLETE';
    const isLitePairing =
      isLiteRegistrationTournament(tournamentConfig) ||
      registrationMode === 'LITE';
    const primaryCapturedPayment =
      await this.tournamentPaymentRepository.findCompletedParticipantPaymentInTx(
        tx,
        tournamentId,
        p1Id,
      );
    const registrationIsPaid = isRegistrationFeePaid({
      persistedIsPaid: p1.isPaid,
      feeSnapshot: p1.entryFeeAtRegistration,
      hasCompletedPayment: Boolean(primaryCapturedPayment),
      isLiteRegistration: isLitePairing,
    });
    const [updatedP1] = await tx
      .update(schema.tournamentParticipants)
      .set({
        teamStatus: targetStatus,
        isPaid: registrationIsPaid,
        teamInviteToken: null,
        teamName,
      })
      .where(eq(schema.tournamentParticipants.id, p1Id))
      .returning();

    // Mark p2 WITHDRAWN, clear token
    const [updatedP2] = await tx
      .update(schema.tournamentParticipants)
      .set({
        teamStatus: 'WITHDRAWN',
        teamInviteToken: null,
      })
      .where(eq(schema.tournamentParticipants.id, p2Id))
      .returning();

    // Audit
    await this.auditService.logUpdate(
      tx,
      userId,
      'tournament_participants',
      p1Id,
      p1,
      updatedP1,
    );
    await this.auditService.logUpdate(
      tx,
      userId,
      'tournament_participants',
      p2Id,
      p2,
      updatedP2,
    );

    return updatedP1;
  }
  async unpairParticipantInTx(
    tx: Transaction,
    tournamentId: string,
    participantId: string,
    userId: string,
  ) {
    // Lock participant
    const [participant] = await tx
      .select()
      .from(schema.tournamentParticipants)
      .where(eq(schema.tournamentParticipants.id, participantId))
      .limit(1)
      .for('update');

    if (!participant || participant.tournamentId !== tournamentId) {
      throw new BadRequestException('Participant không hợp lệ');
    }

    if (
      participant.teamStatus !== 'COMPLETE' &&
      participant.teamStatus !== 'PENDING_APPROVAL'
    ) {
      throw new BadRequestException(
        `Không thể tách cặp participant ở trạng thái ${participant.teamStatus}`,
      );
    }

    // Must have exactly 2 rosters
    const rosters = await tx
      .select()
      .from(schema.tournamentRosters)
      .where(eq(schema.tournamentRosters.participantId, participantId));

    if (rosters.length !== 2) {
      throw new BadRequestException(
        'Participant phải có đúng 2 thành viên để tách cặp',
      );
    }

    // Deterministic leader: roster whose userId == participant.registeredBy
    const leaderRoster = rosters.find(
      (r) => r.userId === participant.registeredBy,
    );
    const partnerRoster = rosters.find(
      (r) => r.userId !== participant.registeredBy,
    );

    if (!leaderRoster || !partnerRoster) {
      throw new BadRequestException(
        'Không thể xác định đội trưởng — lỗi dữ liệu.',
      );
    }

    const [pairingTournament] = await tx
      .select({ tournamentConfig: schema.tournaments.tournamentConfig })
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1);
    const pairingConfig = pairingTournament?.tournamentConfig;
    const isLitePairing =
      pairingConfig &&
      typeof pairingConfig === 'object' &&
      ((pairingConfig as Record<string, unknown>).isLite === true ||
        (pairingConfig as Record<string, unknown>).mode === 'LITE');

    // Create invite tokens
    const leaderToken = crypto
      .randomUUID()
      .replace(/-/g, '')
      .substring(0, 12)
      .toUpperCase();
    const partnerToken = crypto
      .randomUUID()
      .replace(/-/g, '')
      .substring(0, 12)
      .toUpperCase();

    // Get profile names
    const [leaderProfile] = await tx
      .select({ fullName: schema.profiles.fullName })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, leaderRoster.userId))
      .limit(1);
    const [partnerProfile] = await tx
      .select({ fullName: schema.profiles.fullName })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, partnerRoster.userId))
      .limit(1);

    // Create new participant for partner
    const [newParticipant] = await tx
      .insert(schema.tournamentParticipants)
      .values({
        tournamentId,
        tournamentDivisionId: participant.tournamentDivisionId,
        registeredBy: partnerRoster.userId,
        teamName: partnerProfile?.fullName || 'Vận động viên',
        isPaid: participant.isPaid,
        teamInviteToken: partnerToken,
        teamStatus: 'PENDING_PARTNER',
      })
      .returning();

    // Move partner roster to new participant
    await tx
      .update(schema.tournamentRosters)
      .set({ participantId: newParticipant.id })
      .where(eq(schema.tournamentRosters.id, partnerRoster.id));

    // Update original participant back to PENDING_PARTNER
    const [updatedOriginal] = await tx
      .update(schema.tournamentParticipants)
      .set({
        teamStatus: 'PENDING_PARTNER',
        isPaid: participant.isPaid,
        teamInviteToken: leaderToken,
        teamName: leaderProfile?.fullName || 'Vận động viên',
      })
      .where(eq(schema.tournamentParticipants.id, participantId))
      .returning();

    // Audit
    await this.auditService.logCreate(
      tx,
      userId,
      'tournament_participants',
      newParticipant.id,
      newParticipant,
    );
    await this.auditService.logUpdate(
      tx,
      userId,
      'tournament_participants',
      participantId,
      participant,
      updatedOriginal,
    );

    return { leader: updatedOriginal, partner: newParticipant };
  }
  /**
   * Check inside the transaction that the tournament is LITE DOUBLES and has no active bracket.
   * Call after locking the tournament row (FOR UPDATE).
   */
  private async assertLitePairableInTx(
    tx: Transaction,
    tournamentId: string,
  ): Promise<typeof schema.tournaments.$inferSelect> {
    const [tournament] = await tx
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1)
      .for('update');

    if (!tournament) throw new BadRequestException('Giải đấu không tồn tại');

    const tCfg = (tournament.tournamentConfig || {}) as Record<string, unknown>;
    const isLite = tCfg.isLite === true || tCfg.mode === 'LITE';
    const topLevelDoubles =
      tournament.matchType === 'DOUBLES' ||
      tournament.matchType === 'MIXED_DOUBLES';
    const [doublesDivision] = topLevelDoubles
      ? []
      : await tx
          .select({ matchType: schema.tournamentDivisions.matchType })
          .from(schema.tournamentDivisions)
          .where(
            and(
              eq(schema.tournamentDivisions.tournamentId, tournamentId),
              inArray(schema.tournamentDivisions.matchType, [
                'DOUBLES',
                'MIXED_DOUBLES',
              ]),
            ),
          )
          .limit(1);
    const hasDoublesDivision = topLevelDoubles || Boolean(doublesDivision);
    if (!isLite && !hasDoublesDivision) {
      throw new BadRequestException(
        'Thao tác này chỉ hỗ trợ giải Lite hoặc nội dung thi đấu đôi.',
      );
    }
    if (!hasDoublesDivision) {
      throw new BadRequestException('Ghép cặp chỉ hỗ trợ giải đấu đánh đôi.');
    }

    // Only block pairing if a match has already started or finished
    const [startedMatchCount] = await tx
      .select({ count: count() })
      .from(schema.matches)
      .where(
        and(
          eq(schema.matches.tournamentId, tournamentId),
          notInArray(schema.matches.status, [
            'SCHEDULED',
            'PENDING',
            'NOT_STARTED',
            'UPCOMING',
          ]),
          isNull(schema.matches.deletedAt),
        ),
      );
    if (startedMatchCount.count > 0) {
      throw new BadRequestException(
        'Không thể thay đổi ghép cặp sau khi giải đấu đã bắt đầu thi đấu.',
      );
    }

    return tournament;
  }
  /**
   * Check inside the transaction that the tournament is LITE DOUBLES before unpairing.
   * Does NOT reject if bracket/matches already exist; the existing bracket retains
   * the participant slot until regenerated.
   */
  private async assertLiteUnpairableInTx(
    tx: Transaction,
    tournamentId: string,
  ): Promise<typeof schema.tournaments.$inferSelect> {
    const [tournament] = await tx
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1)
      .for('update');

    if (!tournament) throw new BadRequestException('Giải đấu không tồn tại');

    const tCfg = (tournament.tournamentConfig || {}) as Record<string, unknown>;
    const isLite = tCfg.isLite === true || tCfg.mode === 'LITE';
    const topLevelDoubles =
      tournament.matchType === 'DOUBLES' ||
      tournament.matchType === 'MIXED_DOUBLES';
    const [doublesDivision] = topLevelDoubles
      ? []
      : await tx
          .select({ matchType: schema.tournamentDivisions.matchType })
          .from(schema.tournamentDivisions)
          .where(
            and(
              eq(schema.tournamentDivisions.tournamentId, tournamentId),
              inArray(schema.tournamentDivisions.matchType, [
                'DOUBLES',
                'MIXED_DOUBLES',
              ]),
            ),
          )
          .limit(1);
    const hasDoublesDivision = topLevelDoubles || Boolean(doublesDivision);
    if (!isLite && !hasDoublesDivision) {
      throw new BadRequestException(
        'Thao tác này chỉ hỗ trợ giải Lite hoặc nội dung thi đấu đôi.',
      );
    }
    if (!hasDoublesDivision) {
      throw new BadRequestException('Tách cặp chỉ hỗ trợ giải đấu đánh đôi.');
    }

    // Only block unpairing if a match has already started or finished
    const [startedMatchCount] = await tx
      .select({ count: count() })
      .from(schema.matches)
      .where(
        and(
          eq(schema.matches.tournamentId, tournamentId),
          ne(schema.matches.status, 'SCHEDULED'),
          isNull(schema.matches.deletedAt),
        ),
      );
    if (startedMatchCount.count > 0) {
      throw new BadRequestException(
        'Không thể tách cặp sau khi giải đấu đã bắt đầu thi đấu.',
      );
    }

    return tournament;
  }
  async lockTournamentAndPair(
    tournamentId: string,
    p1Id: string,
    p2Id: string,
    userId: string,
    registrationMode: string,
    teamName: string,
  ) {
    return await this.db.transaction(async (tx) => {
      // Lock tournament and validate LITE/DOUBLES/bracket-gate in one tx
      await this.assertLitePairableInTx(tx, tournamentId);
      return this.pairLiteParticipantsInTx(
        tx,
        tournamentId,
        p1Id,
        p2Id,
        userId,
        registrationMode,
        teamName,
      );
    });
  }
  async lockTournamentAndUnpair(
    tournamentId: string,
    participantId: string,
    userId: string,
  ) {
    return await this.db.transaction(async (tx) => {
      await this.assertLiteUnpairableInTx(tx, tournamentId);
      return this.unpairParticipantInTx(
        tx,
        tournamentId,
        participantId,
        userId,
      );
    });
  }
  async generateLitePairsTx(
    tournamentId: string,
    userId: string,
    strategy: 'RANDOM' | 'ELO_BALANCED',
  ) {
    return await this.db.transaction(async (tx) => {
      // Lock tournament and validate
      const tournament = await this.assertLitePairableInTx(tx, tournamentId);
      const rawRegistrationMode =
        (((tournament.tournamentConfig || {}) as Record<string, unknown>)
          .registrationMode as string) || 'OPEN';
      const registrationMode =
        rawRegistrationMode === 'APPROVAL' ? 'APPROVAL' : rawRegistrationMode;
      // Query pending participants INSIDE the transaction with FOR UPDATE (fixes TOCTOU + no lock outside tx)
      const pendingConditions = [
        eq(schema.tournamentParticipants.tournamentId, tournamentId),
        eq(schema.tournamentParticipants.teamStatus, 'PENDING_PARTNER'),
        // Only registrations that chose "BTC ghép đôi" have no invite token.
        // Keep direct invite/QR registrations out of the organizer queue.
        isNull(schema.tournamentParticipants.teamInviteToken),
      ];
      const pendingParticipants = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(and(...pendingConditions))
        .for('update')
        .orderBy(schema.tournamentParticipants.id); // deterministic order

      // Filter to those with exactly 1 roster; fetch rosters via tx
      const pIds = pendingParticipants.map((p) => p.id);
      const allRosters =
        pIds.length > 0
          ? await tx
              .select()
              .from(schema.tournamentRosters)
              .where(inArray(schema.tournamentRosters.participantId, pIds))
          : [];

      const rosterMap = new Map<string, typeof allRosters>();
      for (const r of allRosters) {
        const list = rosterMap.get(r.participantId) || [];
        list.push(r);
        rosterMap.set(r.participantId, list);
      }

      // Fetch profiles for roster users via tx
      const userIds = [...new Set(allRosters.map((r) => r.userId))];
      const profiles =
        userIds.length > 0
          ? await tx
              .select({
                userId: schema.profiles.userId,
                fullName: schema.profiles.fullName,
              })
              .from(schema.profiles)
              .where(inArray(schema.profiles.userId, userIds))
          : [];
      const profileMap = new Map(profiles.map((p) => [p.userId, p]));

      const pending = pendingParticipants
        .filter((p) => (rosterMap.get(p.id)?.length ?? 0) === 1)
        .map((p) => ({
          ...p,
          rosters: (rosterMap.get(p.id) || []).map((r) => ({
            ...r,
            profile: profileMap.get(r.userId) || null,
          })),
        }));

      if (pending.length < 2) {
        throw new BadRequestException(
          'Cần ít nhất 2 người chơi đang chờ ghép cặp.',
        );
      }

      const paired: Array<{
        participant1Id: string;
        participant2Id: string;
        teamName: string;
      }> = [];
      const unpairedIds: string[] = [];

      // A tournament may contain multiple divisions. Pair only within the
      // same division so a men's queue can never consume a mixed/women slot.
      const groups = new Map<string, typeof pending>();
      for (const participant of pending) {
        const key = participant.tournamentDivisionId || '__NO_DIVISION__';
        const group = groups.get(key) || [];
        group.push(participant);
        groups.set(key, group);
      }

      for (const group of groups.values()) {
        let ordered = [...group];
        if (strategy === 'RANDOM') {
          for (let i = ordered.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
          }
        } else {
          const eloEntries = await Promise.all(
            ordered.map(async (p) => {
              const rosterUser = p.rosters?.[0];
              const elo = rosterUser?.userId
                ? await this.tournamentRatingRepository.getUserEloInTx(
                    tx,
                    rosterUser.userId,
                    tournament.categoryId,
                    tournament.matchType,
                  )
                : 1000;
              return { participant: p, elo };
            }),
          );
          eloEntries.sort((a, b) => b.elo - a.elo);
          const sorted = eloEntries.map((entry) => entry.participant);
          const balanced: typeof pending = [];
          let left = 0;
          let right = sorted.length - 1;
          while (left <= right) {
            balanced.push(sorted[left]);
            if (left !== right) balanced.push(sorted[right]);
            left++;
            right--;
          }
          ordered = balanced;
        }

        for (let i = 0; i < ordered.length; i += 2) {
          if (i + 1 >= ordered.length) {
            unpairedIds.push(ordered[i].id);
            break;
          }
          const p1 = ordered[i];
          const p2 = ordered[i + 1];
          const p1User = p1.rosters?.[0]?.userId;
          const p2User = p2.rosters?.[0]?.userId;
          const p1Name =
            (p1User ? profileMap.get(p1User)?.fullName : null) || 'VĐV';
          const p2Name =
            (p2User ? profileMap.get(p2User)?.fullName : null) || 'VĐV';
          const teamName = `${p1Name} / ${p2Name}`;
          await this.pairLiteParticipantsInTx(
            tx,
            tournamentId,
            p1.id,
            p2.id,
            userId,
            registrationMode,
            teamName,
          );
          paired.push({
            participant1Id: p1.id,
            participant2Id: p2.id,
            teamName,
          });
        }
      }

      return {
        message: `Đã ghép ${paired.length} cặp thành công.`,
        paired,
        unpairedParticipantIds: unpairedIds,
        strategy,
      };
    });
  }
}
