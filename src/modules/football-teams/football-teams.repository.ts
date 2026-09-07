import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gt, ilike, inArray, isNull, ne, notExists, or, sql } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb, AppTx } from '../../database/db.types';
import * as schema from '../../database/schema';
import type { CreateFootballTeamDto } from './dto/create-football-team.dto';
import type { UpdateFootballTeamDto } from './dto/update-football-team.dto';
import { AuditService } from '../audit/audit.service';
import {
  assertCanCreateActiveFootballTeam,
  assertCanJoinActiveFootballTeam,
} from './football-team-limits';

// `/mine` represents teams the user currently participates in. Pending invites
// must stay in the notification/invite flow and must not affect team limits or
// the personal highest-ELO card.
const ACTIVE_MEMBER_STATUSES = ['ACTIVE'] as const;

@Injectable()
export class FootballTeamsRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly auditService: AuditService,
  ) {}

  async create(userId: string, dto: CreateFootballTeamDto) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('football-team-limit'))`);
      const normalizedName = dto.name.trim();
      if (!normalizedName) throw new BadRequestException('Tên đội không được để trống.');
      const [creator] = await tx.select({ id: schema.users.id }).from(schema.users)
        .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt))).limit(1);
      if (!creator) throw new NotFoundException('Không tìm thấy tài khoản hoạt động.');

      const [category] = await tx.select({
        id: schema.categories.id,
        name: schema.categories.name,
        slug: schema.categories.slug,
        categoryConfig: schema.categories.categoryConfig,
      }).from(schema.categories)
        .where(eq(schema.categories.id, dto.categoryId)).limit(1);
      if (!category) throw new NotFoundException('Không tìm thấy danh mục bóng đá.');
      const categoryText = `${category.name} ${category.slug}`.toLowerCase();
      const categoryConfig = (category.categoryConfig as Record<string, unknown> | null) || {};
      if (!/(football|soccer|bóng đá)/i.test(categoryText) || categoryConfig.isActive === false || categoryConfig.isActive === 'false') {
        throw new ConflictException('Chỉ được tạo đội trong danh mục bóng đá đang hoạt động.');
      }

      if (dto.communityId) {
        // A team may be linked only from a live community the creator has
        // actually joined. This keeps the community/team boundary explicit
        // and prevents attaching a team to an unrelated or suspended club.
        const [communityAccess] = await tx
          .select({
            id: schema.communities.id,
            configuredCategoryId: schema.communitySports.categoryId,
          })
          .from(schema.communities)
          .innerJoin(
            schema.communityMembers,
            and(
              eq(schema.communityMembers.communityId, schema.communities.id),
              eq(schema.communityMembers.userId, userId),
              eq(schema.communityMembers.status, 'JOINED'),
            ),
          )
          .leftJoin(
            schema.communitySports,
            eq(schema.communitySports.communityId, schema.communities.id),
          )
          .where(
            and(
              eq(schema.communities.id, dto.communityId),
              eq(schema.communities.status, 'ACTIVE'),
              isNull(schema.communities.deletedAt),
            ),
          )
          .limit(1);
        if (!communityAccess) {
          throw new ForbiddenException(
            'Bạn phải tham gia câu lạc bộ đang hoạt động trước khi gắn đội bóng vào đó.',
          );
        }
        if (
          communityAccess.configuredCategoryId &&
          communityAccess.configuredCategoryId !== dto.categoryId
        ) {
          throw new ConflictException(
            'Đội bóng phải cùng môn thể thao với câu lạc bộ đã chọn.',
          );
        }
      }

      const [duplicate] = await tx.select({ id: schema.footballTeams.id })
        .from(schema.footballTeams)
        .where(and(
          eq(schema.footballTeams.categoryId, dto.categoryId),
          eq(schema.footballTeams.status, 'ACTIVE'),
          sql`lower(${schema.footballTeams.name}) = lower(${normalizedName})`,
          dto.communityId
            ? eq(schema.footballTeams.communityId, dto.communityId)
            : isNull(schema.footballTeams.communityId),
        ))
        .limit(1);
      if (duplicate) throw new ConflictException('Tên đội đã được dùng trong danh mục này.');

      const [{ count: createdCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.footballTeams)
        .where(and(
          eq(schema.footballTeams.createdBy, userId),
          eq(schema.footballTeams.status, 'ACTIVE'),
        ));
      assertCanCreateActiveFootballTeam(Number(createdCount));

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.footballTeamMembers)
        .innerJoin(schema.footballTeams, eq(schema.footballTeamMembers.teamId, schema.footballTeams.id))
        .where(and(
          eq(schema.footballTeamMembers.userId, userId),
          eq(schema.footballTeamMembers.status, 'ACTIVE'),
          eq(schema.footballTeams.status, 'ACTIVE'),
          inArray(schema.footballTeamMembers.role, ['CAPTAIN', 'MANAGER', 'PLAYER']),
        ));
      assertCanJoinActiveFootballTeam(Number(count));

      const [team] = await tx.insert(schema.footballTeams).values({
        name: normalizedName,
        categoryId: dto.categoryId,
        logoUrl: dto.logoUrl?.trim() || null,
        communityId: dto.communityId,
        createdBy: userId,
      }).returning();
      await tx.insert(schema.footballTeamMembers).values({
        teamId: team.id,
        userId,
        role: 'CAPTAIN',
        status: 'ACTIVE',
        joinedAt: new Date(),
      });
      return team;
    });
  }

  async listMine(userId: string) {
    const rows = await this.db.select({
      team: schema.footballTeams,
      membership: schema.footballTeamMembers,
      rank: schema.footballTeamRanks,
    }).from(schema.footballTeamMembers)
      .innerJoin(schema.footballTeams, eq(schema.footballTeamMembers.teamId, schema.footballTeams.id))
      .innerJoin(schema.categories, eq(schema.categories.id, schema.footballTeams.categoryId))
      .leftJoin(schema.footballTeamRanks, and(
        eq(schema.footballTeamRanks.teamId, schema.footballTeams.id),
        eq(schema.footballTeamRanks.categoryId, schema.footballTeams.categoryId),
      ))
      .where(and(
        eq(schema.footballTeamMembers.userId, userId),
        inArray(schema.footballTeamMembers.status, ACTIVE_MEMBER_STATUSES),
        eq(schema.footballTeams.status, 'ACTIVE'),
        sql`coalesce(${schema.categories.categoryConfig}->>'isActive', 'true') <> 'false'`,
      ))
      .orderBy(desc(schema.footballTeams.updatedAt));
    return rows.map(({ team, membership, rank }) => ({ team, membership, rank }));
  }

  async findById(teamId: string) {
    const [team] = await this.db.select().from(schema.footballTeams).where(eq(schema.footballTeams.id, teamId)).limit(1);
    if (!team) throw new NotFoundException('Không tìm thấy đội bóng.');
    const memberRows = await this.db
      .select({
        member: schema.footballTeamMembers,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.footballTeamMembers)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.footballTeamMembers.userId))
      .where(eq(schema.footballTeamMembers.teamId, teamId))
      .orderBy(desc(schema.footballTeamMembers.createdAt));
    const members = memberRows.map(({ member, fullName, avatarUrl }) => ({
      ...member,
      profile: {
        fullName: fullName || null,
        avatarUrl: avatarUrl || null,
      },
    }));
    return { ...team, members };
  }

  async findMember(teamId: string, userId: string) {
    const [member] = await this.db.select().from(schema.footballTeamMembers)
      .where(and(eq(schema.footballTeamMembers.teamId, teamId), eq(schema.footballTeamMembers.userId, userId))).limit(1);
    return member;
  }

  async searchMemberCandidates(teamId: string, query: string, limit: number) {
    const activeBan = this.db.select({ id: schema.userBans.id })
      .from(schema.userBans)
      .where(and(
        eq(schema.userBans.userId, schema.users.id),
        eq(schema.userBans.isActive, true),
        inArray(schema.userBans.banType, ['SOFT_BAN', 'HARD_BAN']),
        or(isNull(schema.userBans.expiresAt), gt(schema.userBans.expiresAt, new Date())),
      ));

    return this.db.select({
      id: schema.users.id,
      email: schema.users.email,
      fullName: schema.profiles.fullName,
      avatarUrl: schema.profiles.avatarUrl,
      membershipStatus: schema.footballTeamMembers.status,
    }).from(schema.users)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
      .leftJoin(
        schema.footballTeamMembers,
        and(
          eq(schema.footballTeamMembers.userId, schema.users.id),
          eq(schema.footballTeamMembers.teamId, teamId),
        ),
      )
      .where(and(
        isNull(schema.users.deletedAt),
        eq(schema.users.isMock, false),
        notExists(activeBan),
        or(ilike(schema.users.email, `%${query}%`), ilike(schema.profiles.fullName, `%${query}%`)),
      ))
      .limit(Math.min(limit, 20));
  }

  async update(teamId: string, dto: UpdateFootballTeamDto) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('football-team-limit'))`);
      const [current] = await tx.select({
        id: schema.footballTeams.id,
        name: schema.footballTeams.name,
        categoryId: schema.footballTeams.categoryId,
        communityId: schema.footballTeams.communityId,
        createdBy: schema.footballTeams.createdBy,
        status: schema.footballTeams.status,
      }).from(schema.footballTeams).where(eq(schema.footballTeams.id, teamId)).limit(1);
      if (!current) throw new NotFoundException('Không tìm thấy đội bóng.');

      const normalizedName = dto.name?.trim();
      if (dto.name !== undefined && !normalizedName) {
        throw new BadRequestException('Tên đội không được để trống.');
      }
      const nextStatus = dto.status ?? current.status;
      if (nextStatus === 'ACTIVE' && current.status !== 'ACTIVE') {
        const [{ count: activeCreatedCount }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.footballTeams)
          .where(and(
            eq(schema.footballTeams.createdBy, current.createdBy),
            eq(schema.footballTeams.status, 'ACTIVE'),
          ));
        assertCanCreateActiveFootballTeam(Number(activeCreatedCount));
      }
      if (normalizedName && nextStatus === 'ACTIVE') {
        const [duplicate] = await tx.select({ id: schema.footballTeams.id })
          .from(schema.footballTeams)
          .where(and(
            ne(schema.footballTeams.id, teamId),
            eq(schema.footballTeams.categoryId, current.categoryId),
            eq(schema.footballTeams.status, 'ACTIVE'),
            sql`lower(${schema.footballTeams.name}) = lower(${normalizedName})`,
            current.communityId
              ? eq(schema.footballTeams.communityId, current.communityId)
              : isNull(schema.footballTeams.communityId),
          ))
          .limit(1);
        if (duplicate) throw new ConflictException('Tên đội đã được dùng trong danh mục này.');
      }

      const [team] = await tx.update(schema.footballTeams).set({
        ...(normalizedName !== undefined ? { name: normalizedName } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl?.trim() || null } : {}),
        ...(dto.status !== undefined ? { status: dto.status, archivedAt: dto.status === 'ARCHIVED' ? new Date() : null } : {}),
        updatedAt: new Date(),
      }).where(eq(schema.footballTeams.id, teamId)).returning();
      return team;
    });
  }

  async invite(teamId: string, invitedBy: string, userId: string, role: string) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('football-team-limit'))`);
      const [team] = await tx.select({ id: schema.footballTeams.id, status: schema.footballTeams.status })
        .from(schema.footballTeams).where(eq(schema.footballTeams.id, teamId)).limit(1);
      if (!team) throw new NotFoundException('Không tìm thấy đội bóng.');
      if (team.status !== 'ACTIVE') throw new ConflictException('Đội bóng không còn nhận thành viên.');
      const activeBan = tx.select({ id: schema.userBans.id })
        .from(schema.userBans)
        .where(and(
          eq(schema.userBans.userId, schema.users.id),
          eq(schema.userBans.isActive, true),
          inArray(schema.userBans.banType, ['SOFT_BAN', 'HARD_BAN']),
          or(isNull(schema.userBans.expiresAt), gt(schema.userBans.expiresAt, new Date())),
        ));
      const [target] = await tx.select({ id: schema.users.id }).from(schema.users)
        .where(and(
          eq(schema.users.id, userId),
          isNull(schema.users.deletedAt),
          eq(schema.users.isMock, false),
          notExists(activeBan),
        )).limit(1);
      if (!target) throw new NotFoundException('Tài khoản được mời không còn đủ điều kiện.');
      const [existing] = await tx.select().from(schema.footballTeamMembers)
        .where(and(eq(schema.footballTeamMembers.teamId, teamId), eq(schema.footballTeamMembers.userId, userId))).limit(1);
      if (existing?.status === 'ACTIVE' || existing?.status === 'INVITED') throw new ConflictException('Thành viên đã có trong đội hoặc đang chờ mời.');
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(schema.footballTeamMembers)
        .innerJoin(schema.footballTeams, eq(schema.footballTeamMembers.teamId, schema.footballTeams.id))
        .where(and(eq(schema.footballTeamMembers.userId, userId), eq(schema.footballTeamMembers.status, 'ACTIVE'), eq(schema.footballTeams.status, 'ACTIVE')));
      assertCanJoinActiveFootballTeam(Number(count));
      if (existing) {
        const [member] = await tx.update(schema.footballTeamMembers).set({ status: 'INVITED', role, invitedBy, leftAt: null, updatedAt: new Date() }).where(eq(schema.footballTeamMembers.id, existing.id)).returning();
        await tx.insert(schema.footballTeamInvites).values({ teamId, userId, invitedBy, status: 'PENDING' });
        await this.auditService.logUpdate(tx, invitedBy, 'football_team_members', existing.id, existing as unknown as Record<string, unknown>, member as unknown as Record<string, unknown>);
        return member;
      }
      const [member] = await tx.insert(schema.footballTeamMembers).values({ teamId, userId, role, status: 'INVITED', invitedBy }).returning();
      await tx.insert(schema.footballTeamInvites).values({ teamId, userId, invitedBy, status: 'PENDING' });
      await this.auditService.logCreate(tx, invitedBy, 'football_team_members', member.id, member as unknown as Record<string, unknown>);
      return member;
    });
  }

  async respond(teamId: string, userId: string, status: 'ACCEPTED' | 'DECLINED') {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('football-team-limit'))`);
      const [team] = await tx.select({ status: schema.footballTeams.status }).from(schema.footballTeams)
        .where(eq(schema.footballTeams.id, teamId)).limit(1);
      if (!team) throw new NotFoundException('Không tìm thấy đội bóng.');
      if (team.status !== 'ACTIVE' && status === 'ACCEPTED') throw new ConflictException('Đội bóng không còn nhận thành viên.');
      if (status === 'ACCEPTED') {
        const activeBan = tx.select({ id: schema.userBans.id })
          .from(schema.userBans)
          .where(and(
            eq(schema.userBans.userId, schema.users.id),
            eq(schema.userBans.isActive, true),
            inArray(schema.userBans.banType, ['SOFT_BAN', 'HARD_BAN']),
            or(isNull(schema.userBans.expiresAt), gt(schema.userBans.expiresAt, new Date())),
          ));
        const [target] = await tx.select({ id: schema.users.id }).from(schema.users)
          .where(and(
            eq(schema.users.id, userId),
            isNull(schema.users.deletedAt),
            eq(schema.users.isMock, false),
            notExists(activeBan),
          )).limit(1);
        if (!target) throw new ConflictException('Tài khoản không còn đủ điều kiện tham gia đội.');
        const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(schema.footballTeamMembers)
          .innerJoin(schema.footballTeams, eq(schema.footballTeamMembers.teamId, schema.footballTeams.id))
          .where(and(eq(schema.footballTeamMembers.userId, userId), eq(schema.footballTeamMembers.status, 'ACTIVE'), eq(schema.footballTeams.status, 'ACTIVE')));
        assertCanJoinActiveFootballTeam(Number(count));
      }
      const [before] = await tx.select().from(schema.footballTeamMembers)
        .where(and(eq(schema.footballTeamMembers.teamId, teamId), eq(schema.footballTeamMembers.userId, userId), eq(schema.footballTeamMembers.status, 'INVITED')))
        .limit(1);
      const [member] = await tx.update(schema.footballTeamMembers).set({ status: status === 'ACCEPTED' ? 'ACTIVE' : 'DECLINED', joinedAt: status === 'ACCEPTED' ? new Date() : null, updatedAt: new Date() })
        .where(and(eq(schema.footballTeamMembers.teamId, teamId), eq(schema.footballTeamMembers.userId, userId), eq(schema.footballTeamMembers.status, 'INVITED'))).returning();
      if (!member) throw new NotFoundException('Không tìm thấy lời mời đội bóng.');
      await tx.update(schema.footballTeamInvites).set({ status, respondedAt: new Date() }).where(and(eq(schema.footballTeamInvites.teamId, teamId), eq(schema.footballTeamInvites.userId, userId), eq(schema.footballTeamInvites.status, 'PENDING')));
      if (before) await this.auditService.logUpdate(tx, userId, 'football_team_members', before.id, before as unknown as Record<string, unknown>, member as unknown as Record<string, unknown>);
      return member;
    });
  }

  async cancelInvite(teamId: string, userId: string) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(schema.footballTeamMembers)
        .where(and(eq(schema.footballTeamMembers.teamId, teamId), eq(schema.footballTeamMembers.userId, userId), eq(schema.footballTeamMembers.status, 'INVITED')))
        .limit(1);
      const [member] = await tx.update(schema.footballTeamMembers).set({
        status: 'REMOVED',
        leftAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(schema.footballTeamMembers.teamId, teamId),
        eq(schema.footballTeamMembers.userId, userId),
        eq(schema.footballTeamMembers.status, 'INVITED'),
      )).returning();
      if (!member) throw new NotFoundException('Không tìm thấy lời mời đang chờ.');
      await tx.update(schema.footballTeamInvites).set({
        status: 'CANCELLED',
        respondedAt: new Date(),
      }).where(and(
        eq(schema.footballTeamInvites.teamId, teamId),
        eq(schema.footballTeamInvites.userId, userId),
        eq(schema.footballTeamInvites.status, 'PENDING'),
      ));
      if (before) await this.auditService.logUpdate(tx, before.invitedBy, 'football_team_members', before.id, before as unknown as Record<string, unknown>, member as unknown as Record<string, unknown>);
      return member;
    });
  }

  async removeMember(teamId: string, userId: string, actorUserId: string) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`football-team-role:${teamId}`}))`);
      const [member] = await tx.select().from(schema.footballTeamMembers)
        .where(and(
          eq(schema.footballTeamMembers.teamId, teamId),
          eq(schema.footballTeamMembers.userId, userId),
          eq(schema.footballTeamMembers.status, 'ACTIVE'),
        )).limit(1);
      if (!member) throw new NotFoundException('Không tìm thấy thành viên đang hoạt động.');
      if (member.role === 'CAPTAIN') {
        const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` })
          .from(schema.footballTeamMembers)
          .where(and(
            eq(schema.footballTeamMembers.teamId, teamId),
            eq(schema.footballTeamMembers.status, 'ACTIVE'),
            eq(schema.footballTeamMembers.role, 'CAPTAIN'),
          ));
        if (Number(count) <= 1) throw new ConflictException('Đội phải có ít nhất một đội trưởng.');
      }
      const [updated] = await tx.update(schema.footballTeamMembers).set({
        status: 'REMOVED',
        leftAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(schema.footballTeamMembers.id, member.id)).returning();
      await this.auditService.logUpdate(
        tx,
        actorUserId,
        'football_team_members',
        member.id,
        member as unknown as Record<string, unknown>,
        updated as unknown as Record<string, unknown>,
      );
      return updated;
    });
  }

  async updateMember(teamId: string, userId: string, role: string, actorUserId: string) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('football-team-role'))`);
      const [target] = await tx.select().from(schema.footballTeamMembers)
        .where(and(eq(schema.footballTeamMembers.teamId, teamId), eq(schema.footballTeamMembers.userId, userId), eq(schema.footballTeamMembers.status, 'ACTIVE'))).limit(1);
      if (!target) throw new NotFoundException('Không tìm thấy thành viên đang hoạt động.');
      if (target.role === 'CAPTAIN' && role !== 'CAPTAIN') {
        const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(schema.footballTeamMembers)
          .where(and(eq(schema.footballTeamMembers.teamId, teamId), eq(schema.footballTeamMembers.status, 'ACTIVE'), eq(schema.footballTeamMembers.role, 'CAPTAIN')));
        if (Number(count) <= 1) throw new ConflictException('Đội phải có ít nhất một đội trưởng.');
      }
      const [member] = await tx.update(schema.footballTeamMembers).set({ role, updatedAt: new Date() })
        .where(eq(schema.footballTeamMembers.id, target.id)).returning();
      await this.auditService.logUpdate(
        tx,
        actorUserId,
        'football_team_members',
        target.id,
        target as unknown as Record<string, unknown>,
        member as unknown as Record<string, unknown>,
      );
      return member;
    });
  }

  async leave(teamId: string, userId: string) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('football-team-role'))`);
      const [member] = await tx.select().from(schema.footballTeamMembers)
        .where(and(eq(schema.footballTeamMembers.teamId, teamId), eq(schema.footballTeamMembers.userId, userId), eq(schema.footballTeamMembers.status, 'ACTIVE'))).limit(1);
      if (!member) throw new NotFoundException('Không tìm thấy thành viên đang hoạt động.');
      if (member.role === 'CAPTAIN') {
        const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(schema.footballTeamMembers)
          .where(and(eq(schema.footballTeamMembers.teamId, teamId), eq(schema.footballTeamMembers.status, 'ACTIVE'), eq(schema.footballTeamMembers.role, 'CAPTAIN')));
        if (Number(count) <= 1) throw new ConflictException('Đội phải có ít nhất một đội trưởng.');
      }
      const [updated] = await tx.update(schema.footballTeamMembers).set({ status: 'LEFT', leftAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.footballTeamMembers.id, member.id)).returning();
      await this.auditService.logUpdate(
        tx,
        userId,
        'football_team_members',
        member.id,
        member as unknown as Record<string, unknown>,
        updated as unknown as Record<string, unknown>,
      );
      return updated;
    });
  }
}
