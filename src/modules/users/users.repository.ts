import { Injectable, Inject } from '@nestjs/common';
import type { AppDb } from '../../database/db.types';
import { eq, or, and, ilike, desc, asc, isNull, count, inArray, aliasedTable, gt, lt, sql, type SQL } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';
import { QueryUserDto } from './dto/query-user.dto';
import type {
  ReportCategory,
  ReportTargetType,
} from './dto/create-report.dto';
import type { QueryMyReportsDto } from './dto/query-my-reports.dto';
import { CursorPaginationHelper } from '../../common/helpers/cursor-pagination.helper';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../../common/constants/enums';

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Atomically replaces global system roles. Community/tournament-scoped roles
   * live in their own tables and are intentionally not read or changed here.
   */
  async replaceSystemRoles(
    targetUserId: string,
    roleNames: UserRole[],
    actorId: string,
  ): Promise<string[] | null> {
    return this.db.transaction(async (tx) => {
      // Serializes every ADMIN demotion across instances. Row locks alone do
      // not protect an empty/single-row result set from a concurrent demotion.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('system-role-admin-assignment'))`);

      // JWT roles can be stale until access-token expiry. Re-check the actor
      // inside the transaction so a just-demoted admin cannot chain another
      // system-role mutation with an old token.
      const actorAdminAssignments = await tx
        .select({ userId: schema.userToRoles.userId })
        .from(schema.userToRoles)
        .innerJoin(schema.roles, eq(schema.userToRoles.roleId, schema.roles.id))
        .innerJoin(schema.users, eq(schema.userToRoles.userId, schema.users.id))
        .where(and(
          eq(schema.userToRoles.userId, actorId),
          eq(schema.roles.name, UserRole.ADMIN),
          isNull(schema.users.deletedAt),
        ))
        .for('update');
      if (actorAdminAssignments.length === 0) {
        throw new Error('ACTOR_NOT_ADMIN');
      }

      const [target] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.id, targetUserId), isNull(schema.users.deletedAt)))
        .for('update')
        .limit(1);
      if (!target) return null;

      const requestedRoles = await tx
        .select({ id: schema.roles.id, name: schema.roles.name })
        .from(schema.roles)
        .where(inArray(schema.roles.name, roleNames))
        .for('update');
      if (requestedRoles.length !== roleNames.length) {
        throw new Error('SYSTEM_ROLE_NOT_FOUND');
      }

      const currentAssignments = await tx
        .select({ roleId: schema.userToRoles.roleId, roleName: schema.roles.name })
        .from(schema.userToRoles)
        .innerJoin(schema.roles, eq(schema.userToRoles.roleId, schema.roles.id))
        .where(eq(schema.userToRoles.userId, targetUserId))
        .for('update');
      const currentRoleNames = currentAssignments.map((assignment) => assignment.roleName);
      const targetLosesAdmin =
        currentRoleNames.includes(UserRole.ADMIN) && !roleNames.includes(UserRole.ADMIN);

      if (targetLosesAdmin) {
        const adminAssignments = await tx
          .select({ userId: schema.userToRoles.userId })
          .from(schema.userToRoles)
          .innerJoin(schema.roles, eq(schema.userToRoles.roleId, schema.roles.id))
          .innerJoin(schema.users, eq(schema.userToRoles.userId, schema.users.id))
          .where(and(
            eq(schema.roles.name, UserRole.ADMIN),
            isNull(schema.users.deletedAt),
            sql`not exists (
              select 1 from ${schema.userBans} active_ban
              where active_ban.user_id = ${schema.userToRoles.userId}
                and active_ban.is_active = true
                and active_ban.ban_type in ('SOFT_BAN', 'HARD_BAN')
                and (active_ban.expires_at is null or active_ban.expires_at > now())
            )`,
          ))
          .for('update');
        const activeAdminUserIds = new Set(adminAssignments.map((assignment) => assignment.userId));
        if (activeAdminUserIds.has(targetUserId) && activeAdminUserIds.size <= 1) {
          throw new Error('LAST_ADMIN');
        }
      }

      const requestedRoleIds = requestedRoles.map((role) => role.id);
      const currentRoleIds = currentAssignments.map((assignment) => assignment.roleId);
      const rolesToRemove = currentRoleIds.filter((roleId) => !requestedRoleIds.includes(roleId));
      const rolesToAdd = requestedRoleIds.filter((roleId) => !currentRoleIds.includes(roleId));

      if (rolesToRemove.length === 0 && rolesToAdd.length === 0) {
        return currentRoleNames;
      }

      if (rolesToRemove.length > 0) {
        await tx
          .delete(schema.userToRoles)
          .where(and(
            eq(schema.userToRoles.userId, targetUserId),
            inArray(schema.userToRoles.roleId, rolesToRemove),
          ));
      }
      if (rolesToAdd.length > 0) {
        await tx.insert(schema.userToRoles).values(
          rolesToAdd.map((roleId) => ({
            userId: targetUserId,
            roleId,
            assignedBy: actorId,
          })),
        ).onConflictDoNothing();
      }

      // Refresh tokens become unusable immediately. Existing access JWTs are
      // stateless and can remain valid only until their normal expiry.
      await tx
        .update(schema.sessions)
        .set({ isRevoked: true, revokedAt: new Date() })
        .where(and(
          eq(schema.sessions.userId, targetUserId),
          eq(schema.sessions.isRevoked, false),
        ));

      await this.auditService.logUpdate(
        tx,
        actorId,
        'user_to_roles',
        targetUserId,
        { roles: currentRoleNames },
        { roles: roleNames },
      );
      return roleNames;
    });
  }

  async findAll(query: QueryUserDto) {
    const { page = 1, limit, search, order, cursor, role } = query;

    let whereClause = and(
      isNull(schema.users.deletedAt),
      eq(schema.users.isMock, false),
    )!;
    if (role) {
      whereClause = and(whereClause, sql`exists (
        select 1 from ${schema.userToRoles} ur
        inner join ${schema.roles} rr on ur.role_id = rr.id
        where ur.user_id = ${schema.users.id} and rr.name = ${role}
      )`)!;
    }
    if (search) {
      whereClause = and(
        whereClause,
        or(
          ilike(schema.users.email, `%${search}%`),
          ilike(schema.profiles.fullName, `%${search}%`),
        ),
      )!;
    }

    const sortConfig =
      order === 'desc'
        ? desc(schema.users.createdAt)
        : asc(schema.users.createdAt);

    let cursorValue: { createdAt: string; id: string } | null = null;
    if (cursor) {
      try {
        cursorValue = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { createdAt: string; id: string };
      } catch {
        cursorValue = null;
      }
    }
    let userWhere = whereClause;
    if (cursorValue) {
      const cursorDate = new Date(cursorValue.createdAt);
      const cursorPredicate = order === 'asc'
        ? sql`(${schema.users.createdAt} > ${cursorDate} OR (${schema.users.createdAt} = ${cursorDate} AND ${schema.users.id} > ${cursorValue.id}))`
        : sql`(${schema.users.createdAt} < ${cursorDate} OR (${schema.users.createdAt} = ${cursorDate} AND ${schema.users.id} < ${cursorValue.id}))`;
      userWhere = and(whereClause, cursorPredicate)!;
    }

    let userQuery = this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        isEmailVerified: schema.users.isEmailVerified,
        createdAt: schema.users.createdAt,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
        isVerified: schema.profiles.isVerified,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(userWhere)
      .orderBy(sortConfig, order === 'desc' ? desc(schema.users.id) : asc(schema.users.id))
      .limit(limit! + 1)
      .$dynamic();
    const userRows = await userQuery;
    const hasMore = userRows.length > limit!;
    const data = hasMore ? userRows.slice(0, limit!) : userRows;
    const lastUser = data[data.length - 1];

    // Simple count (in real app we should do a proper count query)
    const countResult = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(whereClause);

    const total = countResult.length;

    const roleRows = data.length > 0
      ? await this.db
        .select({ userId: schema.userToRoles.userId, roleName: schema.roles.name })
        .from(schema.userToRoles)
        .innerJoin(schema.roles, eq(schema.userToRoles.roleId, schema.roles.id))
        .where(inArray(schema.userToRoles.userId, data.map((row) => row.id)))
      : [];
    const rolesByUserId = new Map<string, string[]>();
    roleRows.forEach((row) => {
      const rolesForUser = rolesByUserId.get(row.userId) ?? [];
      if (!rolesForUser.includes(row.roleName)) {
        rolesForUser.push(row.roleName);
      }
      rolesByUserId.set(row.userId, rolesForUser);
    });

    // Do not join sanctions into the cursor-paginated user query. A user may
    // have multiple active WARN/history rows, which would duplicate that user
    // and corrupt both page boundaries and the total. Fetch the emitted users'
    // current sanctions separately and retain the most recent valid one.
    const activeBanRows = data.length > 0
      ? await this.db
        .select({
          userId: schema.userBans.userId,
          banType: schema.userBans.banType,
          reason: schema.userBans.reason,
          expiresAt: schema.userBans.expiresAt,
          createdAt: schema.userBans.createdAt,
          id: schema.userBans.id,
        })
        .from(schema.userBans)
        .where(and(
          inArray(schema.userBans.userId, data.map((row) => row.id)),
          eq(schema.userBans.isActive, true),
          or(
            isNull(schema.userBans.expiresAt),
            gt(schema.userBans.expiresAt, sql`now()`),
          ),
        ))
        .orderBy(desc(schema.userBans.createdAt), desc(schema.userBans.id))
      : [];
    const activeBanByUserId = new Map<string, typeof activeBanRows[number]>();
    for (const ban of activeBanRows) {
      if (!activeBanByUserId.has(ban.userId)) {
        activeBanByUserId.set(ban.userId, ban);
      }
    }

    const mappedData = data.map((row) => ({
      id: row.id,
      email: row.email,
      isEmailVerified: row.isEmailVerified,
      createdAt: row.createdAt,
      roles: rolesByUserId.get(row.id) ?? [],
      profile: {
        fullName: row.fullName || '',
        avatarUrl: row.avatarUrl || undefined,
        isVerified: row.isVerified || false,
      },
      activeBan: activeBanByUserId.get(row.id) ? {
        banType: activeBanByUserId.get(row.id)!.banType as 'WARN' | 'SOFT_BAN' | 'HARD_BAN',
        reason: activeBanByUserId.get(row.id)!.reason || '',
        expiresAt: activeBanByUserId.get(row.id)!.expiresAt?.toISOString(),
      } : undefined,
    }));

    return {
      data: mappedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit!),
        nextCursor: hasMore && lastUser ? Buffer.from(JSON.stringify({ createdAt: lastUser.createdAt.toISOString(), id: lastUser.id })).toString('base64url') : null,
        hasMore,
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
        tierName: schema.eloTiers.name,
      })
      .from(schema.userRanks)
      .innerJoin(schema.categories, eq(schema.userRanks.categoryId, schema.categories.id))
      .leftJoin(schema.eloTiers, eq(schema.userRanks.tierId, schema.eloTiers.id))
      .where(
        and(
          eq(schema.userRanks.userId, userId),
          isNull(schema.userRanks.communityId) // Global ranks only
        )
      );

    // Pair ELO is intentionally kept separate from individual ELO. It is
    // only used for the player's doubles badge/profile context.
    const pairUser1 = aliasedTable(schema.users, 'public_pair_user1');
    const pairUser2 = aliasedTable(schema.users, 'public_pair_user2');
    const pairProfile1 = aliasedTable(schema.profiles, 'public_pair_profile1');
    const pairProfile2 = aliasedTable(schema.profiles, 'public_pair_profile2');
    const pairRanks = await this.db
      .select({
        id: schema.pairRanks.id,
        categoryId: schema.pairRanks.categoryId,
        categoryName: schema.categories.name,
        matchType: schema.pairRanks.matchType,
        eloPoints: schema.pairRanks.eloPoints,
        matchesPlayed: schema.pairRanks.matchesPlayed,
        matchesWon: schema.pairRanks.matchesWon,
        winStreak: schema.pairRanks.winStreak,
        updatedAt: schema.pairRanks.updatedAt,
        partnerId: sql`CASE WHEN ${schema.pairRanks.user1Id} = ${userId} THEN ${pairUser2.id} ELSE ${pairUser1.id} END`.as('partner_id'),
        partnerName: sql`CASE WHEN ${schema.pairRanks.user1Id} = ${userId} THEN ${pairProfile2.fullName} ELSE ${pairProfile1.fullName} END`.as('partner_name'),
        partnerAvatarUrl: sql`CASE WHEN ${schema.pairRanks.user1Id} = ${userId} THEN ${pairProfile2.avatarUrl} ELSE ${pairProfile1.avatarUrl} END`.as('partner_avatar_url'),
      })
      .from(schema.pairRanks)
      .innerJoin(schema.categories, eq(schema.pairRanks.categoryId, schema.categories.id))
      .innerJoin(pairUser1, eq(schema.pairRanks.user1Id, pairUser1.id))
      .innerJoin(pairUser2, eq(schema.pairRanks.user2Id, pairUser2.id))
      .leftJoin(pairProfile1, eq(pairUser1.id, pairProfile1.userId))
      .leftJoin(pairProfile2, eq(pairUser2.id, pairProfile2.userId))
      .where(
        and(
          or(eq(schema.pairRanks.user1Id, userId), eq(schema.pairRanks.user2Id, userId)),
          eq(schema.pairRanks.scope, 'PUBLIC'),
          isNull(schema.pairRanks.communityId),
          eq(pairUser1.isMock, false),
          eq(pairUser2.isMock, false),
          gt(schema.pairRanks.matchesPlayed, 0),
        ),
      )
      .orderBy(desc(schema.pairRanks.eloPoints));

    const activeRanks = ranks.filter((rank) => rank.matchesPlayed > 0);
    const activePairRanks = pairRanks.filter((rank) => rank.matchesPlayed > 0);
    const highlightRank = [...activeRanks.map((rank) => ({ ...rank, source: 'SINGLES' as const })), ...activePairRanks.map((rank) => ({ ...rank, source: 'DOUBLES' as const }))]
      .sort((a, b) => b.eloPoints - a.eloPoints || b.matchesPlayed - a.matchesPlayed)[0] ?? null;

    const achievements = await this.getPublicProfileAchievements(userId);

    return {
      ...user,
      ranks: user.isMock ? [] : ranks,
      pairRanks: user.isMock ? [] : pairRanks,
      highlightRank: user.isMock ? null : highlightRank,
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

    const baseWhereClause = and(...conditions);
    const decodedCursor = query.cursor
      ? CursorPaginationHelper.decodeCursor<{ id: string; createdAt: string }>(query.cursor)
      : null;
    if (decodedCursor) {
      conditions.push(
        or(
          lt(schema.reports.createdAt, new Date(decodedCursor.createdAt)),
          and(
            eq(schema.reports.createdAt, new Date(decodedCursor.createdAt)),
            lt(schema.reports.id, decodedCursor.id),
          ),
        ) as SQL,
      );
    }
    const whereClause = and(...conditions);
    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.reports)
      .where(baseWhereClause);
    const reportsQuery = this.db
      .select()
      .from(schema.reports)
      .where(whereClause)
      .orderBy(desc(schema.reports.createdAt), desc(schema.reports.id))
      .limit(query.limit + 1)
      .$dynamic();
    const rawData = await reportsQuery;
    const hasMore = rawData.length > query.limit;
    const data = hasMore ? rawData.slice(0, query.limit) : rawData;

    return {
      data,
      meta: {
        total: totalRecord.count,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(totalRecord.count / query.limit),
        nextCursor: hasMore && data.length > 0
          ? CursorPaginationHelper.encodeCursor({ id: data[data.length - 1].id, createdAt: data[data.length - 1].createdAt })
          : null,
        hasMore,
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


