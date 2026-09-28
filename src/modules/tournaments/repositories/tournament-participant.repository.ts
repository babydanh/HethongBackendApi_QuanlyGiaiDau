import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb, AppDbOrTx } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import type { RosterMember } from '../interfaces/tournament-config.interface';
import { PaymentStatus } from '../../../common/constants/enums';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  ne,
  notExists,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { AuditService, Transaction } from '../../audit/audit.service';
import { assertFootballRosterLockable } from '../utils/football-roster-lock';
import { validateFootballRosterSelection } from '../utils/football-roster-validation';
import {
  getRequiredFootballMainRosterCount,
  resolveFootballTeamConfig,
} from '../utils/football-team-config';
import { isRegistrationOpenStatus } from '../utils/registration-lifecycle';
import { TournamentPaymentRepository } from './tournament-payment.repository';

@Injectable()
export class TournamentParticipantRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly auditService: AuditService,
    private readonly tournamentPaymentRepository: TournamentPaymentRepository,
  ) {}
  async findLeaderByParticipantId(participantId: string) {
    const result = await this.db
      .select()
      .from(schema.tournamentRosters)
      .where(
        and(
          eq(schema.tournamentRosters.participantId, participantId),
          eq(schema.tournamentRosters.role, 'MAIN'),
        ),
      )
      .limit(1);
    return result[0] || null;
  }
  async countActiveParticipants(tournamentId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.tournamentParticipants)
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          notInArray(schema.tournamentParticipants.teamStatus, [
            'REJECTED',
            'WITHDRAWN',
            'KICKED',
            'EXPIRED',
            'CANCELLED',
          ]),
        ),
      );
    return result?.count || 0;
  }
  async findParticipantByTournamentAndUser(
    tournamentId: string,
    userId: string,
  ) {
    const [participant] = await this.db
      .select({ participant: schema.tournamentParticipants })
      .from(schema.tournamentParticipants)
      .innerJoin(
        schema.tournamentRosters,
        eq(
          schema.tournamentParticipants.id,
          schema.tournamentRosters.participantId,
        ),
      )
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          eq(schema.tournamentRosters.userId, userId),
          ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
          ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
          ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
        ),
      )
      .limit(1);
    return participant?.participant ?? null;
  }
  async countParticipants(tournamentId: string) {
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.tournamentParticipants)
      .where(eq(schema.tournamentParticipants.tournamentId, tournamentId));
    return result?.count ?? 0;
  }
  async findCommunitySports(communityId: string) {
    return this.db
      .select({
        categoryId: schema.communitySports.categoryId,
        categoryName: schema.categories.name,
      })
      .from(schema.communitySports)
      .innerJoin(
        schema.categories,
        eq(schema.communitySports.categoryId, schema.categories.id),
      )
      .where(eq(schema.communitySports.communityId, communityId));
  }
  async findFootballTeamForRegistration(teamId: string, userId: string) {
    const activeBan = this.db
      .select({ id: schema.userBans.id })
      .from(schema.userBans)
      .where(
        and(
          eq(schema.userBans.userId, schema.users.id),
          eq(schema.userBans.isActive, true),
          inArray(schema.userBans.banType, ['SOFT_BAN', 'HARD_BAN']),
          or(
            isNull(schema.userBans.expiresAt),
            gt(schema.userBans.expiresAt, new Date()),
          ),
        ),
      );
    const [team] = await this.db
      .select({
        team: schema.footballTeams,
        membership: schema.footballTeamMembers,
      })
      .from(schema.footballTeams)
      .innerJoin(
        schema.footballTeamMembers,
        and(
          eq(schema.footballTeamMembers.teamId, schema.footballTeams.id),
          eq(schema.footballTeamMembers.userId, userId),
          eq(schema.footballTeamMembers.status, 'ACTIVE'),
        ),
      )
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.footballTeamMembers.userId),
      )
      .where(
        and(
          eq(schema.footballTeams.id, teamId),
          isNull(schema.users.deletedAt),
          eq(schema.users.isMock, false),
          notExists(activeBan),
        ),
      )
      .limit(1);
    if (!team) return null;

    const members = await this.db
      .select({
        userId: schema.footballTeamMembers.userId,
        role: schema.footballTeamMembers.role,
      })
      .from(schema.footballTeamMembers)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.footballTeamMembers.userId),
      )
      .where(
        and(
          eq(schema.footballTeamMembers.teamId, teamId),
          eq(schema.footballTeamMembers.status, 'ACTIVE'),
          isNull(schema.users.deletedAt),
          eq(schema.users.isMock, false),
          notExists(activeBan),
        ),
      );
    return { ...team.team, membership: team.membership, members };
  }
  async findCommunityById(communityId: string) {
    const [record] = await this.db
      .select({
        id: schema.communities.id,
        name: schema.communities.name,
        creatorId: schema.communities.creatorId,
        visibility: schema.communities.visibility,
        joinMode: schema.communities.joinMode,
        logoUrl: schema.communities.logoUrl,
        bannerUrl: schema.communities.bannerUrl,
      })
      .from(schema.communities)
      .where(eq(schema.communities.id, communityId))
      .limit(1);
    return record || null;
  }
  async findCommunityMember(communityId: string, userId: string) {
    const records = await this.db
      .select()
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .limit(1);
    return records[0];
  }
  async addCommunityMember(
    communityId: string,
    userId: string,
    role: string = 'MEMBER',
    status: string = 'JOINED',
  ) {
    const existing = await this.findCommunityMember(communityId, userId);
    if (existing) {
      if (existing.status !== status && status === 'JOINED') {
        const [updated] = await this.db
          .update(schema.communityMembers)
          .set({ status: 'JOINED', joinedAt: new Date() })
          .where(eq(schema.communityMembers.id, existing.id))
          .returning();
        return updated;
      }
      return existing;
    }
    const [created] = await this.db
      .insert(schema.communityMembers)
      .values({
        communityId,
        userId,
        role,
        status,
        joinedAt: status === 'JOINED' ? new Date() : undefined,
      })
      .returning();
    return created;
  }
  async findUserProfile(userId: string) {
    const [profile] = await this.db
      .select({
        fullName: schema.profiles.fullName,
        phoneNumber: schema.profiles.phoneNumber,
        dateOfBirth: schema.profiles.dateOfBirth,
        gender: schema.profiles.gender,
        provinceCode: schema.profiles.provinceCode,
      })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId))
      .limit(1);

    return profile ?? null;
  }
  async findParticipants(
    tournamentId: string,
    categoryId: string,
    divisionId?: string,
    onlyEligible = false,
    includePaymentDetails = false,
  ): Promise<
    {
      id: string;
      teamName: string;
      footballTeamId: string | null;
      footballTeamLogoUrl: string | null;
      rosterLockedAt: Date | null;
      seed: number | null;
      isPaid: boolean;
      tournamentDivisionId: string | null;
      teamStatus: string;
      teamInviteToken: string | null;
      partnerInviteExpiresAt: Date | null;
      isWildcard: boolean;
      registeredAt: Date;
      customResponses: Record<string, unknown> | null;
      registeredBy: {
        id: string | null;
        fullName: string | null;
        avatarUrl: string | null;
        email: string | null;
      } | null;
      members: RosterMember[];
      payment: {
        id: string;
        amount: string;
        status: string;
        paymentGateway: string | null;
        transactionReference: string | null;
        providerTransactionId: string | null;
        providerOrderCode: string | null;
        paidAt: Date | null;
        receiptNumber: string | null;
        currency: string | null;
      } | null;
      eloPoints?: number;
    }[]
  > {
    // 1. Fetch participants and their registeredBy info
    const participants = await this.db
      .select({
        id: schema.tournamentParticipants.id,
        teamName: schema.tournamentParticipants.teamName,
        footballTeamId: schema.tournamentParticipants.footballTeamId,
        footballTeamLogoUrl: schema.tournamentParticipants.footballTeamLogoUrl,
        rosterLockedAt: schema.tournamentParticipants.rosterLockedAt,
        seed: schema.tournamentParticipants.seed,
        isPaid: schema.tournamentParticipants.isPaid,
        tournamentDivisionId:
          schema.tournamentParticipants.tournamentDivisionId,
        teamStatus: schema.tournamentParticipants.teamStatus,
        teamInviteToken: schema.tournamentParticipants.teamInviteToken,
        partnerInviteExpiresAt:
          schema.tournamentParticipants.partnerInviteExpiresAt,
        isWildcard: schema.tournamentParticipants.isWildcard,
        registeredAt: schema.tournamentParticipants.registeredAt,
        customResponses: schema.tournamentParticipants.customResponses,
        registeredBy: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
          email: schema.users.email,
          phoneNumber: schema.profiles.phoneNumber,
          gender: schema.profiles.gender,
        },
      })
      .from(schema.tournamentParticipants)
      .leftJoin(
        schema.users,
        eq(schema.tournamentParticipants.registeredBy, schema.users.id),
      )
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(
        divisionId
          ? and(
              eq(schema.tournamentParticipants.tournamentId, tournamentId),
              eq(
                schema.tournamentParticipants.tournamentDivisionId,
                divisionId,
              ),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
              ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
              ...(onlyEligible
                ? [
                    eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                    eq(schema.tournamentParticipants.isPaid, true),
                  ]
                : []),
            )
          : and(
              eq(schema.tournamentParticipants.tournamentId, tournamentId),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
              ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
              ...(onlyEligible
                ? [
                    eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                    eq(schema.tournamentParticipants.isPaid, true),
                  ]
                : []),
            ),
      );

    if (participants.length === 0) return [];

    // 2. Fetch rosters and ELO info for all participant IDs
    const participantIds = participants.map((p) => p.id);

    const paymentRows = includePaymentDetails
      ? await this.db
          .select({
            participantId: schema.payments.participantId,
            id: schema.payments.id,
            amount: schema.payments.amount,
            status: schema.payments.status,
            paymentGateway: schema.payments.paymentGateway,
            transactionReference: schema.payments.transactionReference,
            providerTransactionId: schema.payments.providerTransactionId,
            providerOrderCode: schema.payments.providerOrderCode,
            paidAt: schema.payments.paidAt,
            receiptNumber: schema.paymentReceipts.receiptNumber,
            currency: schema.paymentReceipts.currency,
          })
          .from(schema.payments)
          .leftJoin(
            schema.paymentReceipts,
            eq(schema.paymentReceipts.paymentId, schema.payments.id),
          )
          .where(
            and(
              inArray(schema.payments.participantId, participantIds),
              eq(schema.payments.purpose, 'REGISTRATION_FEE'),
            ),
          )
          .orderBy(desc(schema.payments.createdAt))
      : [];
    const paymentMap = new Map<string, (typeof paymentRows)[number]>();
    for (const payment of paymentRows) {
      if (!payment.participantId) continue;
      const current = paymentMap.get(payment.participantId);
      if (
        !current ||
        (payment.status === 'COMPLETED' && current.status !== 'COMPLETED')
      ) {
        paymentMap.set(payment.participantId, payment);
      }
    }

    const rosters = await this.db
      .select({
        participantId: schema.tournamentRosters.participantId,
        userId: schema.tournamentRosters.userId,
        email: schema.users.email,
        phoneNumber: schema.profiles.phoneNumber,
        gender: schema.profiles.gender,
        role: schema.tournamentRosters.role,
        isMock: schema.users.isMock,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
        eloPoints: schema.userRanks.eloPoints,
        tierName: schema.eloTiers.name,
        footballTeamEloPoints: schema.footballTeamRanks.eloPoints,
      })
      .from(schema.tournamentRosters)
      .leftJoin(
        schema.users,
        eq(schema.tournamentRosters.userId, schema.users.id),
      )
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .leftJoin(
        schema.tournamentParticipants,
        eq(
          schema.tournamentRosters.participantId,
          schema.tournamentParticipants.id,
        ),
      )
      .leftJoin(
        schema.userRanks,
        and(
          eq(schema.tournamentRosters.userId, schema.userRanks.userId),
          eq(schema.userRanks.categoryId, categoryId),
        ),
      )
      .leftJoin(
        schema.eloTiers,
        eq(schema.userRanks.tierId, schema.eloTiers.id),
      )
      .leftJoin(
        schema.footballTeamRanks,
        and(
          eq(
            schema.tournamentParticipants.footballTeamId,
            schema.footballTeamRanks.teamId,
          ),
          eq(schema.footballTeamRanks.categoryId, categoryId),
        ),
      )
      .where(inArray(schema.tournamentRosters.participantId, participantIds));

    // Group rosters by participantId
    const rostersMap = new Map<string, RosterMember[]>();
    for (const r of rosters) {
      const list = rostersMap.get(r.participantId) || [];
      list.push({
        userId: r.userId,
        email: r.email,
        phoneNumber: r.phoneNumber,
        gender: r.gender,
        fullName: r.fullName,
        avatarUrl: r.avatarUrl,
        role: r.role,
        isMock: r.isMock ?? false,
        elo: r.isMock
          ? {
              eloPoints: 1000,
              tierName: 'Chưa xếp hạng',
            }
          : {
              eloPoints: r.eloPoints ?? 1000,
              tierName: r.tierName ?? 'Beginner',
            },
      });
      rostersMap.set(r.participantId, list);
    }

    // 3. Batch query pair ELO if there are doubles teams
    const pairQueries: SQL[] = [];
    for (const members of rostersMap.values()) {
      if (members.length === 2) {
        const uids = members.map((m) => m.userId).sort();
        const andQuery = and(
          eq(schema.pairRanks.user1Id, uids[0]),
          eq(schema.pairRanks.user2Id, uids[1]),
          eq(schema.pairRanks.categoryId, categoryId),
        );
        if (andQuery) {
          pairQueries.push(andQuery);
        }
      }
    }

    const pairEloMap = new Map<string, number>();
    if (pairQueries.length > 0) {
      const dbPairs = await this.db
        .select({
          user1Id: schema.pairRanks.user1Id,
          user2Id: schema.pairRanks.user2Id,
          eloPoints: schema.pairRanks.eloPoints,
        })
        .from(schema.pairRanks)
        .where(or(...pairQueries));

      for (const p of dbPairs) {
        pairEloMap.set(`${p.user1Id}_${p.user2Id}`, p.eloPoints);
      }
    }

    return participants.map((p) => {
      const members = rostersMap.get(p.id) || [];
      let eloPoints = 1000;
      if (p.footballTeamId) {
        eloPoints =
          rosters.find((row) => row.participantId === p.id)
            ?.footballTeamEloPoints ?? 1000;
      } else if (members.length === 1) {
        eloPoints = members[0].elo?.eloPoints ?? 1000;
      } else if (members.length === 2) {
        const sortedUids = members.map((m) => m.userId).sort();
        const pairKey = `${sortedUids[0]}_${sortedUids[1]}`;
        eloPoints = pairEloMap.get(pairKey) ?? 1000;
      }
      return {
        ...p,
        customResponses:
          p.customResponses &&
          typeof p.customResponses === 'object' &&
          !Array.isArray(p.customResponses)
            ? (p.customResponses as Record<string, unknown>)
            : null,
        members,
        payment: includePaymentDetails ? (paymentMap.get(p.id) ?? null) : null,
        eloPoints,
      };
    });
  }
  async findPublicParticipants(
    tournamentId: string,
    categoryId: string,
    divisionId?: string,
  ) {
    const participants = await this.findParticipants(
      tournamentId,
      categoryId,
      divisionId,
      false,
      false,
    );
    // Public roster contains approved/active registrations and active pending registrations (e.g. pending partner/approval)
    // so that the public capacity count matches the listed entries.
    return participants
      .filter(
        (p) =>
          p.teamStatus === 'COMPLETE' ||
          p.teamStatus === 'PENDING_PARTNER' ||
          p.teamStatus === 'PENDING_APPROVAL',
      )
      .map((p) => {
        // Invite metadata is only for the authorized organizer projection.
        // Public roster responses must never expose a reusable partner token.
        const {
          teamInviteToken: _teamInviteToken,
          partnerInviteExpiresAt: _partnerInviteExpiresAt,
          isWildcard: _isWildcard,
          ...safeParticipant
        } = p;
        return {
          ...safeParticipant,
          customResponses: null,
          payment: null,
          registeredBy: p.registeredBy
            ? {
                id: p.registeredBy.id,
                fullName: p.registeredBy.fullName,
                avatarUrl: p.registeredBy.avatarUrl,
                email: null,
              }
            : null,
          members: p.members.map((m) => ({
            id: m.id,
            userId: m.userId,
            fullName: m.fullName,
            avatarUrl: m.avatarUrl,
            role: m.role,
            teamRole: m.teamRole,
            isTemporary: m.isTemporary,
            confirmedAt: m.confirmedAt,
            invitationToken: m.invitationToken,
            createdAt: m.createdAt,
            isMock: m.isMock,
            elo: m.elo,
          })),
        };
      });
  }
  async seedMockParticipants(
    tournamentId: string,
    names: string[],
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

      // Resolve the target division before deriving the participant format.
      // Never silently fall back to tournament.matchType for a multi-division
      // tournament: that can turn a singles mock into a doubles team.
      const divisionOwnerIds = [tournament.id, tournament.parentId].filter(
        (value): value is string => Boolean(value),
      );
      let effectiveDivisionId = divisionId;
      let matchType = tournament.matchType;

      if (divisionId) {
        const division = await tx
          .select()
          .from(schema.tournamentDivisions)
          .where(
            and(
              eq(schema.tournamentDivisions.id, divisionId),
              inArray(
                schema.tournamentDivisions.tournamentId,
                divisionOwnerIds,
              ),
            ),
          )
          .limit(1)
          .then((res) => res[0]);

        if (!division) {
          throw new BadRequestException(
            'Nội dung thi đấu không thuộc giải này',
          );
        }
        matchType = division.matchType;
      } else {
        const divisions = await tx
          .select({
            id: schema.tournamentDivisions.id,
            matchType: schema.tournamentDivisions.matchType,
          })
          .from(schema.tournamentDivisions)
          .where(
            inArray(schema.tournamentDivisions.tournamentId, divisionOwnerIds),
          )
          .orderBy(schema.tournamentDivisions.createdAt);

        if (divisions.length > 1) {
          throw new BadRequestException(
            'Giải có nhiều nội dung thi đấu, bắt buộc chọn divisionId khi sinh dữ liệu ảo',
          );
        }
        if (divisions.length === 1) {
          effectiveDivisionId = divisions[0].id;
          matchType = divisions[0].matchType;
        }
      }

      const isDoubles =
        matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES';
      const createdParticipants: (typeof schema.tournamentParticipants.$inferSelect)[] =
        [];

      if (isDoubles) {
        for (let i = 0; i < names.length; i += 2) {
          const name1 = names[i];
          const name2 = names[i + 1] || `${name1} Partner`;

          const mockEmail1 = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@mock.com`;
          const mockEmail2 = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@mock.com`;

          const [user1] = await tx
            .insert(schema.users)
            .values({ email: mockEmail1, isMock: true })
            .returning();
          await tx
            .insert(schema.profiles)
            .values({
              userId: user1.id,
              fullName: name1,
              allowStrangerMessages: false,
            })
            .returning();

          const [user2] = await tx
            .insert(schema.users)
            .values({ email: mockEmail2, isMock: true })
            .returning();
          await tx
            .insert(schema.profiles)
            .values({
              userId: user2.id,
              fullName: name2,
              allowStrangerMessages: false,
            })
            .returning();

          const teamName = `${name1} - ${name2}`;
          const [participant] = await tx
            .insert(schema.tournamentParticipants)
            .values({
              tournamentId,
              tournamentDivisionId: effectiveDivisionId ?? null,
              registeredBy: user1.id,
              teamName,
              isPaid: true,
              entryFeeAtRegistration: '0.00',
              teamInviteToken: null,
              teamStatus: 'COMPLETE',
              isMock: true,
            })
            .returning();

          await tx.insert(schema.tournamentRosters).values({
            participantId: participant.id,
            userId: user1.id,
            role: 'MAIN',
          });
          await tx.insert(schema.tournamentRosters).values({
            participantId: participant.id,
            userId: user2.id,
            role: 'MAIN',
          });

          createdParticipants.push(participant);
        }
      } else {
        for (const name of names) {
          const mockEmail = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@mock.com`;

          const [user] = await tx
            .insert(schema.users)
            .values({ email: mockEmail, isMock: true })
            .returning();
          await tx
            .insert(schema.profiles)
            .values({
              userId: user.id,
              fullName: name,
              allowStrangerMessages: false,
            })
            .returning();

          const [participant] = await tx
            .insert(schema.tournamentParticipants)
            .values({
              tournamentId,
              tournamentDivisionId: effectiveDivisionId ?? null,
              registeredBy: user.id,
              teamName: name,
              isPaid: true,
              teamInviteToken: null,
              teamStatus: 'COMPLETE',
              isMock: true,
            })
            .returning();

          await tx.insert(schema.tournamentRosters).values({
            participantId: participant.id,
            userId: user.id,
            role: 'MAIN',
          });

          createdParticipants.push(participant);
        }
      }

      // Gán seed dựa trên thứ tự tên (i+1) để hỗ trợ SEEDED bracket
      for (let idx = 0; idx < createdParticipants.length; idx++) {
        await tx
          .update(schema.tournamentParticipants)
          .set({ seed: idx + 1 })
          .where(
            eq(schema.tournamentParticipants.id, createdParticipants[idx].id),
          );
      }

      return createdParticipants;
    });
  }
  async clearMockParticipants(tournamentId: string, divisionId?: string) {
    return await this.db.transaction(async (tx) => {
      const tournament = await tx
        .select({
          id: schema.tournaments.id,
          parentId: schema.tournaments.parentId,
        })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1)
        .then((res) => res[0]);

      if (!tournament) throw new BadRequestException('Giải đấu không tồn tại');

      const divisionOwnerIds = [tournament.id, tournament.parentId].filter(
        (value): value is string => Boolean(value),
      );
      let effectiveDivisionId = divisionId;

      if (divisionId) {
        const division = await tx
          .select({ id: schema.tournamentDivisions.id })
          .from(schema.tournamentDivisions)
          .where(
            and(
              eq(schema.tournamentDivisions.id, divisionId),
              inArray(
                schema.tournamentDivisions.tournamentId,
                divisionOwnerIds,
              ),
            ),
          )
          .limit(1)
          .then((res) => res[0]);

        if (!division) {
          throw new BadRequestException(
            'Nội dung thi đấu không thuộc giải này',
          );
        }
      } else {
        const divisions = await tx
          .select({ id: schema.tournamentDivisions.id })
          .from(schema.tournamentDivisions)
          .where(
            inArray(schema.tournamentDivisions.tournamentId, divisionOwnerIds),
          )
          .orderBy(schema.tournamentDivisions.createdAt);

        if (divisions.length > 1) {
          throw new BadRequestException(
            'Giải có nhiều nội dung thi đấu, bắt buộc chọn divisionId khi dọn dữ liệu ảo',
          );
        }
        if (divisions.length === 1) {
          effectiveDivisionId = divisions[0].id;
        }
      }

      const mockParts = await tx
        .select({ id: schema.tournamentParticipants.id })
        .from(schema.tournamentParticipants)
        .where(
          effectiveDivisionId
            ? and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                eq(schema.tournamentParticipants.isMock, true),
                eq(
                  schema.tournamentParticipants.tournamentDivisionId,
                  effectiveDivisionId,
                ),
              )
            : and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                eq(schema.tournamentParticipants.isMock, true),
              ),
        );

      if (mockParts.length === 0) return { count: 0 };

      const partIds = mockParts.map((p) => p.id);

      const mockRosters = await tx
        .select({ userId: schema.tournamentRosters.userId })
        .from(schema.tournamentRosters)
        .where(inArray(schema.tournamentRosters.participantId, partIds));

      await tx
        .delete(schema.tournamentRosters)
        .where(inArray(schema.tournamentRosters.participantId, partIds));

      // Clear match participant references to prevent foreign key constraint violations
      await tx
        .update(schema.matches)
        .set({ participant1Id: null })
        .where(inArray(schema.matches.participant1Id, partIds));

      await tx
        .update(schema.matches)
        .set({ participant2Id: null })
        .where(inArray(schema.matches.participant2Id, partIds));

      await tx
        .update(schema.matches)
        .set({ winnerId: null })
        .where(inArray(schema.matches.winnerId, partIds));

      // Clear bracket stages, groups and matches for the tournament/division to clear the bracket
      await tx
        .delete(schema.tournamentStages)
        .where(
          divisionId
            ? and(
                eq(schema.tournamentStages.tournamentId, tournamentId),
                eq(schema.tournamentStages.tournamentDivisionId, divisionId),
              )
            : eq(schema.tournamentStages.tournamentId, tournamentId),
        );

      await tx
        .delete(schema.tournamentParticipants)
        .where(inArray(schema.tournamentParticipants.id, partIds));

      if (mockRosters.length > 0) {
        const userIds = mockRosters.map((r) => r.userId);
        await tx
          .delete(schema.profiles)
          .where(inArray(schema.profiles.userId, userIds));
        await tx
          .delete(schema.users)
          .where(
            and(
              inArray(schema.users.id, userIds),
              eq(schema.users.isMock, true),
            ),
          );
      }

      return { count: partIds.length };
    });
  }
  async deleteMockParticipant(tournamentId: string, participantId: string) {
    return await this.db.transaction(async (tx) => {
      const [participant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(
          and(
            eq(schema.tournamentParticipants.id, participantId),
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
          ),
        )
        .limit(1);

      if (!participant) {
        throw new BadRequestException('Không tìm thấy người tham gia');
      }

      if (!participant.isMock) {
        throw new BadRequestException(
          'Chỉ có thể xóa các VĐV giả lập bằng hành động này',
        );
      }

      const mockRosters = await tx
        .select({ userId: schema.tournamentRosters.userId })
        .from(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.participantId, participantId));

      await tx
        .delete(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.participantId, participantId));

      await tx
        .update(schema.matches)
        .set({ participant1Id: null })
        .where(eq(schema.matches.participant1Id, participantId));

      await tx
        .update(schema.matches)
        .set({ participant2Id: null })
        .where(eq(schema.matches.participant2Id, participantId));

      await tx
        .update(schema.matches)
        .set({ winnerId: null })
        .where(eq(schema.matches.winnerId, participantId));

      await tx
        .delete(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId));

      const userIds = Array.from(
        new Set(mockRosters.map((roster) => roster.userId)),
      );
      if (userIds.length > 0) {
        await tx
          .delete(schema.profiles)
          .where(inArray(schema.profiles.userId, userIds));
        await tx
          .delete(schema.users)
          .where(
            and(
              inArray(schema.users.id, userIds),
              eq(schema.users.isMock, true),
            ),
          );
      }

      return { count: 1 };
    });
  }
  async updateParticipantStatus(
    participantId: string,
    status: string,
    expectedCurrentStatus?: string,
  ) {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .limit(1);
      if (!existing) {
        return null;
      }

      if (
        status === 'REJECTED' &&
        (existing.teamStatus === 'COMPLETE' ||
          existing.teamStatus === 'APPROVED')
      ) {
        throw new BadRequestException(
          'Không thể từ chối đội đã được duyệt hoặc hoàn tất đăng ký.',
        );
      }

      const [updated] = await tx
        .update(schema.tournamentParticipants)
        .set({ teamStatus: status })
        .where(
          expectedCurrentStatus
            ? and(
                eq(schema.tournamentParticipants.id, participantId),
                eq(
                  schema.tournamentParticipants.teamStatus,
                  expectedCurrentStatus,
                ),
              )
            : eq(schema.tournamentParticipants.id, participantId),
        )
        .returning();
      if (!updated) {
        return null;
      }

      if (status === 'REJECTED') {
        await this.tournamentPaymentRepository.invalidatePendingParticipantPayments(
          tx,
          existing.tournamentId,
          participantId,
          'PARTICIPANT_REJECTED',
        );
      }

      return updated;
    });
  }
  /**
   * Assign the next available seed to an approved participant without
   * changing any existing seed positions. The tournament-level advisory lock
   * prevents two approvals from receiving the same next seed.
   */
  async assignNextAvailableSeed(tournamentId: string, participantId: string) {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`tournament-seeding:${tournamentId}`}))`,
      );

      const [participant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(
          and(
            eq(schema.tournamentParticipants.id, participantId),
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
          ),
        )
        .for('update')
        .limit(1);

      if (!participant || participant.seed != null) {
        return participant ?? null;
      }

      const [highestSeed] = await tx
        .select({
          maxSeed: sql<
            number | null
          >`max(${schema.tournamentParticipants.seed})`,
        })
        .from(schema.tournamentParticipants)
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            participant.tournamentDivisionId
              ? eq(
                  schema.tournamentParticipants.tournamentDivisionId,
                  participant.tournamentDivisionId,
                )
              : isNull(schema.tournamentParticipants.tournamentDivisionId),
            sql`${schema.tournamentParticipants.seed} IS NOT NULL`,
          ),
        );

      const nextSeed = Number(highestSeed?.maxSeed ?? 0) + 1;
      const [updated] = await tx
        .update(schema.tournamentParticipants)
        .set({ seed: nextSeed })
        .where(
          and(
            eq(schema.tournamentParticipants.id, participantId),
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            isNull(schema.tournamentParticipants.seed),
          ),
        )
        .returning();

      return updated ?? participant;
    });
  }
  async lockParticipantRoster(participantId: string, userId: string) {
    return this.db.transaction(async (tx) => {
      const [participant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .for('update')
        .limit(1);
      if (!participant) return null;
      if (
        participant.teamStatus !== 'COMPLETE' &&
        participant.teamStatus !== 'APPROVED'
      ) {
        throw new BadRequestException(
          'Chỉ đội đã hoàn tất đăng ký mới được khóa roster.',
        );
      }
      if (participant.rosterLockedAt) return participant;
      if (participant.footballTeamId && participant.tournamentDivisionId) {
        const [entry] = await tx
          .select()
          .from(schema.tournamentTeamEntries)
          .where(
            and(
              eq(
                schema.tournamentTeamEntries.tournamentId,
                participant.tournamentId,
              ),
              eq(
                schema.tournamentTeamEntries.divisionId,
                participant.tournamentDivisionId,
              ),
              eq(
                schema.tournamentTeamEntries.teamId,
                participant.footballTeamId,
              ),
            ),
          )
          .for('update')
          .limit(1);
        const snapshots = entry
          ? await tx
              .select({
                confirmationStatus:
                  schema.tournamentTeamRosterSnapshots.confirmationStatus,
                role: schema.tournamentTeamRosterSnapshots.role,
              })
              .from(schema.tournamentTeamRosterSnapshots)
              .where(eq(schema.tournamentTeamRosterSnapshots.entryId, entry.id))
              .for('update')
          : [];
        const [tournamentConfigRow] = await tx
          .select({ tournamentConfig: schema.tournaments.tournamentConfig })
          .from(schema.tournaments)
          .where(eq(schema.tournaments.id, participant.tournamentId))
          .limit(1);
        assertFootballRosterLockable({
          entryExists: Boolean(entry),
          entryStatus: entry?.status,
          confirmations: snapshots.map(
            (row) =>
              row.confirmationStatus as 'PENDING' | 'CONFIRMED' | 'DECLINED',
          ),
          mainRosterCount: snapshots.filter((row) => row.role === 'MAIN')
            .length,
          requiredMainRosterCount: getRequiredFootballMainRosterCount(
            tournamentConfigRow?.tournamentConfig,
          ),
        });
        if (entry?.status === 'CONFIRMED') {
          const [lockedEntry] = await tx
            .update(schema.tournamentTeamEntries)
            .set({
              status: 'LOCKED',
              lockedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(schema.tournamentTeamEntries.id, entry.id))
            .returning();
          await this.auditService.logUpdate(
            tx,
            userId,
            'tournament_team_entries',
            entry.id,
            entry,
            lockedEntry,
          );
        }
      }
      const [updated] = await tx
        .update(schema.tournamentParticipants)
        .set({ rosterLockedAt: new Date() })
        .where(eq(schema.tournamentParticipants.id, participantId))
        .returning();
      if (updated) {
        await this.auditService.logUpdate(
          tx,
          userId,
          'tournament_participants',
          participantId,
          participant,
          updated,
        );
      }
      return updated ?? null;
    });
  }
  async unlockParticipantRoster(participantId: string, userId: string) {
    return this.db.transaction(async (tx) => {
      const [participant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .for('update')
        .limit(1);
      if (!participant) return null;

      let entry: typeof schema.tournamentTeamEntries.$inferSelect | undefined;
      if (participant.footballTeamId && participant.tournamentDivisionId) {
        [entry] = await tx
          .select()
          .from(schema.tournamentTeamEntries)
          .where(
            and(
              eq(
                schema.tournamentTeamEntries.tournamentId,
                participant.tournamentId,
              ),
              eq(
                schema.tournamentTeamEntries.divisionId,
                participant.tournamentDivisionId,
              ),
              eq(
                schema.tournamentTeamEntries.teamId,
                participant.footballTeamId,
              ),
            ),
          )
          .for('update')
          .limit(1);
      }

      if (entry?.status === 'LOCKED') {
        const [unlockedEntry] = await tx
          .update(schema.tournamentTeamEntries)
          .set({ status: 'CONFIRMED', lockedAt: null, updatedAt: new Date() })
          .where(eq(schema.tournamentTeamEntries.id, entry.id))
          .returning();
        await this.auditService.logUpdate(
          tx,
          userId,
          'tournament_team_entries',
          entry.id,
          entry,
          unlockedEntry,
        );
      }

      if (!participant.rosterLockedAt) return participant;
      const [updated] = await tx
        .update(schema.tournamentParticipants)
        .set({ rosterLockedAt: null })
        .where(eq(schema.tournamentParticipants.id, participantId))
        .returning();
      if (updated) {
        await this.auditService.logUpdate(
          tx,
          userId,
          'tournament_participants',
          participantId,
          participant,
          updated,
        );
      }
      return updated ?? participant;
    });
  }
  async findFootballEntryForParticipant(participantId: string) {
    const [row] = await this.db
      .select({
        entry: schema.tournamentTeamEntries,
        participant: {
          tournamentId: schema.tournamentParticipants.tournamentId,
          divisionId: schema.tournamentParticipants.tournamentDivisionId,
          teamId: schema.tournamentParticipants.footballTeamId,
        },
      })
      .from(schema.tournamentParticipants)
      .leftJoin(
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
      .where(eq(schema.tournamentParticipants.id, participantId))
      .limit(1);
    return row ?? null;
  }
  async getFootballEntryRoster(entryId: string) {
    return this.db
      .select({
        id: schema.tournamentTeamRosterSnapshots.id,
        userId: schema.tournamentTeamRosterSnapshots.userId,
        role: schema.tournamentTeamRosterSnapshots.role,
        confirmationStatus:
          schema.tournamentTeamRosterSnapshots.confirmationStatus,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.tournamentTeamRosterSnapshots)
      .leftJoin(
        schema.profiles,
        eq(schema.profiles.userId, schema.tournamentTeamRosterSnapshots.userId),
      )
      .where(eq(schema.tournamentTeamRosterSnapshots.entryId, entryId));
  }
  async respondFootballRoster(
    entryId: string,
    userId: string,
    action: 'CONFIRM' | 'DECLINE',
  ) {
    return this.db.transaction(async (tx) => {
      const [snapshot] = await tx
        .select()
        .from(schema.tournamentTeamRosterSnapshots)
        .where(
          and(
            eq(schema.tournamentTeamRosterSnapshots.entryId, entryId),
            eq(schema.tournamentTeamRosterSnapshots.userId, userId),
          ),
        )
        .for('update')
        .limit(1);
      if (!snapshot)
        throw new NotFoundException(
          'Bạn không nằm trong roster đăng ký đội này.',
        );

      await tx
        .update(schema.tournamentTeamRosterSnapshots)
        .set({
          confirmationStatus: action === 'CONFIRM' ? 'CONFIRMED' : 'DECLINED',
        })
        .where(eq(schema.tournamentTeamRosterSnapshots.id, snapshot.id));

      const remaining = await tx
        .select({
          confirmationStatus:
            schema.tournamentTeamRosterSnapshots.confirmationStatus,
          role: schema.tournamentTeamRosterSnapshots.role,
        })
        .from(schema.tournamentTeamRosterSnapshots)
        .where(eq(schema.tournamentTeamRosterSnapshots.entryId, entryId));
      const [entry] = await tx
        .select({
          tournamentId: schema.tournamentTeamEntries.tournamentId,
        })
        .from(schema.tournamentTeamEntries)
        .where(eq(schema.tournamentTeamEntries.id, entryId))
        .limit(1);
      const [tournamentConfigRow] = entry
        ? await tx
            .select({
              tournamentConfig: schema.tournaments.tournamentConfig,
            })
            .from(schema.tournaments)
            .where(eq(schema.tournaments.id, entry.tournamentId))
            .limit(1)
        : [];
      const hasDeclined = remaining.some(
        (row) => row.confirmationStatus === 'DECLINED',
      );
      const hasPending = remaining.some(
        (row) => row.confirmationStatus === 'PENDING',
      );
      const hasUndersizedMainRoster =
        remaining.filter((row) => row.role === 'MAIN').length <
        getRequiredFootballMainRosterCount(
          tournamentConfigRow?.tournamentConfig,
        );
      const nextStatus = hasUndersizedMainRoster
        ? 'DRAFT'
        : hasDeclined || hasPending
          ? 'PENDING_CONFIRMATION'
          : 'CONFIRMED';
      await tx
        .update(schema.tournamentTeamEntries)
        .set({
          status: nextStatus,
          confirmedAt: nextStatus === 'CONFIRMED' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(schema.tournamentTeamEntries.id, entryId));
      return {
        entryId,
        confirmationStatus: action === 'CONFIRM' ? 'CONFIRMED' : 'DECLINED',
        status: nextStatus,
      };
    });
  }
  async updateFootballRoster(
    participantId: string,
    mainMemberIds: string[],
    reserveMemberIds: string[],
    actorUserId: string,
  ) {
    return this.db.transaction(async (tx) => {
      const [participant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .for('update')
        .limit(1);
      if (!participant?.footballTeamId || !participant.tournamentDivisionId) {
        throw new NotFoundException('Đăng ký đội bóng không tồn tại.');
      }
      if (participant.rosterLockedAt) {
        throw new BadRequestException('Roster đã khóa, không thể thay đổi.');
      }

      const [entry] = await tx
        .select()
        .from(schema.tournamentTeamEntries)
        .where(
          and(
            eq(
              schema.tournamentTeamEntries.tournamentId,
              participant.tournamentId,
            ),
            eq(
              schema.tournamentTeamEntries.divisionId,
              participant.tournamentDivisionId,
            ),
            eq(schema.tournamentTeamEntries.teamId, participant.footballTeamId),
          ),
        )
        .for('update')
        .limit(1);
      if (!entry) {
        throw new NotFoundException('Roster đội bóng chưa được tạo.');
      }
      if (entry.status === 'LOCKED') {
        throw new BadRequestException('Roster đã khóa, không thể thay đổi.');
      }

      const [tournament] = await tx
        .select({ tournamentConfig: schema.tournaments.tournamentConfig })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, participant.tournamentId))
        .limit(1);
      const activeMemberBan = tx
        .select({ id: schema.userBans.id })
        .from(schema.userBans)
        .where(
          and(
            eq(schema.userBans.userId, schema.users.id),
            eq(schema.userBans.isActive, true),
            inArray(schema.userBans.banType, ['SOFT_BAN', 'HARD_BAN']),
            or(
              isNull(schema.userBans.expiresAt),
              gt(schema.userBans.expiresAt, new Date()),
            ),
          ),
        );
      const teamMembers = await tx
        .select({ userId: schema.footballTeamMembers.userId })
        .from(schema.footballTeamMembers)
        .innerJoin(
          schema.users,
          eq(schema.users.id, schema.footballTeamMembers.userId),
        )
        .where(
          and(
            eq(schema.footballTeamMembers.teamId, participant.footballTeamId),
            eq(schema.footballTeamMembers.status, 'ACTIVE'),
            isNull(schema.users.deletedAt),
            eq(schema.users.isMock, false),
            notExists(activeMemberBan),
          ),
        );
      const teamConfig =
        tournament?.tournamentConfig &&
        typeof tournament.tournamentConfig === 'object' &&
        !Array.isArray(tournament.tournamentConfig)
          ? (tournament.tournamentConfig as Record<string, unknown>)
          : {};
      const resolvedTeamConfig = resolveFootballTeamConfig(teamConfig);
      const teamSize = resolvedTeamConfig.mainSize;
      const maxReserve = resolvedTeamConfig.maxReserve;
      const maxTeamSize = resolvedTeamConfig.maxTotalSize;
      const roster = validateFootballRosterSelection({
        leaderId: participant.registeredBy,
        memberIds: mainMemberIds,
        reserveMemberIds,
        activeMemberIds: new Set(teamMembers.map((member) => member.userId)),
        minMainSize: 1,
        maxMainSize: teamSize,
        maxReserve,
        maxTotalSize: maxTeamSize,
      });

      const duplicateRows = await tx
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
            eq(
              schema.tournamentParticipants.tournamentId,
              participant.tournamentId,
            ),
            ne(schema.tournamentParticipants.id, participantId),
            inArray(schema.tournamentRosters.userId, roster.allMemberIds),
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
            ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
            ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
            ne(schema.tournamentParticipants.teamStatus, 'EXPIRED'),
          ),
        );
      if (duplicateRows.length > 0) {
        throw new BadRequestException(
          'Một hoặc nhiều thành viên đã đăng ký nội dung khác trong giải đấu này.',
        );
      }

      await tx
        .delete(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.participantId, participantId));
      await tx.insert(schema.tournamentRosters).values(
        roster.mainMemberIds.map((userId) => ({
          participantId,
          userId,
          role: 'MAIN' as const,
        })),
      );
      if (roster.reserveMemberIds.length > 0) {
        await tx.insert(schema.tournamentRosters).values(
          roster.reserveMemberIds.map((userId) => ({
            participantId,
            userId,
            role: 'RESERVE' as const,
          })),
        );
      }

      await tx
        .delete(schema.tournamentTeamRosterSnapshots)
        .where(eq(schema.tournamentTeamRosterSnapshots.entryId, entry.id));
      const snapshots = [...roster.mainMemberIds, ...roster.reserveMemberIds];
      await tx.insert(schema.tournamentTeamRosterSnapshots).values(
        snapshots.map((userId) => ({
          entryId: entry.id,
          userId,
          role: roster.mainMemberIds.includes(userId)
            ? ('MAIN' as const)
            : ('RESERVE' as const),
          confirmationStatus:
            userId === participant.registeredBy
              ? ('CONFIRMED' as const)
              : ('PENDING' as const),
        })),
      );
      const requiredMainRosterCount = getRequiredFootballMainRosterCount(
        tournament?.tournamentConfig,
      );
      const nextStatus =
        roster.mainMemberIds.length < requiredMainRosterCount
          ? 'DRAFT'
          : roster.mainMemberIds.length === 1 &&
              roster.reserveMemberIds.length === 0
            ? 'CONFIRMED'
            : 'PENDING_CONFIRMATION';
      const registrationConfig =
        tournament?.tournamentConfig &&
        typeof tournament.tournamentConfig === 'object' &&
        !Array.isArray(tournament.tournamentConfig)
          ? (tournament.tournamentConfig as Record<string, unknown>)
          : {};
      const nextParticipantStatus =
        roster.mainMemberIds.length < requiredMainRosterCount
          ? 'PENDING'
          : registrationConfig.registrationMode === 'APPROVAL'
            ? 'PENDING_APPROVAL'
            : 'COMPLETE';
      const [updatedEntry] = await tx
        .update(schema.tournamentTeamEntries)
        .set({
          status: nextStatus,
          confirmedAt: nextStatus === 'CONFIRMED' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(schema.tournamentTeamEntries.id, entry.id))
        .returning();
      await tx
        .update(schema.tournamentParticipants)
        .set({ teamStatus: nextParticipantStatus })
        .where(eq(schema.tournamentParticipants.id, participantId));
      await this.auditService.logUpdate(
        tx,
        actorUserId,
        'tournament_team_entries',
        entry.id,
        entry,
        updatedEntry,
      );
      return {
        entry: updatedEntry,
        roster: snapshots.map((userId) => ({
          userId,
          role: roster.mainMemberIds.includes(userId) ? 'MAIN' : 'RESERVE',
          confirmationStatus:
            userId === participant.registeredBy ? 'CONFIRMED' : 'PENDING',
        })),
      };
    });
  }
  async lockFootballEntry(entryId: string, userId: string) {
    return this.db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(schema.tournamentTeamEntries)
        .where(eq(schema.tournamentTeamEntries.id, entryId))
        .for('update')
        .limit(1);
      if (!entry)
        throw new NotFoundException('Đăng ký đội bóng không tồn tại.');
      if (entry.status === 'LOCKED') return entry;
      const snapshots = await tx
        .select({
          confirmationStatus:
            schema.tournamentTeamRosterSnapshots.confirmationStatus,
          role: schema.tournamentTeamRosterSnapshots.role,
        })
        .from(schema.tournamentTeamRosterSnapshots)
        .where(eq(schema.tournamentTeamRosterSnapshots.entryId, entryId))
        .for('update');
      const [tournamentConfigRow] = await tx
        .select({ tournamentConfig: schema.tournaments.tournamentConfig })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, entry.tournamentId))
        .limit(1);
      assertFootballRosterLockable({
        entryExists: true,
        entryStatus: entry.status,
        confirmations: snapshots.map(
          (row) =>
            row.confirmationStatus as 'PENDING' | 'CONFIRMED' | 'DECLINED',
        ),
        mainRosterCount: snapshots.filter((row) => row.role === 'MAIN').length,
        requiredMainRosterCount: getRequiredFootballMainRosterCount(
          tournamentConfigRow?.tournamentConfig,
        ),
      });
      const [updated] = await tx
        .update(schema.tournamentTeamEntries)
        .set({ status: 'LOCKED', lockedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.tournamentTeamEntries.id, entryId))
        .returning();
      await this.auditService.logUpdate(
        tx,
        userId,
        'tournament_team_entries',
        entryId,
        entry,
        updated,
      );
      return updated;
    });
  }
  async findParticipantById(participantId: string) {
    const [participant] = await this.db
      .select()
      .from(schema.tournamentParticipants)
      .where(eq(schema.tournamentParticipants.id, participantId))
      .limit(1);
    return participant;
  }
  async isUserParticipant(
    tournamentId: string,
    userId: string,
  ): Promise<boolean> {
    const [p] = await this.db
      .select({ id: schema.tournamentParticipants.id })
      .from(schema.tournamentParticipants)
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          or(
            eq(schema.tournamentParticipants.registeredBy, userId),
            eq(schema.tournamentParticipants.partnerUserId, userId),
          ),
          ne(schema.tournamentParticipants.teamStatus, 'CANCELLED'),
          ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
        ),
      )
      .limit(1);
    if (p) return true;

    const [roster] = await this.db
      .select({ id: schema.tournamentRosters.id })
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
          eq(schema.tournamentRosters.userId, userId),
          ne(schema.tournamentRosters.status, 'REMOVED'),
        ),
      )
      .limit(1);
    return !!roster;
  }
  async getParticipantRosters(participantId: string) {
    return this.db
      .select({
        userId: schema.tournamentRosters.userId,
        role: schema.tournamentRosters.role,
      })
      .from(schema.tournamentRosters)
      .where(eq(schema.tournamentRosters.participantId, participantId));
  }
  /** Team sport: đội trưởng thêm 1 thành viên vào đội (role MAIN/RESERVE). */
  async addRoster(
    participantId: string,
    userId: string,
    role: 'MAIN' | 'RESERVE',
    maxTeamSize?: number,
  ) {
    return this.db.transaction(async (tx) => {
      const [participant] = await tx
        .select({
          id: schema.tournamentParticipants.id,
          rosterLockedAt: schema.tournamentParticipants.rosterLockedAt,
        })
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .for('update')
        .limit(1);
      if (!participant)
        throw new NotFoundException('Đội thi đấu không tồn tại.');
      if (participant.rosterLockedAt) {
        throw new BadRequestException(
          'Roster đội đã được khóa, không thể thêm thành viên.',
        );
      }
      const existing = await tx
        .select({ id: schema.tournamentRosters.id })
        .from(schema.tournamentRosters)
        .where(
          and(
            eq(schema.tournamentRosters.participantId, participantId),
            eq(schema.tournamentRosters.userId, userId),
          ),
        )
        .limit(1);
      if (existing.length > 0)
        throw new BadRequestException('Thành viên này đã có trong đội.');
      if (maxTeamSize !== undefined) {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.tournamentRosters)
          .where(eq(schema.tournamentRosters.participantId, participantId));
        if (Number(count) >= maxTeamSize)
          throw new BadRequestException('Đội đã đạt số thành viên tối đa.');
      }
      const [row] = await tx
        .insert(schema.tournamentRosters)
        .values({ participantId, userId, role })
        .returning();
      return row;
    });
  }
  /** Team sport: đội trưởng xoá thành viên khỏi đội. */
  async removeRoster(participantId: string, userId: string) {
    return this.db.transaction(async (tx) => {
      const [participant] = await tx
        .select({
          id: schema.tournamentParticipants.id,
          rosterLockedAt: schema.tournamentParticipants.rosterLockedAt,
        })
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .for('update')
        .limit(1);
      if (!participant)
        throw new NotFoundException('Đội thi đấu không tồn tại.');
      if (participant.rosterLockedAt) {
        throw new BadRequestException(
          'Roster đội đã được khóa, không thể xóa thành viên.',
        );
      }
      const deleted = await tx
        .delete(schema.tournamentRosters)
        .where(
          and(
            eq(schema.tournamentRosters.participantId, participantId),
            eq(schema.tournamentRosters.userId, userId),
          ),
        )
        .returning();
      if (deleted.length === 0)
        throw new BadRequestException(
          'Không tìm thấy thành viên này trong đội.',
        );
      return deleted[0];
    });
  }
  async findUserByEmailOrPhone(emailOrPhone: string) {
    const [user] = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(
        or(
          eq(schema.users.email, emailOrPhone),
          eq(schema.profiles.phoneNumber, emailOrPhone),
        ),
      )
      .limit(1);
    return user;
  }
  async assignReservedSlot(
    tournamentId: string,
    userId: string,
    teamName: string,
    partnerId?: string,
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
          throw new BadRequestException('Hình thức thi đấu không hợp lệ.');
        }

        divisionMatchType = division.matchType;
      }

      const isDoubles =
        divisionMatchType === 'DOUBLES' ||
        divisionMatchType === 'MIXED_DOUBLES';
      const teamStatus = isDoubles
        ? partnerId
          ? 'COMPLETE'
          : 'PENDING_PARTNER'
        : 'COMPLETE';

      const [participant] = await tx
        .insert(schema.tournamentParticipants)
        .values({
          tournamentId,
          tournamentDivisionId: divisionId ?? null,
          registeredBy: userId,
          teamName: teamName || 'Đội khách mời',
          isPaid: true,
          entryFeeAtRegistration: (
            await this.tournamentPaymentRepository.resolveDivisionEntryFee(
              tx,
              tournament,
              divisionId,
            )
          ).toFixed(2),
          isWildcard: true,
          teamStatus,
        })
        .returning();

      await tx.insert(schema.tournamentRosters).values({
        participantId: participant.id,
        userId: userId,
        role: 'MAIN',
      });

      if (isDoubles && partnerId) {
        await tx.insert(schema.tournamentRosters).values({
          participantId: participant.id,
          userId: partnerId,
          role: 'MAIN',
        });
      }

      return participant;
    });
  }
  async findUserByEmail(email: string) {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    return user;
  }
  async findUserBasicById(userId: string) {
    const [user] = await this.db
      .select({
        id: schema.users.id,
        fullName: schema.profiles.fullName,
        email: schema.users.email,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.users.id, userId))
      .limit(1);
    return user || null;
  }
}
