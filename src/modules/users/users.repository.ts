import { Injectable, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, or, and, ilike, desc, asc, isNull } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';
import { QueryUserDto } from './dto/query-user.dto';

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findAll(query: QueryUserDto) {
    const { page, limit, search, order } = query;
    const offset = (page! - 1) * limit!;

    let whereClause = isNull(schema.users.deletedAt);
    if (search) {
      whereClause = and(
        or(
          ilike(schema.users.email, `%${search}%`),
          ilike(schema.profiles.fullName, `%${search}%`),
        ),
        isNull(schema.users.deletedAt),
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
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
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

    return {
      data,
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
        createdAt: schema.users.createdAt,
        profile: schema.profiles,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.users.id, id))
      .limit(1);

    return result[0];
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
}
