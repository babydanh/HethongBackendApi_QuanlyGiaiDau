import { Injectable, Inject } from '@nestjs/common';
import type { AppDb } from '../../database/db.types';
import { eq, or, and, ilike, desc, asc, isNull } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';
import { QueryUserDto } from './dto/query-user.dto';

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

    return {
      ...user,
      ranks,
    };
  }

  async createReport(reporterId: string, targetType: 'USER' | 'TOURNAMENT', targetId: string, reason: string, evidenceUrls: string[]) {
    return await this.db
      .insert(schema.reports)
      .values({
        reporterId,
        targetType,
        targetId,
        reason,
        evidenceUrls,
        status: 'PENDING',
      })
      .returning();
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


