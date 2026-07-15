import { Injectable, Inject } from '@nestjs/common';
import type { AppDb } from '../../database/db.types';
import { eq, and, isNull } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';

@Injectable()
export class AuthRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  async findUserByEmail(email: string) {
    const users = await this.db
      .select()
      .from(schema.users)
      .where(and(
        eq(schema.users.email, email),
        isNull(schema.users.deletedAt),
      ))
      .limit(1);
    return users[0];
  }

  async findUserRoles(userId: string) {
    const result = await this.db
      .select({
        roleName: schema.roles.name,
      })
      .from(schema.userToRoles)
      .innerJoin(schema.roles, eq(schema.userToRoles.roleId, schema.roles.id))
      .where(eq(schema.userToRoles.userId, userId));

    return result.map((r) => r.roleName);
  }

  async findRoleByName(roleName: string) {
    const roles = await this.db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, roleName))
      .limit(1);
    return roles[0];
  }

  async createDefaultUserRanks(userId: string) {
    // Tạo userRanks mặc định cho tất cả category (ELO 1000, SINGLES)
    const categories = await this.db
      .select({ id: schema.categories.id })
      .from(schema.categories);

    for (const cat of categories) {
      const existing = await this.db
        .select()
        .from(schema.userRanks)
        .where(and(
          eq(schema.userRanks.userId, userId),
          eq(schema.userRanks.categoryId, cat.id),
          eq(schema.userRanks.matchType, 'SINGLES'),
          isNull(schema.userRanks.communityId),
          isNull(schema.userRanks.genderRestriction),
        ))
        .limit(1);

      if (existing.length === 0) {
        await this.db.insert(schema.userRanks).values({
          userId,
          categoryId: cat.id,
          matchType: 'SINGLES',
          eloPoints: 1000,
        }).onConflictDoNothing();
      }
    }
  }

  async createUserWithProfile(
    userData: typeof schema.users.$inferInsert,
    profileData: typeof schema.profiles.$inferInsert,
    defaultRoleId: string,
  ) {
    return await this.db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(schema.users)
        .values(userData)
        .returning();

      profileData.userId = newUser.id;
      await tx.insert(schema.profiles).values(profileData);

      await tx.insert(schema.userToRoles).values({
        userId: newUser.id,
        roleId: defaultRoleId,
      });

      return newUser;
    });
  }

  async createSession(sessionData: typeof schema.sessions.$inferInsert) {
    const [session] = await this.db
      .insert(schema.sessions)
      .values(sessionData)
      .returning();
    return session;
  }

  async findSessionByRefreshToken(refreshToken: string) {
    const sessions = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.refreshToken, refreshToken))
      .limit(1);
    return sessions[0];
  }

  async updateSession(
    id: string,
    updateData: Partial<typeof schema.sessions.$inferInsert>,
  ) {
    return await this.db
      .update(schema.sessions)
      .set(updateData)
      .where(eq(schema.sessions.id, id))
      .returning();
  }

  async revokeSessionByToken(refreshToken: string) {
    return await this.db
      .update(schema.sessions)
      .set({ isRevoked: true, revokedAt: new Date() })
      .where(eq(schema.sessions.refreshToken, refreshToken))
      .returning();
  }

  // --- OAuth Methods ---

  async findAuthProvider(provider: string, providerUserId: string) {
    const result = await this.db
      .select()
      .from(schema.authProviders)
      .where(
        and(
          eq(schema.authProviders.provider, provider),
          eq(schema.authProviders.providerUserId, providerUserId),
        ),
      )
      .limit(1);
    return result[0];
  }

  async createAuthProvider(data: typeof schema.authProviders.$inferInsert) {
    const [record] = await this.db
      .insert(schema.authProviders)
      .values(data)
      .onConflictDoUpdate({
        target: [schema.authProviders.provider, schema.authProviders.providerUserId],
        set: {
          providerEmail: data.providerEmail,
          providerAvatarUrl: data.providerAvatarUrl,
          providerDisplayName: data.providerDisplayName,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        },
      })
      .returning();
    return record;
  }

  async createOAuthUser(
    userData: Omit<typeof schema.users.$inferInsert, 'passwordHash'> & {
      passwordHash: string | null;
    },
    profileData: typeof schema.profiles.$inferInsert,
    defaultRoleId: string,
  ) {
    return await this.db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(schema.users)
        .values({
          ...userData,
          passwordHash: userData.passwordHash,
          isEmailVerified: true, // Google email is verified
        })
        .returning();

      profileData.userId = newUser.id;
      await tx.insert(schema.profiles).values(profileData);

      await tx.insert(schema.userToRoles).values({
        userId: newUser.id,
        roleId: defaultRoleId,
      });

      return newUser;
    });
  }
}


