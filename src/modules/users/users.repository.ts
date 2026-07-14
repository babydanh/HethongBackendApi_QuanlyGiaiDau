import { Injectable, Inject } from '@nestjs/common';
import type { AppDb } from '../../database/db.types';
import { eq, or, and, ilike, desc, asc, isNull, count, inArray, type SQL } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';
import { QueryUserDto } from './dto/query-user.dto';
import type {
  ReportCategory,
  ReportTargetType,
} from './dto/create-report.dto';
import type { QueryMyReportsDto } from './dto/query-my-reports.dto';

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  async findAll(query: QueryUserDto) {
    const { page, limit, search, order } = query;
    const offset = (page! - 1) * limit!;

    let whereClause = and(
      isNull(schema.users.deletedAt),
      eq(schema.users.isMock, false),
    )!;
    if (search) {
      whereClause = and(
        or(
          ilike(schema.users.email, `%${search}%`),
          ilike(schema.profiles.fullName, `%${search}%`),
        ),
        isNull(schema.users.deletedAt),
        eq(schema.users.isMock, false),
      )!;
    }

    const sortConfig =
      order === 'desc'
        ? desc(schema.users.createdAt)
        : asc(schema.users.createdAt);

    const data = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        isEmailVerified: schema.users.isEmailVerified,
        createdAt: schema.users.createdAt,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
        isVerified: schema.profiles.isVerified,
        banType: schema.userBans.banType,
        banReason: schema.userBans.reason,
        banExpiresAt: schema.userBans.expiresAt,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .leftJoin(
        schema.userBans,
        and(
          eq(schema.users.id, schema.userBans.userId),
          eq(schema.userBans.isActive, true),
        ),
      )
      .where(whereClause)
      .limit(limit!)
      .offset(offset)
      .orderBy(sortConfig);

    // Simple count (in real app we should do a proper count query)
    const countResult = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(whereClause);

    const total = countResult.length;

    const mappedData = data.map((row) => ({
      id: row.id,
      email: row.email,
      isEmailVerified: row.isEmailVerified,
      createdAt: row.createdAt,
      profile: {
        fullName: row.fullName || '',
        avatarUrl: row.avatarUrl || undefined,
        isVerified: row.isVerified || false,
      },
      activeBan: row.banType ? {
        banType: row.banType as 'WARN' | 'SOFT_BAN' | 'HARD_BAN',
        reason: row.banReason || '',
        expiresAt: row.banExpiresAt ? row.banExpiresAt.toISOString() : undefined,
      } : undefined,
    }));

    return {
      data: mappedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit!),
      },
    };
  }

  async findById(id: string) {
    const result = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        passwordHash: schema.users.passwordHash,
        isEmailVerified: schema.users.isEmailVerified,
        isPhoneVerified: schema.users.isPhoneVerified,
        createdAt: schema.users.createdAt,
        profile: schema.profiles,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.users.id, id))
      .limit(1);

    const user = result[0];
    if (!user) return null;

    const userRoles = await this.db
      .select({
        roleName: schema.roles.name,
      })
      .from(schema.userToRoles)
      .innerJoin(schema.roles, eq(schema.userToRoles.roleId, schema.roles.id))
      .where(eq(schema.userToRoles.userId, id));

    const rolesList = userRoles.map((r) => r.roleName);

    return {
      ...user,
      role: rolesList[0] || 'PLAYER',
      roles: rolesList,
    };
  }


  async updateProfile(
    userId: string,
    data: Partial<typeof schema.profiles.$inferInsert>,
  ) {
    return await this.db
      .update(schema.profiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.profiles.userId, userId))
      .returning();
  }

  async verifyEmail(userId: string) {
    return await this.db
      .update(schema.users)
      .set({ isEmailVerified: true, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();
  }

  async verifyPhone(userId: string) {
    return await this.db
      .update(schema.users)
      .set({ isPhoneVerified: true, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();
  }

  async updatePassword(userId: string, passwordHash: string) {
    return await this.db
      .update(schema.users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();
  }

  async softDelete(id: string) {
    return await this.db
      .update(schema.users)
      .set({ deletedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
  }

  async getPublicProfile(userId: string) {
    // 1. Fetch user & profile
    const result = await this.db
      .select({
        id: schema.users.id,
        createdAt: schema.users.createdAt,
        isMock: schema.users.isMock,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
        coverUrl: schema.profiles.coverUrl,
        gender: schema.profiles.gender,
        bio: schema.profiles.bio,
        isVerified: schema.profiles.isVerified,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(
        and(
          eq(schema.users.id, userId),
          isNull(schema.users.deletedAt)
        )
      )
      .limit(1);

    const user = result[0];
    if (!user) return null;

    // 2. Fetch user ranks with category name
    const ranks = await this.db
      .select({
        categoryId: schema.userRanks.categoryId,
        categoryName: schema.categories.name,
        matchType: schema.userRanks.matchType,
        eloPoints: schema.userRanks.eloPoints,
        matchesPlayed: schema.userRanks.matchesPlayed,
        matchesWon: schema.userRanks.matchesWon,
        winStreak: schema.userRanks.winStreak,
      })
      .from(schema.userRanks)
      .innerJoin(schema.categories, eq(schema.userRanks.categoryId, schema.categories.id))
      .where(
        and(
          eq(schema.userRanks.userId, userId),
          isNull(schema.userRanks.communityId) // Global ranks only
        )
      );

    const achievements = await this.getPublicProfileAchievements(userId);

    return {
      ...user,
      ranks: user.isMock ? [] : ranks,
      achievements,
    };
  }

  private async getPublicProfileAchievements(userId: string) {
    const participations = await this.db
      .selectDistinct({
        tournamentId: schema.tournaments.id,
        tournamentName: schema.tournaments.name,
        tournamentStatus: schema.tournaments.status,
        isRanked: schema.tournaments.isRanked,
        startDate: schema.tournaments.startDate,
        endDate: schema.tournaments.endDate,
      })
      .from(schema.tournamentRosters)
      .innerJoin(schema.tournamentParticipants, eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
      .innerJoin(schema.tournaments, eq(schema.tournamentParticipants.tournamentId, schema.tournaments.id))
      .where(
        and(
          eq(schema.tournamentRosters.userId, userId),
          eq(schema.tournaments.isRanked, true),
          eq(schema.tournaments.status, 'COMPLETED'),
          isNull(schema.tournaments.deletedAt),
        ),
      );

    const achievements: Array<{
      tournamentId: string;
      tournamentName: string;
      rank: 1 | 2 | 3;
      completedAt: string | null;
      tournamentDate: string | null;
    }> = [];

    for (const tournament of participations) {
      const stages = await this.db
        .select({
          id: schema.tournamentStages.id,
          order: schema.tournamentStages.order,
        })
        .from(schema.tournamentStages)
        .where(eq(schema.tournamentStages.tournamentId, tournament.tournamentId))
        .orderBy(asc(schema.tournamentStages.order));

      if (stages.length === 0) continue;

      const stageIds = stages.map((stage) => stage.id);
      const maxStageOrder = Math.max(...stages.map((stage) => stage.order));

      const matches = await this.db
        .select({
          id: schema.matches.id,
          stageId: schema.matches.stageId,
          stageOrder: schema.tournamentStages.order,
          participant1Id: schema.matches.participant1Id,
          participant2Id: schema.matches.participant2Id,
          winnerId: schema.matches.winnerId,
          status: schema.matches.status,
          completedAt: schema.matches.completedAt,
          isBye: schema.matches.isBye,
        })
        .from(schema.matches)
        .innerJoin(schema.tournamentStages, eq(schema.matches.stageId, schema.tournamentStages.id))
        .where(
          and(
            eq(schema.matches.tournamentId, tournament.tournamentId),
            inArray(schema.matches.stageId, stageIds),
          ),
        )
        .orderBy(asc(schema.tournamentStages.order), asc(schema.matches.roundNumber), asc(schema.matches.matchOrder));

      const userParticipantIds = new Set(
        (
          await this.db
            .select({ participantId: schema.tournamentRosters.participantId })
            .from(schema.tournamentRosters)
            .where(eq(schema.tournamentRosters.userId, userId))
        ).map((row) => row.participantId),
      );

      const userMatches = matches.filter((match) =>
        userParticipantIds.has(match.participant1Id || '') ||
        userParticipantIds.has(match.participant2Id || ''),
      );
      if (userMatches.length === 0) continue;

      const lastStageMatches = matches.filter((match) => match.stageOrder === maxStageOrder && match.status === 'COMPLETED');
      let finalMatches = lastStageMatches.filter((match) => {
        const p1InPrev = match.participant1Id ? userParticipantIds.has(match.participant1Id) : false;
        const p2InPrev = match.participant2Id ? userParticipantIds.has(match.participant2Id) : false;
        return p1InPrev || p2InPrev;
      });
      if (finalMatches.length === 0 && lastStageMatches.length === 1) {
        finalMatches = lastStageMatches;
      }

      const bronzeMatches = lastStageMatches.filter((match) => !finalMatches.some((finalMatch) => finalMatch.id === match.id));

      const userInMatch = (match: typeof matches[number]) => {
        const inP1 = match.participant1Id ? userParticipantIds.has(match.participant1Id) : false;
        const inP2 = match.participant2Id ? userParticipantIds.has(match.participant2Id) : false;
        return {
          inP1,
          inP2,
          isWinner:
            (inP1 && match.winnerId === match.participant1Id) ||
            (inP2 && match.winnerId === match.participant2Id),
        };
      };

      const finalUserMatch = finalMatches.find((match) => {
        const state = userInMatch(match);
        return state.inP1 || state.inP2;
      });

      if (finalUserMatch) {
        const state = userInMatch(finalUserMatch);
        achievements.push({
          tournamentId: tournament.tournamentId,
          tournamentName: tournament.tournamentName,
          rank: state.isWinner ? 1 : 2,
          completedAt: finalUserMatch.completedAt ? finalUserMatch.completedAt.toISOString() : null,
          tournamentDate: (tournament.endDate || tournament.startDate)?.toISOString() || null,
        });
        continue;
      }

      const bronzeUserMatch = bronzeMatches.find((match) => {
        const state = userInMatch(match);
        return state.inP1 || state.inP2;
      });
      if (bronzeUserMatch) {
        const state = userInMatch(bronzeUserMatch);
        if (state.isWinner) {
          achievements.push({
            tournamentId: tournament.tournamentId,
            tournamentName: tournament.tournamentName,
            rank: 3,
            completedAt: bronzeUserMatch.completedAt ? bronzeUserMatch.completedAt.toISOString() : null,
            tournamentDate: (tournament.endDate || tournament.startDate)?.toISOString() || null,
          });
          continue;
        }
      }

      const latestUserMatch = [...userMatches].sort((a, b) => b.stageOrder - a.stageOrder)[0];
      if (latestUserMatch && latestUserMatch.stageOrder < maxStageOrder) {
        const state = userInMatch(latestUserMatch);
        if (!state.isWinner) {
          achievements.push({
            tournamentId: tournament.tournamentId,
            tournamentName: tournament.tournamentName,
            rank: 3,
            completedAt: latestUserMatch.completedAt ? latestUserMatch.completedAt.toISOString() : null,
            tournamentDate: (tournament.endDate || tournament.startDate)?.toISOString() || null,
          });
        }
      }
    }

    return achievements
      .sort((a, b) => a.rank - b.rank || (b.completedAt || '').localeCompare(a.completedAt || ''))
      .slice(0, 12);
  }

  async reportTargetExists(targetType: ReportTargetType, targetId: string) {
    switch (targetType) {
      case 'USER': {
        const [target] = await this.db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(and(eq(schema.users.id, targetId), isNull(schema.users.deletedAt)))
          .limit(1);
        return Boolean(target);
      }
      case 'TOURNAMENT': {
        const [target] = await this.db
          .select({ id: schema.tournaments.id })
          .from(schema.tournaments)
          .where(
            and(
              eq(schema.tournaments.id, targetId),
              isNull(schema.tournaments.deletedAt),
            ),
          )
          .limit(1);
        return Boolean(target);
      }
      case 'MATCH': {
        const [target] = await this.db
          .select({ id: schema.matches.id })
          .from(schema.matches)
          .where(and(eq(schema.matches.id, targetId), isNull(schema.matches.deletedAt)))
          .limit(1);
        return Boolean(target);
      }
      case 'COMMUNITY': {
        const [target] = await this.db
          .select({ id: schema.communities.id })
          .from(schema.communities)
          .where(
            and(
              eq(schema.communities.id, targetId),
              isNull(schema.communities.deletedAt),
            ),
          )
          .limit(1);
        return Boolean(target);
      }
    }
  }

  async createReport(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
    category: ReportCategory,
    reason: string,
    evidenceUrls: string[],
  ) {
    return this.db.transaction(async (tx) => {
      const [report] = await tx
        .insert(schema.reports)
        .values({
          reporterId,
          targetType,
          targetId,
          category,
          reason,
          evidenceUrls,
          status: 'SUBMITTED',
        })
        .returning();

      await tx.insert(schema.reportActions).values({
        reportId: report.id,
        actorId: reporterId,
        action: 'SUBMIT',
        toStatus: 'SUBMITTED',
      });

      return report;
    });
  }

  async getMyReports(reporterId: string, query: QueryMyReportsDto) {
    const conditions: SQL[] = [eq(schema.reports.reporterId, reporterId)];
    if (query.status) conditions.push(eq(schema.reports.status, query.status));
    if (query.targetType) {
      conditions.push(eq(schema.reports.targetType, query.targetType));
    }
    if (query.category) {
      conditions.push(eq(schema.reports.category, query.category));
    }

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;
    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.reports)
      .where(whereClause);
    const data = await this.db
      .select()
      .from(schema.reports)
      .where(whereClause)
      .orderBy(desc(schema.reports.createdAt))
      .limit(query.limit)
      .offset(offset);

    return {
      data,
      meta: {
        total: totalRecord.count,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(totalRecord.count / query.limit),
      },
    };
  }

  async searchUsers(queryStr: string) {
    const cleanQuery = queryStr.trim();
    return this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
        phoneNumber: schema.profiles.phoneNumber,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(
        and(
          isNull(schema.users.deletedAt),
          eq(schema.users.isMock, false),
          or(
            ilike(schema.users.email, `%${cleanQuery}%`),
            ilike(schema.profiles.fullName, `%${cleanQuery}%`),
            eq(schema.profiles.phoneNumber, cleanQuery),
          ),
        ),
      )
      .limit(10);
  }

  async createChangeRequest(userId: string, requestType: 'GENDER' | 'EMAIL', oldValue: string, newValue: string) {
    return await this.db
      .insert(schema.userChangeRequests)
      .values({
        userId,
        requestType,
        oldValue,
        newValue,
        status: 'PENDING',
      })
      .returning();
  }

  async findChangeRequests(status?: string) {
    const whereClause = status ? eq(schema.userChangeRequests.status, status) : undefined;
    return await this.db
      .select({
        id: schema.userChangeRequests.id,
        userId: schema.userChangeRequests.userId,
        requestType: schema.userChangeRequests.requestType,
        oldValue: schema.userChangeRequests.oldValue,
        newValue: schema.userChangeRequests.newValue,
        status: schema.userChangeRequests.status,
        adminNote: schema.userChangeRequests.adminNote,
        createdAt: schema.userChangeRequests.createdAt,
        userEmail: schema.users.email,
        userFullName: schema.profiles.fullName,
      })
      .from(schema.userChangeRequests)
      .innerJoin(schema.users, eq(schema.userChangeRequests.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(whereClause)
      .orderBy(desc(schema.userChangeRequests.createdAt));
  }

  async findChangeRequestById(id: string) {
    const result = await this.db
      .select()
      .from(schema.userChangeRequests)
      .where(eq(schema.userChangeRequests.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  async updateChangeRequestStatus(id: string, status: 'APPROVED' | 'REJECTED', adminNote?: string) {
    return await this.db
      .update(schema.userChangeRequests)
      .set({ status, adminNote, updatedAt: new Date() })
      .where(eq(schema.userChangeRequests.id, id))
      .returning();
  }
}


