import { Injectable, Inject } from '@nestjs/common';
import type { AppDb } from '../../database/db.types';
import { eq, and, sql, ilike, SQL, isNull, count } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';
import { QueryCommunityDto } from './dto/query-community.dto';

@Injectable()
export class CommunitiesRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  // --- COMMUNITIES ---

  async findAll(query: QueryCommunityDto) {
    const conditions: SQL[] = [isNull(schema.communities.deletedAt)];

    if (query.status) {
      conditions.push(eq(schema.communities.status, query.status));
    }
    // Mặc định: không hiện cộng đồng Riêng tư (PRIVATE) trong danh sách công khai
    conditions.push(sql`${schema.communities.visibility} != 'PRIVATE'`);
    if (query.search) {
      conditions.push(ilike(schema.communities.name, `%${query.search}%`));
    }
    if (query.region) {
      conditions.push(ilike(schema.communities.locationAddress, `%${query.region}%`));
    }
    if (query.provinceCode) {
      conditions.push(eq(schema.communities.provinceCode, query.provinceCode));
    }
    if (query.categoryId) {
      const subquery = this.db
        .select({ communityId: schema.communitySports.communityId })
        .from(schema.communitySports)
        .where(eq(schema.communitySports.categoryId, query.categoryId));
      conditions.push(sql`${schema.communities.id} IN ${subquery}`);
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

    const communitiesList = await dbQuery;

    if (communitiesList.length === 0) {
      return [];
    }

    const communityIds = communitiesList.map((c) => c.id);

    // 1. Fetch categories for each community
    const sportsLinks = await this.db
      .select({
        communityId: schema.communitySports.communityId,
        category: schema.categories,
      })
      .from(schema.communitySports)
      .innerJoin(schema.categories, eq(schema.communitySports.categoryId, schema.categories.id))
      .where(sql`${schema.communitySports.communityId} IN ${communityIds}`);

    const categoriesMap: Record<string, any[]> = {};
    sportsLinks.forEach((link) => {
      if (!categoriesMap[link.communityId]) {
        categoriesMap[link.communityId] = [];
      }
      categoriesMap[link.communityId].push(link.category);
    });

    // 2. Fetch member counts for each community
    const membersCount = await this.db
      .select({
        communityId: schema.communityMembers.communityId,
        count: sql<number>`count(${schema.communityMembers.id})`,
      })
      .from(schema.communityMembers)
      .where(
        and(
          sql`${schema.communityMembers.communityId} IN ${communityIds}`,
          eq(schema.communityMembers.status, 'JOINED')
        )
      )
      .groupBy(schema.communityMembers.communityId);

    const membersCountMap: Record<string, number> = {};
    membersCount.forEach((mc) => {
      membersCountMap[mc.communityId] = Number(mc.count);
    });

    // 3. Fetch tournament counts for each community
    const tournamentsCount = await this.db
      .select({
        communityId: schema.tournaments.communityId,
        count: sql<number>`count(${schema.tournaments.id})`,
      })
      .from(schema.tournaments)
      .where(
        and(
          sql`${schema.tournaments.communityId} IN ${communityIds}`,
          isNull(schema.tournaments.deletedAt),
          sql`${schema.tournaments.status} NOT IN ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED')`
        )
      )
      .groupBy(schema.tournaments.communityId);

    const tournamentsCountMap: Record<string, number> = {};
    tournamentsCount.forEach((tc) => {
      if (tc.communityId) {
        tournamentsCountMap[tc.communityId] = Number(tc.count);
      }
    });

    // Map them together
    return communitiesList.map((community) => ({
      ...community,
      categories: categoriesMap[community.id] || [],
      _count: {
        members: membersCountMap[community.id] || 0,
        tournaments: tournamentsCountMap[community.id] || 0,
      },
    })) as any;
  }

  async findMyCommunities(userId: string) {
    const created = await this.db
      .select({
        community: schema.communities,
        myRole: schema.communityMembers.role,
      })
      .from(schema.communities)
      .leftJoin(
        schema.communityMembers,
        and(
          eq(schema.communities.id, schema.communityMembers.communityId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .where(
        and(
          eq(schema.communities.creatorId, userId),
          eq(schema.communities.status, 'ACTIVE'),
          isNull(schema.communities.deletedAt),
        ),
      );

    const joined = await this.db
      .select({
        community: schema.communities,
        myRole: schema.communityMembers.role,
      })
      .from(schema.communities)
      .innerJoin(
        schema.communityMembers,
        eq(schema.communities.id, schema.communityMembers.communityId),
      )
      .where(
        and(
          eq(schema.communityMembers.userId, userId),
          eq(schema.communityMembers.status, 'JOINED'),
          sql`${schema.communities.creatorId} != ${userId}`,
          eq(schema.communities.status, 'ACTIVE'),
          isNull(schema.communities.deletedAt),
        ),
      );

    return {
      created: created.map((result) => ({
        ...result.community,
        myRole: result.myRole || 'OWNER',
      })),
      joined: joined.map((result) => ({
        ...result.community,
        myRole: result.myRole || 'MEMBER',
      })),
    };
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
    if (records.length === 0) {
      return null;
    }
    const community = records[0];

    const [memberCount, tournamentCount] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(schema.communityMembers)
        .where(
          and(
            eq(schema.communityMembers.communityId, id),
            eq(schema.communityMembers.status, 'JOINED'),
          ),
        ),
      this.db
        .select({ count: count() })
        .from(schema.tournaments)
        .where(
          and(
            eq(schema.tournaments.communityId, id),
            isNull(schema.tournaments.deletedAt),
            sql`${schema.tournaments.status} NOT IN ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED')`,
          ),
        ),
    ]);

    // Fetch categories for this community
    const sportsLinks = await this.db
      .select({
        category: schema.categories,
      })
      .from(schema.communitySports)
      .innerJoin(schema.categories, eq(schema.communitySports.categoryId, schema.categories.id))
      .where(eq(schema.communitySports.communityId, id));

    return {
      ...community,
      categories: sportsLinks.map((link) => link.category),
      _count: {
        members: Number(memberCount[0]?.count ?? 0),
        tournaments: Number(tournamentCount[0]?.count ?? 0),
      },
    };
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
      } as typeof schema.communityMembers.$inferInsert)
      .returning();
    return member;
  }

  async updateMemberStatus(communityId: string, userId: string, status: string, approvedBy?: string) {
    const [member] = await this.db
      .update(schema.communityMembers)
      .set({ 
        status,
        ...(approvedBy ? { approvedBy, approvedAt: new Date() } : {})
      })
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

  async findGalleryItemById(communityId: string, imageId: string) {
    const [item] = await this.db
      .select()
      .from(schema.communityGallery)
      .where(
        and(
          eq(schema.communityGallery.id, imageId),
          eq(schema.communityGallery.communityId, communityId)
        )
      )
      .limit(1);
    return item || null;
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
    let condition = and(
      eq(schema.tournaments.communityId, communityId),
      eq(schema.tournaments.visibility, 'PUBLIC'),
      isNull(schema.tournaments.deletedAt),
      sql`${schema.tournaments.status} NOT IN ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED')`
    ) as SQL;
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
        rank: schema.communityRankings,
        user: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        }
      })
      .from(schema.communityRankings)
      .innerJoin(schema.users, eq(schema.communityRankings.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(and(
        eq(schema.communityRankings.communityId, communityId),
        sql`${schema.communityRankings.matchesPlayed} > 0`,
      ))
      .orderBy(sql`${schema.communityRankings.eloPoints} DESC`)
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

