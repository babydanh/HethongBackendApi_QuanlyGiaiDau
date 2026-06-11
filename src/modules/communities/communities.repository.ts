import { Injectable, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, sql, ilike, SQL, isNull, count } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';
import { QueryCommunityDto } from './dto/query-community.dto';

@Injectable()
export class CommunitiesRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  // --- COMMUNITIES ---

  async findAll(query: QueryCommunityDto) {
    const conditions: SQL[] = [isNull(schema.communities.deletedAt)];

    if (query.status) {
      conditions.push(eq(schema.communities.status, query.status));
    }
    if (query.search) {
      conditions.push(ilike(schema.communities.name, `%${query.search}%`));
    }
    if (query.region) {
      conditions.push(ilike(schema.communities.locationAddress, `%${query.region}%`));
    }

    if (query.lat !== undefined && query.lng !== undefined) {
      const radiusMeters = (query.radiusKm || 10) * 1000;
      const point = sql`ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)`;
      conditions.push(
        sql`ST_DWithin(${schema.communities.locationGeolocation}, ${point}, ${radiusMeters})`,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let dbQuery = this.db
      .select()
      .from(schema.communities)
      .where(whereClause)
      .$dynamic();

    if (query.limit) {
      dbQuery = dbQuery.limit(query.limit);
      if (query.page) {
        dbQuery = dbQuery.offset((query.page - 1) * query.limit);
      }
    }

    return await dbQuery;
  }

  async findMyCommunities(userId: string) {
    const results = await this.db
      .select({
        community: schema.communities,
      })
      .from(schema.communities)
      .innerJoin(
        schema.communityMembers,
        eq(schema.communities.id, schema.communityMembers.communityId),
      )
      .where(
        and(
          eq(schema.communityMembers.userId, userId),
          isNull(schema.communities.deletedAt),
        ),
      );
    return results.map(r => r.community);
  }

  async findById(id: string) {
    const records = await this.db
      .select()
      .from(schema.communities)
      .where(
        and(
          eq(schema.communities.id, id),
          isNull(schema.communities.deletedAt),
        ),
      )
      .limit(1);
    return records[0];
  }

  async create(
    data: Omit<typeof schema.communities.$inferInsert, 'locationGeolocation'>,
    lat?: number,
    lng?: number,
    categoryIds?: string[],
  ) {
    return await this.db.transaction(async (tx) => {
      // 1. Insert community
      // We can't insert locationGeolocation directly via Drizzle object if it's a raw SQL Point in a simple .values(),
      // but Drizzle allows sql`` in .values(). Wait, actually we can if we cast or use sql.
      // Let's use a dynamic approach.
      const valuesToInsert: Record<string, unknown> = { ...data };
      if (lat !== undefined && lng !== undefined) {
        valuesToInsert.locationGeolocation = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
      }

      const [community] = await tx
        .insert(schema.communities)
        .values(valuesToInsert as typeof schema.communities.$inferInsert)
        .returning();

      // 2. Insert category links
      if (categoryIds && categoryIds.length > 0) {
        const sportLinks = categoryIds.map((categoryId) => ({
          communityId: community.id,
          categoryId,
        }));
        await tx.insert(schema.communitySports).values(sportLinks);
      }

      // 3. Make creator the OWNER
      await tx.insert(schema.communityMembers).values({
        communityId: community.id,
        userId: data.creatorId,
        role: 'OWNER',
        status: 'JOINED',
      });

      return community;
    });
  }

  async update(
    id: string,
    data: Partial<typeof schema.communities.$inferInsert>,
    lat?: number,
    lng?: number,
    categoryIds?: string[],
  ) {
    return await this.db.transaction(async (tx) => {
      const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() };

      if (lat !== undefined && lng !== undefined) {
        updateData.locationGeolocation = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
      }

      if (Object.keys(updateData).length > 1) {
        // more than just updatedAt
        await tx
          .update(schema.communities)
          .set(updateData)
          .where(eq(schema.communities.id, id));
      }

      if (categoryIds !== undefined) {
        // Delete old
        await tx
          .delete(schema.communitySports)
          .where(eq(schema.communitySports.communityId, id));
        // Insert new
        if (categoryIds.length > 0) {
          const sportLinks = categoryIds.map((categoryId) => ({
            communityId: id,
            categoryId,
          }));
          await tx.insert(schema.communitySports).values(sportLinks);
        }
      }

      const [updated] = await tx
        .select()
        .from(schema.communities)
        .where(eq(schema.communities.id, id))
        .limit(1);
      return updated;
    });
  }

  async delete(id: string) {
    const [deleted] = await this.db
      .update(schema.communities)
      .set({ deletedAt: new Date() })
      .where(eq(schema.communities.id, id))
      .returning();
    return deleted;
  }

  // --- MEMBERS ---

  async findMember(communityId: string, userId: string) {
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

  async getMembers(communityId: string, status?: string) {
    let condition = eq(schema.communityMembers.communityId, communityId);
    if (status) {
      condition = and(condition, eq(schema.communityMembers.status, status)) as SQL;
    }
    return await this.db
      .select({
        member: schema.communityMembers,
        user: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        }
      })
      .from(schema.communityMembers)
      .innerJoin(schema.users, eq(schema.communityMembers.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(condition);
  }

  async addMember(communityId: string, userId: string, role: string, status: string = 'JOINED', joinAnswers?: Record<string, string>, invitedBy?: string) {
    const [member] = await this.db
      .insert(schema.communityMembers)
      .values({
        communityId,
        userId,
        role,
        status,
        joinAnswers,
        invitedBy,
      } as any)
      .returning();
    return member;
  }

  async updateMemberStatus(communityId: string, userId: string, status: string, approvedBy?: string) {
    const [member] = await this.db
      .update(schema.communityMembers)
      .set({ 
        status,
        ...(approvedBy ? { approvedBy, approvedAt: new Date() } : {})
      } as any)
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .returning();
    return member;
  }

  async updateMemberRole(communityId: string, userId: string, role: string) {
    const [member] = await this.db
      .update(schema.communityMembers)
      .set({ role })
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .returning();
    return member;
  }

  async transferOwnership(communityId: string, currentOwnerId: string, newOwnerId: string) {
    return await this.db.transaction(async (tx) => {
      // 1. Demote current owner to MODERATOR in community_members
      await tx
        .update(schema.communityMembers)
        .set({ role: 'MODERATOR' })
        .where(
          and(
            eq(schema.communityMembers.communityId, communityId),
            eq(schema.communityMembers.userId, currentOwnerId)
          )
        );

      // 2. Promote target user to OWNER in community_members
      await tx
        .update(schema.communityMembers)
        .set({ role: 'OWNER' })
        .where(
          and(
            eq(schema.communityMembers.communityId, communityId),
            eq(schema.communityMembers.userId, newOwnerId)
          )
        );

      // 3. Update creatorId in communities table
      const [updatedCommunity] = await tx
        .update(schema.communities)
        .set({ creatorId: newOwnerId, updatedAt: new Date() })
        .where(eq(schema.communities.id, communityId))
        .returning();

      // Return the promoted member record
      const [newOwnerMember] = await tx
        .select()
        .from(schema.communityMembers)
        .where(
          and(
            eq(schema.communityMembers.communityId, communityId),
            eq(schema.communityMembers.userId, newOwnerId)
          )
        )
        .limit(1);

      return newOwnerMember;
    });
  }


  async removeMember(communityId: string, userId: string) {
    const [member] = await this.db
      .delete(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .returning();
    return member;
  }

  // --- FOLLOWS / FAVORITES ---

  async addFollow(communityId: string, userId: string, type: 'FOLLOW' | 'FAVORITE') {
    const [record] = await this.db
      .insert(schema.communityFollows)
      .values({ communityId, userId, type })
      .onConflictDoNothing()
      .returning();
    return record;
  }

  async removeFollow(communityId: string, userId: string, type: 'FOLLOW' | 'FAVORITE') {
    const [record] = await this.db
      .delete(schema.communityFollows)
      .where(
        and(
          eq(schema.communityFollows.communityId, communityId),
          eq(schema.communityFollows.userId, userId),
          eq(schema.communityFollows.type, type)
        )
      )
      .returning();
    return record;
  }

  async getFavorites(userId: string) {
    return await this.db
      .select({ community: schema.communities })
      .from(schema.communityFollows)
      .innerJoin(schema.communities, eq(schema.communityFollows.communityId, schema.communities.id))
      .where(
        and(
          eq(schema.communityFollows.userId, userId),
          eq(schema.communityFollows.type, 'FAVORITE')
        )
      );
  }

  // --- GALLERY ---
  async getGallery(communityId: string) {
    return await this.db
      .select()
      .from(schema.communityGallery)
      .where(eq(schema.communityGallery.communityId, communityId))
      .orderBy(sql`${schema.communityGallery.createdAt} DESC`);
  }

  async addGalleryItem(communityId: string, uploaderId: string, imageUrl: string, caption?: string) {
    const [item] = await this.db
      .insert(schema.communityGallery)
      .values({
        communityId,
        uploaderId,
        imageUrl,
        caption,
      })
      .returning();
    return item;
  }

  // --- TOURNAMENTS ---
  async getTournaments(communityId: string, status?: string) {
    let condition = eq(schema.tournaments.communityId, communityId);
    if (status && status !== 'ALL') {
      condition = and(condition, eq(schema.tournaments.status, status)) as SQL;
    }
    return await this.db
      .select()
      .from(schema.tournaments)
      .where(condition)
      .orderBy(sql`${schema.tournaments.createdAt} DESC`);
  }

  // --- RANKINGS ---
  async getRankings(communityId: string, limit: number = 100) {
    return await this.db
      .select({
        rank: schema.userRanks,
        user: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        }
      })
      .from(schema.userRanks)
      .innerJoin(schema.users, eq(schema.userRanks.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.userRanks.communityId, communityId))
      .orderBy(sql`${schema.userRanks.eloPoints} DESC`)
      .limit(limit);
  }

  async removeGalleryItem(communityId: string, imageId: string) {
    const [item] = await this.db
      .delete(schema.communityGallery)
      .where(
        and(
          eq(schema.communityGallery.id, imageId),
          eq(schema.communityGallery.communityId, communityId)
        )
      )
      .returning();
    return item;
  }

  async countActiveByCreator(creatorId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.communities)
      .where(
        and(
          eq(schema.communities.creatorId, creatorId),
          isNull(schema.communities.deletedAt),
        )
      );
    return result.count;
  }
}
