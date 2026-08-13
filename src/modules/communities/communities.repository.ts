import { Injectable, Inject } from '@nestjs/common';
import type { AppDb } from '../../database/db.types';
import {
  eq,
  and,
  sql,
  ilike,
  SQL,
  isNull,
  count,
  desc,
  lt,
  or,
  inArray,
  gte,
  lte,
} from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { QueryCommunityDto } from './dto/query-community.dto';
import { CursorPaginationHelper } from '../../common/helpers/cursor-pagination.helper';

const VIETNAMESE_DIACRITIC_CHARACTERS =
  'ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴàáạảãâầấậẩẫăằắặẳẵÈÉẸẺẼÊỀẾỆỂỄèéẹẻẽêềếệểễÌÍỊỈĨìíịỉĩÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠòóọỏõôồốộổỗơờớợởỡÙÚỤỦŨƯỪỨỰỬỮùúụủũưừứựửữỲÝỴỶỸỳýỵỷỹĐđ';
const VIETNAMESE_ASCII_CHARACTERS = [
  'A'.repeat(17),
  'a'.repeat(17),
  'E'.repeat(11),
  'e'.repeat(11),
  'I'.repeat(5),
  'i'.repeat(5),
  'O'.repeat(17),
  'o'.repeat(17),
  'U'.repeat(11),
  'u'.repeat(11),
  'Y'.repeat(5),
  'y'.repeat(5),
  'Dd',
].join('');

