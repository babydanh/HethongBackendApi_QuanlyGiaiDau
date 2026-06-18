import { Injectable, Inject } from '@nestjs/common';
import type { AppDb } from '../../database/db.types';
import { eq, or, and, sql } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';

@Injectable()
export class ChallengesRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  async create(data: {
    challengerId: string;
    challengedId: string;
    senderUserId: string;
    message?: string;
    scheduledAt?: Date;
  }) {
    const [challenge] = await this.db
      .insert(schema.communityChallenges)
      .values({
        challengerId: data.challengerId,
        challengedId: data.challengedId,
        senderUserId: data.senderUserId,
        message: data.message || null,
        scheduledAt: data.scheduledAt || null,
        status: 'PENDING',
      })
      .returning();
    return challenge;
  }

  async findById(id: string) {
    const records = await this.db
      .select({
        challenge: schema.communityChallenges,
        challenger: {
          id: schema.communities.id,
          name: schema.communities.name,
          logoUrl: schema.communities.logoUrl,
        },
        challenged: {
          id: schema.communities.id,
          name: schema.communities.name,
          logoUrl: schema.communities.logoUrl,
        },
      })
      .from(schema.communityChallenges)
      .innerJoin(
        schema.communities,
        eq(schema.communityChallenges.challengerId, schema.communities.id),
      )
      // We need another join with communities for challenged. Let's do an alias or use alias in Drizzle?
      // Wait, Drizzle supports aliasing tables using an alias function, or we can just leftJoin/innerJoin.
      // In Drizzle, to join the same table twice, we must use an alias.
      // Let's see how table aliases are imported in Drizzle:
      // const challengedCommunities = aliasedTable(schema.communities, 'challenged_communities');
      // Let's see if we can use sql or alias.
      // Wait, let's write it cleanly using aliasing:
      // import { aliasedTable } from 'drizzle-orm';
      // or we can use two queries, or write it directly in repository.
      // Actually, we can fetch the challenge first, and then fetch the communities using their IDs. That's simple, reliable, type-safe, and avoids any Drizzle aliasing syntax issues!
      // Let's do that! It is 100% robust and clean.
    return this.db
      .select()
      .from(schema.communityChallenges)
      .where(eq(schema.communityChallenges.id, id))
      .limit(1)
      .then((res) => res[0] || null);
  }

  async findByCommunity(communityId: string) {
    // Return all challenges where community is challenger or challenged
    return this.db
      .select()
      .from(schema.communityChallenges)
      .where(
        or(
          eq(schema.communityChallenges.challengerId, communityId),
          eq(schema.communityChallenges.challengedId, communityId),
        ),
      )
      .orderBy(sql`${schema.communityChallenges.createdAt} DESC`);
  }

  async updateStatus(id: string, status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED', tournamentId?: string) {
    const [updated] = await this.db
      .update(schema.communityChallenges)
      .set({
        status,
        ...(tournamentId && { tournamentId }),
        updatedAt: new Date(),
      })
      .where(eq(schema.communityChallenges.id, id))
      .returning();
    return updated;
  }

  async getCommunitySports(communityId: string) {
    return this.db
      .select({
        categoryId: schema.communitySports.categoryId,
      })
      .from(schema.communitySports)
      .where(eq(schema.communitySports.communityId, communityId));
  }

  async getCommunityNameAndLogo(id: string) {
    const [comm] = await this.db
      .select({
        id: schema.communities.id,
        name: schema.communities.name,
        logoUrl: schema.communities.logoUrl,
      })
      .from(schema.communities)
      .where(eq(schema.communities.id, id))
      .limit(1);
    return comm || null;
  }

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
    return records[0] || null;
  }
}


