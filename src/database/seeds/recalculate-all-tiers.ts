import { drizzle } from 'drizzle-orm/postgres-js';
import * as dotenv from 'dotenv';
import { userRanks, eloTiers } from '../schema/categories.schema';
import { eq, and, desc } from 'drizzle-orm';
import { createPostgresClientFromEnv } from '../postgres-client';

dotenv.config();

async function run() {
  const sql = createPostgresClientFromEnv();
  const db = drizzle(sql);

  console.log('--- Recalculating All Player Tiers Started ---');

  try {
    // 1. Get all elo tiers
    const allTiers = await db.select().from(eloTiers);
    console.log(`Fetched ${allTiers.length} tier definitions.`);

    // 2. Get all player rankings
    const allRanks = await db.select().from(userRanks);
    console.log(`Fetched ${allRanks.length} player rank records.`);

    // Group tiers by category
    const tiersByCategory = new Map<string, typeof allTiers>();
    for (const tier of allTiers) {
      if (!tiersByCategory.has(tier.categoryId)) {
        tiersByCategory.set(tier.categoryId, []);
      }
      tiersByCategory.get(tier.categoryId)!.push(tier);
    }

    let updatedCount = 0;

    // Recalculate tier for each rank record
    for (const rank of allRanks) {
      const categoryId = rank.categoryId;
      const matchType = rank.matchType || 'SINGLES';
      const elo = rank.eloPoints;
      
      const categoryTiers = tiersByCategory.get(categoryId) || [];
      if (categoryTiers.length === 0) continue;

      // Find top 1 player in this category/matchType for Tier S
      const [topRank] = await db
        .select({
          id: userRanks.id,
          userId: userRanks.userId,
          eloPoints: userRanks.eloPoints,
        })
        .from(userRanks)
        .where(
          and(
            eq(userRanks.categoryId, categoryId),
            eq(userRanks.matchType, matchType)
          )
        )
        .orderBy(desc(userRanks.eloPoints))
        .limit(1);

      const isTop1Player = topRank && topRank.userId === rank.userId;

      let targetTier: typeof allTiers[0] | undefined;

      const tierS = categoryTiers.find(t => t.name === 'Tier S');
      const tierAHigh = categoryTiers.find(t => t.name === 'High Tier A');
      const tierALow = categoryTiers.find(t => t.name === 'Low Tier A');
      const tierBHigh = categoryTiers.find(t => t.name === 'High Tier B');
      const tierBLow = categoryTiers.find(t => t.name === 'Low Tier B');
      const tierCHigh = categoryTiers.find(t => t.name === 'High Tier C');
      const tierCLow = categoryTiers.find(t => t.name === 'Low Tier C');
      const tierDHigh = categoryTiers.find(t => t.name === 'High Tier D');
      const tierDLow = categoryTiers.find(t => t.name === 'Low Tier D');

      if (isTop1Player && elo >= 2200 && tierS) {
        targetTier = tierS;
      } else {
        if (elo >= 2100 && tierAHigh) targetTier = tierAHigh;
        else if (elo >= 2000 && tierALow) targetTier = tierALow;
        else if (elo >= 1900 && tierBHigh) targetTier = tierBHigh;
        else if (elo >= 1800 && tierBLow) targetTier = tierBLow;
        else if (elo >= 1700 && tierCHigh) targetTier = tierCHigh;
        else if (elo >= 1600 && tierCLow) targetTier = tierCLow;
        else if (elo >= 1500 && tierDHigh) targetTier = tierDHigh;
        else if (tierDLow) targetTier = tierDLow;
      }

      if (targetTier) {
        await db
          .update(userRanks)
          .set({ tierId: targetTier.id })
          .where(eq(userRanks.id, rank.id));
        updatedCount++;
      }
    }

    console.log(`Successfully updated ${updatedCount} rank records.`);
    console.log('--- Recalculating All Player Tiers Completed! ---');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Recalculation Failed:', message);
  } finally {
    await sql.end();
  }
}

run();