@Injectable()
export class CommunitiesRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly auditService: AuditService,
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
      conditions.push(
        ilike(schema.communities.locationAddress, `%${query.region}%`),
      );
    }
    if (query.provinceCode) {
      conditions.push(eq(schema.communities.provinceCode, query.provinceCode));
    }
    if (query.categoryId) {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          query.categoryId,
        );
      const subquery = this.db
        .select({ communityId: schema.communitySports.communityId })
        .from(schema.communitySports)
        .innerJoin(
          schema.categories,
          eq(schema.communitySports.categoryId, schema.categories.id),
        )
        .where(
          isUuid
            ? eq(schema.communitySports.categoryId, query.categoryId)
            : eq(schema.categories.slug, query.categoryId),
        );
      conditions.push(sql`${schema.communities.id} IN ${subquery}`);
    }

    if (query.lat !== undefined && query.lng !== undefined) {
      const radiusMeters = (query.radiusKm || 10) * 1000;
      const point = sql`ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)`;
      conditions.push(
        sql`ST_DWithin(${schema.communities.locationGeolocation}, ${point}, ${radiusMeters})`,
      );
    }

    const baseWhereClause =
      conditions.length > 0 ? and(...conditions) : undefined;
    const decodedCursor = query.cursor
      ? CursorPaginationHelper.decodeCursor<{ id: string; createdAt: string }>(
          query.cursor,
        )
      : null;
    if (decodedCursor) {
      conditions.push(
        or(
          lt(schema.communities.createdAt, new Date(decodedCursor.createdAt)),
          and(
            eq(schema.communities.createdAt, new Date(decodedCursor.createdAt)),
            lt(schema.communities.id, decodedCursor.id),
          ),
        ) as SQL,
      );
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.communities)
      .where(baseWhereClause);

    let dbQuery = this.db
      .select()
      .from(schema.communities)
      .where(whereClause)
      .$dynamic();

    const limit = query.limit ?? 10;
    dbQuery = dbQuery
      .orderBy(desc(schema.communities.createdAt), desc(schema.communities.id))
      .limit(limit + 1);

    const rawCommunities = await dbQuery;
    const hasMore = rawCommunities.length > limit;
    const communitiesList = hasMore
      ? rawCommunities.slice(0, limit)
      : rawCommunities;

    if (communitiesList.length === 0) {
      return {
        data: [],
        meta: {
          total: totalRecord.count,
          page: query.page ?? 1,
          limit,
          totalPages: Math.ceil(totalRecord.count / limit),
          nextCursor: null,
          hasMore: false,
        },
      };
    }

    const communityIds = communitiesList.map((c) => c.id);

    // 1. Fetch categories for each community
    const sportsLinks = await this.db
      .select({
        communityId: schema.communitySports.communityId,
        category: schema.categories,
      })
      .from(schema.communitySports)
      .innerJoin(
        schema.categories,
        eq(schema.communitySports.categoryId, schema.categories.id),
      )
      .where(sql`${schema.communitySports.communityId} IN ${communityIds}`);

    const categoriesMap: Record<string, unknown[]> = {};
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
          eq(schema.communityMembers.status, 'JOINED'),
        ),
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
          sql`${schema.tournaments.status} NOT IN ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED')`,
        ),
      )
      .groupBy(schema.tournaments.communityId);

    const tournamentsCountMap: Record<string, number> = {};
    tournamentsCount.forEach((tc) => {
      if (tc.communityId) {
        tournamentsCountMap[tc.communityId] = Number(tc.count);
      }
    });

    // Map them together
    const data = communitiesList.map((community) => ({
      ...community,
      categories: categoriesMap[community.id] || [],
      _count: {
        members: membersCountMap[community.id] || 0,
        tournaments: tournamentsCountMap[community.id] || 0,
      },
    }));
    const lastCommunity = communitiesList[communitiesList.length - 1];
    return {
      data,
      meta: {
        total: totalRecord.count,
        page: query.page ?? 1,
        limit,
        totalPages: Math.ceil(totalRecord.count / limit),
        nextCursor: hasMore
          ? CursorPaginationHelper.encodeCursor({
              id: lastCommunity.id,
              createdAt: lastCommunity.createdAt,
            })
          : null,
        hasMore,
      },
    };
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
      .innerJoin(
        schema.categories,
        eq(schema.communitySports.categoryId, schema.categories.id),
      )
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
      const updateData: Record<string, unknown> = {
        ...data,
        updatedAt: new Date(),
      };

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

  async findMyMembership(userId: string, communityId: string) {
    const [member] = await this.db
      .select()
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .limit(1);
    return member || null;
  }

  async getMembers(
    communityId: string,
    query?: {
      status?: string;
      page?: number;
      limit?: number;
      cursor?: string;
      search?: string;
      mentionable?: boolean;
    },
  ) {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const cursor = query?.cursor;
    const conditions: SQL[] = [
      eq(schema.communityMembers.communityId, communityId),
    ];
    if (query?.status) {
      conditions.push(eq(schema.communityMembers.status, query.status));
    }
    if (query?.mentionable) {
      conditions.push(isNull(schema.users.deletedAt));
    }
    const search = query?.search?.trim();
    if (search) {
      const normalizedSearch = search
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/đ/gu, 'd')
        .replace(/Đ/gu, 'D')
        .toLocaleLowerCase('vi-VN')
        .replace(/[\\%_]/g, '\\$&');
      conditions.push(sql`
        lower(translate(
          ${schema.profiles.fullName},
          ${VIETNAMESE_DIACRITIC_CHARACTERS},
          ${VIETNAMESE_ASCII_CHARACTERS}
        )) LIKE ${`%${normalizedSearch}%`}
      `);
    }
    const baseWhereClause = and(...conditions);
    const decodedCursor = cursor
      ? CursorPaginationHelper.decodeCursor<{
          id: string;
          joinedAt: string;
          rolePriority?: number;
        }>(cursor)
      : null;
    if (decodedCursor) {
      const rolePriority = sql<number>`CASE WHEN ${schema.communityMembers.role} IN ('OWNER', 'MODERATOR') THEN 0 ELSE 1 END`;
      const cursorRolePriority = decodedCursor.rolePriority ?? 1;
      conditions.push(
        or(
          lt(rolePriority, cursorRolePriority),
          and(
            eq(rolePriority, cursorRolePriority),
            lt(
              schema.communityMembers.joinedAt,
              new Date(decodedCursor.joinedAt),
            ),
          ),
          and(
            eq(rolePriority, cursorRolePriority),
            eq(
              schema.communityMembers.joinedAt,
              new Date(decodedCursor.joinedAt),
            ),
            lt(schema.communityMembers.id, decodedCursor.id),
          ),
        ) as SQL,
      );
    }
    const whereClause =
      conditions.length > 1 ? and(...conditions) : conditions[0];

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.communityMembers)
      .innerJoin(
        schema.users,
        eq(schema.communityMembers.userId, schema.users.id),
      )
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(baseWhereClause);

    const membersQuery = this.db
      .select({
        member: schema.communityMembers,
        user: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        },
      })
      .from(schema.communityMembers)
      .innerJoin(
        schema.users,
        eq(schema.communityMembers.userId, schema.users.id),
      )
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(whereClause)
      .orderBy(
        sql`CASE WHEN ${schema.communityMembers.role} IN ('OWNER', 'MODERATOR') THEN 0 ELSE 1 END`,
        desc(schema.communityMembers.joinedAt),
        desc(schema.communityMembers.id),
      )
      .limit(limit + 1)
      .$dynamic();
    const rawData = await membersQuery;
    const hasMore = rawData.length > limit;
    const data = hasMore ? rawData.slice(0, limit) : rawData;

    return {
      data,
      meta: {
        total: totalRecord.count,
        page,
        limit,
        totalPages: Math.ceil(totalRecord.count / limit),
        nextCursor:
          hasMore && data.length > 0
            ? CursorPaginationHelper.encodeCursor({
                id: data[data.length - 1].member.id,
                joinedAt: data[data.length - 1].member.joinedAt,
                rolePriority: ['OWNER', 'MODERATOR'].includes(
                  data[data.length - 1].member.role,
                )
                  ? 0
                  : 1,
              })
            : null,
        hasMore,
      },
    };
  }

  async findInvitesByUser(userId: string) {
    const rows = await this.db
      .select({
        id: schema.communityMembers.id,
        communityId: schema.communityMembers.communityId,
        communityName: schema.communities.name,
        communityAvatar: schema.communities.logoUrl,
        communityLogoUrl: schema.communities.logoUrl,
        communityBannerUrl: schema.communities.bannerUrl,
        inviterName: schema.profiles.fullName,
        inviterAvatar: schema.profiles.avatarUrl,
        role: schema.communityMembers.role,
        invitedAt: schema.communityMembers.joinedAt,
      })
      .from(schema.communityMembers)
      .innerJoin(
        schema.communities,
        eq(schema.communityMembers.communityId, schema.communities.id),
      )
      .leftJoin(
        schema.users,
        eq(schema.communityMembers.invitedBy, schema.users.id),
      )
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(
        and(
          eq(schema.communityMembers.userId, userId),
          eq(schema.communityMembers.status, 'INVITED'),
          isNull(schema.communities.deletedAt),
        ),
      )
      .orderBy(sql`${schema.communityMembers.joinedAt} DESC`);

    return rows.map((row) => ({
      ...row,
      inviterName: row.inviterName || 'Ban quản trị',
      inviterAvatar: row.inviterAvatar || null,
      createdAt: row.invitedAt,
      status: 'PENDING',
    }));
  }

  async addMember(
    communityId: string,
    userId: string,
    role: string,
    status: string = 'JOINED',
    joinAnswers?: Record<string, string>,
    invitedBy?: string,
  ) {
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

  async updateMemberStatus(
    communityId: string,
    userId: string,
    status: string,
    approvedBy?: string,
  ) {
    const [member] = await this.db
      .update(schema.communityMembers)
      .set({
        status,
        ...(approvedBy ? { approvedBy, approvedAt: new Date() } : {}),
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

  /**
   * P2C.2 — Replace toàn bộ tags BQT của member (kèm audit log trong cùng transaction).
   * Trả member mới kèm `tags`; trả null nếu member không tồn tại.
   */
  async updateMemberTags(
    communityId: string,
    userId: string,
    tags: string[],
    actorId: string,
  ) {
    return await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(schema.communityMembers)
        .where(
          and(
            eq(schema.communityMembers.communityId, communityId),
            eq(schema.communityMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!current) {
        return null;
      }

      const [member] = await tx
        .update(schema.communityMembers)
        .set({ tags })
        .where(
          and(
            eq(schema.communityMembers.communityId, communityId),
            eq(schema.communityMembers.userId, userId),
          ),
        )
        .returning();

      await this.auditService.logUpdate(
        tx,
        actorId,
        'community_members',
        current.id,
        { tags: current.tags ?? [] },
        { tags: member?.tags ?? [] },
      );

      return member;
    });
  }

  async transferOwnership(
    communityId: string,
    currentOwnerId: string,
    newOwnerId: string,
  ) {
    return await this.db.transaction(async (tx) => {
      // 1. Demote current owner to MODERATOR in community_members
      await tx
        .update(schema.communityMembers)
        .set({ role: 'MODERATOR' })
        .where(
          and(
            eq(schema.communityMembers.communityId, communityId),
            eq(schema.communityMembers.userId, currentOwnerId),
          ),
        );

      // 2. Promote target user to OWNER in community_members
      await tx
        .update(schema.communityMembers)
        .set({ role: 'OWNER' })
        .where(
          and(
            eq(schema.communityMembers.communityId, communityId),
            eq(schema.communityMembers.userId, newOwnerId),
          ),
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
            eq(schema.communityMembers.userId, newOwnerId),
          ),
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

  async addFollow(
    communityId: string,
    userId: string,
    type: 'FOLLOW' | 'FAVORITE',
  ) {
    const [record] = await this.db
      .insert(schema.communityFollows)
      .values({ communityId, userId, type })
      .onConflictDoNothing()
      .returning();
    return record;
  }

  async removeFollow(
    communityId: string,
    userId: string,
    type: 'FOLLOW' | 'FAVORITE',
  ) {
    const [record] = await this.db
      .delete(schema.communityFollows)
      .where(
        and(
          eq(schema.communityFollows.communityId, communityId),
          eq(schema.communityFollows.userId, userId),
          eq(schema.communityFollows.type, type),
        ),
      )
      .returning();
    return record;
  }

  async getFavorites(userId: string) {
    return await this.db
      .select({ community: schema.communities })
      .from(schema.communityFollows)
      .innerJoin(
        schema.communities,
        eq(schema.communityFollows.communityId, schema.communities.id),
      )
      .where(
        and(
          eq(schema.communityFollows.userId, userId),
          eq(schema.communityFollows.type, 'FAVORITE'),
        ),
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
          eq(schema.communityGallery.communityId, communityId),
        ),
      )
      .limit(1);
    return item || null;
  }

  async addGalleryItem(
    communityId: string,
    uploaderId: string,
    imageUrl: string,
    caption?: string,
  ) {
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
      sql`${schema.tournaments.status} NOT IN ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED')`,
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
        },
      })
      .from(schema.communityRankings)
      .innerJoin(
        schema.users,
        eq(schema.communityRankings.userId, schema.users.id),
      )
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(
        and(
          eq(schema.communityRankings.communityId, communityId),
          sql`${schema.communityRankings.matchesPlayed} > 0`,
        ),
      )
      .orderBy(sql`${schema.communityRankings.eloPoints} DESC`)
      .limit(limit);
  }

  // --- DASHBOARD ---

  async getRecentMatches(communityId: string, limit: number = 3) {
    const matches = await this.db
      .select({
        id: schema.matches.id,
        scoreA: schema.matches.p1SetsWon,
        scoreB: schema.matches.p2SetsWon,
        status: schema.matches.status,
        playedAt: schema.matches.completedAt,
      })
      .from(schema.matches)
      .innerJoin(
        schema.tournaments,
        eq(schema.matches.tournamentId, schema.tournaments.id),
      )
      .where(
        and(
          eq(schema.tournaments.communityId, communityId),
          eq(schema.matches.status, 'COMPLETED'),
          isNull(schema.matches.deletedAt),
        ),
      )
      .orderBy(desc(schema.matches.completedAt))
      .limit(limit);

    if (matches.length === 0) {
      return [];
    }

    const matchIds = matches.map((m) => m.id);
    const players = await this.findMatchPlayers(matchIds);
    const playersByMatch = this.groupMatchPlayers(players);

    return matches.map((match) => {
      const matchPlayers = playersByMatch.get(match.id) || [];
      const eloDelta = matchPlayers.reduce((max, player) => {
        const delta = player.changedPoints ?? 0;
        return Math.abs(delta) > Math.abs(max) ? delta : max;
      }, 0);

      return {
        id: match.id,
        playerA: this.toDashboardPlayer(matchPlayers.slice(0, 2)),
        playerB: this.toDashboardPlayer(matchPlayers.slice(2, 4)),
        scoreA: match.scoreA,
        scoreB: match.scoreB,
        status: match.status,
        eloDelta,
        playedAt: match.playedAt,
      };
    });
  }

  async getUpcomingMatches(communityId: string, limit: number = 3) {
    const matches = await this.db
      .select({
        id: schema.matches.id,
        scheduledAt: schema.matches.scheduledAt,
      })
      .from(schema.matches)
      .innerJoin(
        schema.tournaments,
        eq(schema.matches.tournamentId, schema.tournaments.id),
      )
      .where(
        and(
          eq(schema.tournaments.communityId, communityId),
          eq(schema.matches.status, 'SCHEDULED'),
          gte(schema.matches.scheduledAt, new Date()),
          isNull(schema.matches.deletedAt),
        ),
      )
      .orderBy(schema.matches.scheduledAt)
      .limit(limit);

    if (matches.length === 0) {
      return [];
    }

    const matchIds = matches.map((m) => m.id);
    const players = await this.findMatchPlayers(matchIds);
    const playersByMatch = this.groupMatchPlayers(players);

    return matches.map((match) => {
      const matchPlayers = playersByMatch.get(match.id) || [];
      return {
        id: match.id,
        playerA: this.toDashboardPlayer(matchPlayers.slice(0, 2)),
        playerB: this.toDashboardPlayer(matchPlayers.slice(2, 4)),
        scheduledAt: match.scheduledAt,
      };
    });
  }

  async getFeaturedTournament(communityId: string) {
    const [tournament] = await this.db
      .select()
      .from(schema.tournaments)
      .where(
        and(
          eq(schema.tournaments.communityId, communityId),
          isNull(schema.tournaments.deletedAt),
          sql`${schema.tournaments.status} NOT IN ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED', 'PENDING_DELETE')`,
        ),
      )
      .orderBy(desc(schema.tournaments.createdAt))
      .limit(1);

    if (!tournament) {
      return null;
    }

    const [participantCountResult] = await this.db
      .select({ count: count() })
      .from(schema.tournamentParticipants)
      .where(eq(schema.tournamentParticipants.tournamentId, tournament.id));

    return {
      id: tournament.id,
      name: tournament.name,
      status: tournament.status,
      participantCount: Number(participantCountResult?.count ?? 0),
      championName: await this.findTournamentChampionName(tournament.id),
    };
  }

  async getTopRanked(communityId: string, limit: number = 3) {
    const rows = await this.db
      .select({
        userId: schema.communityRankings.userId,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
        elo: schema.communityRankings.eloPoints,
        tierName: schema.eloTiers.name,
        winStreak: schema.communityRankings.winStreak,
      })
      .from(schema.communityRankings)
      .innerJoin(
        schema.users,
        eq(schema.communityRankings.userId, schema.users.id),
      )
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .leftJoin(
        schema.eloTiers,
        and(
          eq(schema.communityRankings.categoryId, schema.eloTiers.categoryId),
          lte(schema.eloTiers.minElo, schema.communityRankings.eloPoints),
          gte(schema.eloTiers.maxElo, schema.communityRankings.eloPoints),
        ),
      )
      .where(
        and(
          eq(schema.communityRankings.communityId, communityId),
          sql`${schema.communityRankings.matchesPlayed} > 0`,
        ),
      )
      .orderBy(desc(schema.communityRankings.eloPoints))
      .limit(limit);

    return rows.map((row, index) => ({ ...row, rank: index + 1 }));
  }

  async getActivityFeed(communityId: string, limit: number = 5) {
    const [memberJoins, galleryAdds, tournamentCreates] = await Promise.all([
      this.db
        .select({
          userId: schema.communityMembers.userId,
          userName: schema.profiles.fullName,
          at: schema.communityMembers.joinedAt,
        })
        .from(schema.communityMembers)
        .innerJoin(
          schema.users,
          eq(schema.communityMembers.userId, schema.users.id),
        )
        .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
        .where(
          and(
            eq(schema.communityMembers.communityId, communityId),
            eq(schema.communityMembers.status, 'JOINED'),
          ),
        )
        .orderBy(desc(schema.communityMembers.joinedAt))
        .limit(limit),
      this.db
        .select({
          userId: schema.communityGallery.uploaderId,
          userName: schema.profiles.fullName,
          at: schema.communityGallery.createdAt,
        })
        .from(schema.communityGallery)
        .leftJoin(
          schema.users,
          eq(schema.communityGallery.uploaderId, schema.users.id),
        )
        .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
        .where(eq(schema.communityGallery.communityId, communityId))
        .orderBy(desc(schema.communityGallery.createdAt))
        .limit(limit),
      this.db
        .select({
          userId: schema.tournaments.createdBy,
          userName: schema.profiles.fullName,
          at: schema.tournaments.createdAt,
        })
        .from(schema.tournaments)
        .innerJoin(
          schema.users,
          eq(schema.tournaments.createdBy, schema.users.id),
        )
        .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
        .where(
          and(
            eq(schema.tournaments.communityId, communityId),
            isNull(schema.tournaments.deletedAt),
          ),
        )
        .orderBy(desc(schema.tournaments.createdAt))
        .limit(limit),
    ]);

    return [
      ...memberJoins.map((item) => ({
        type: 'MEMBER_JOINED' as const,
        userId: item.userId,
        userName: item.userName || 'Thành viên',
        message: 'gia nhập CLB',
        at: item.at,
      })),
      ...galleryAdds.map((item) => ({
        type: 'GALLERY_ADDED' as const,
        userId: item.userId,
        userName: item.userName || 'Thành viên',
        message: 'đã thêm ảnh vào thư viện',
        at: item.at,
      })),
      ...tournamentCreates.map((item) => ({
        type: 'TOURNAMENT_CREATED' as const,
        userId: item.userId,
        userName: item.userName || 'Thành viên',
        message: 'đã tạo giải đấu',
        at: item.at,
      })),
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, limit);
  }

  private async findMatchPlayers(matchIds: string[]) {
    return await this.db
      .select({
        matchId: schema.matchPlayers.matchId,
        userId: schema.users.id,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
        changedPoints: schema.eloHistoryLogs.changedPoints,
      })
      .from(schema.matchPlayers)
      .innerJoin(schema.users, eq(schema.matchPlayers.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .leftJoin(
        schema.eloHistoryLogs,
        and(
          eq(schema.eloHistoryLogs.matchId, schema.matchPlayers.matchId),
          eq(schema.eloHistoryLogs.userId, schema.matchPlayers.userId),
        ),
      )
      .where(inArray(schema.matchPlayers.matchId, matchIds));
  }

  private groupMatchPlayers(
    players: Awaited<ReturnType<CommunitiesRepository['findMatchPlayers']>>,
  ) {
    const playersByMatch = new Map<string, typeof players>();
    players.forEach((player) => {
      const list = playersByMatch.get(player.matchId) || [];
      list.push(player);
      playersByMatch.set(player.matchId, list);
    });
    return playersByMatch;
  }

  private toDashboardPlayer(
    players: Array<{
      userId: string;
      fullName: string | null;
      avatarUrl: string | null;
    }>,
  ) {
    if (players.length === 0) {
      return null;
    }
    return {
      id: players[0].userId,
      fullName: players.map((p) => p.fullName || 'VĐV').join(' & '),
      avatarUrl: players[0].avatarUrl,
    };
  }

  /** Vô địch = người thắng trận cuối (roundNumber cao nhất) đã COMPLETED — best-effort, null nếu chưa xác định. */
  private async findTournamentChampionName(
    tournamentId: string,
  ): Promise<string | null> {
    const [finalMatch] = await this.db
      .select({ winnerId: schema.matches.winnerId })
      .from(schema.matches)
      .where(
        and(
          eq(schema.matches.tournamentId, tournamentId),
          eq(schema.matches.status, 'COMPLETED'),
          sql`${schema.matches.winnerId} IS NOT NULL`,
        ),
      )
      .orderBy(
        desc(schema.matches.roundNumber),
        desc(schema.matches.matchOrder),
      )
      .limit(1);

    if (!finalMatch?.winnerId) {
      return null;
    }

    const [winner] = await this.db
      .select({ teamName: schema.tournamentParticipants.teamName })
      .from(schema.tournamentParticipants)
      .where(eq(schema.tournamentParticipants.id, finalMatch.winnerId))
      .limit(1);

    if (!winner) {
      return null;
    }

    const [rosterMember] = await this.db
      .select({ fullName: schema.profiles.fullName })
      .from(schema.tournamentRosters)
      .innerJoin(
        schema.users,
        eq(schema.tournamentRosters.userId, schema.users.id),
      )
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(
        and(
          eq(schema.tournamentRosters.participantId, finalMatch.winnerId),
          eq(schema.tournamentRosters.role, 'MAIN'),
        ),
      )
      .limit(1);

    return rosterMember?.fullName || winner.teamName || null;
  }

  async removeGalleryItem(communityId: string, imageId: string) {
    const [item] = await this.db
      .delete(schema.communityGallery)
      .where(
        and(
          eq(schema.communityGallery.id, imageId),
          eq(schema.communityGallery.communityId, communityId),
        ),
      )
      .returning();
    return item;
  }

  /**
   * P2C.3 — Streak thắng/thua hiện tại cho batch userIds (một lần query, không N+1).
   * Chỉ tính trên trận COMPLETED của giải thuộc community (matches → tournaments),
   * winner_id khác null. Trả [{ userId, won, streak }] — `won` = kết quả trận gần nhất,
   * `streak` = số trận liên tiếp cùng kết quả tính từ trận gần nhất (reset khi đổi kết quả).
   */
  async getMatchResultStreaks(
    communityId: string,
    userIds: string[],
  ): Promise<Array<{ userId: string; won: boolean; streak: number }>> {
    if (userIds.length === 0) return [];

    const userIdsArray = sql`ARRAY[${sql.join(
      userIds.map((userId) => sql`${userId}::uuid`),
      sql`, `,
    )}]::uuid[]`;
    const rows = (await this.db.execute(sql`
      WITH user_matches AS (
        SELECT
          mp.user_id AS "userId",
          (m.winner_id = mp.participant_id) AS won,
          m.completed_at AS "completedAt",
          m.id AS "matchId"
        FROM match_players mp
        INNER JOIN matches m ON m.id = mp.match_id
        INNER JOIN tournaments t ON t.id = m.tournament_id
        WHERE t.community_id = ${communityId}
          AND m.status = 'COMPLETED'
          AND m.deleted_at IS NULL
          AND m.winner_id IS NOT NULL
          AND mp.user_id = ANY(${userIdsArray})
      ),
      ordered AS (
        SELECT "userId", won,
          ROW_NUMBER() OVER (
            PARTITION BY "userId" ORDER BY "completedAt" DESC, "matchId" DESC
          ) AS rn
        FROM user_matches
      ),
      groups AS (
        SELECT "userId", won, rn,
          rn - ROW_NUMBER() OVER (PARTITION BY "userId", won ORDER BY rn) AS grp
        FROM ordered
      )
      SELECT DISTINCT ON ("userId")
        "userId",
        won,
        COUNT(*) OVER (PARTITION BY "userId", grp)::int AS streak
      FROM groups
      ORDER BY "userId", rn
    `)) as unknown as Array<{ userId: string; won: boolean; streak: number }>;

    return rows.map((row) => ({
      userId: String(row.userId),
      won: Boolean(row.won),
      streak: Number(row.streak),
    }));
  }

  /**
   * P2C.3 — Tổng ELO tăng trong 7 ngày gần nhất cho batch userIds (chỉ changed_points > 0),
   * scope theo community qua matches → tournaments (elo_history_logs.tournament_id có thể NULL
   * với một số đường ghi trực tiếp — xem rankings.service.ts). Trả [{ userId, gain }].
   */
  async getWeeklyEloGains(
    communityId: string,
    userIds: string[],
  ): Promise<Array<{ userId: string; gain: number }>> {
    if (userIds.length === 0) return [];

    const userIdsArray = sql`ARRAY[${sql.join(
      userIds.map((userId) => sql`${userId}::uuid`),
      sql`, `,
    )}]::uuid[]`;
    const rows = (await this.db.execute(sql`
      SELECT elh.user_id AS "userId", SUM(elh.changed_points)::int AS gain
      FROM elo_history_logs elh
      INNER JOIN matches m ON m.id = elh.match_id
      INNER JOIN tournaments t ON t.id = m.tournament_id
      WHERE t.community_id = ${communityId}
        AND elh.user_id = ANY(${userIdsArray})
        AND elh.changed_points > 0
        AND elh.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY elh.user_id
    `)) as unknown as Array<{ userId: string; gain: number }>;

    return rows.map((row) => ({
      userId: String(row.userId),
      gain: Number(row.gain),
    }));
  }

  async countActiveByCreator(creatorId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.communities)
      .where(
        and(
          eq(schema.communities.creatorId, creatorId),
          isNull(schema.communities.deletedAt),
        ),
      );
    return result.count;
  }

  async listTagPresets(communityId: string) {
    return this.db.select().from(schema.communityTagPresets)
      .where(eq(schema.communityTagPresets.communityId, communityId))
      .orderBy(schema.communityTagPresets.createdAt);
  }

  async createTagPreset(communityId: string, createdBy: string, name: string, color: string) {
    const [created] = await this.db.insert(schema.communityTagPresets)
      .values({ communityId, createdBy, name, color })
      .returning();
    return created;
  }

  async findTagPresetByName(communityId: string, name: string) {
    const [existing] = await this.db.select({ id: schema.communityTagPresets.id })
      .from(schema.communityTagPresets)
      .where(and(
        eq(schema.communityTagPresets.communityId, communityId),
        sql`lower(${schema.communityTagPresets.name}) = lower(${name})`,
      ))
      .limit(1);
    return existing;
  }

  async deleteTagPreset(communityId: string, presetId: string) {
    const [deleted] = await this.db.delete(schema.communityTagPresets)
      .where(and(eq(schema.communityTagPresets.id, presetId), eq(schema.communityTagPresets.communityId, communityId)))
      .returning();
    return deleted;
  }
}
