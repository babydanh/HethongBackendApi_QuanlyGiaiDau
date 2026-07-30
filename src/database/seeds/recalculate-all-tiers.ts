import { drizzle } from 'drizzle-orm/postgres-js';
import * as dotenv from 'dotenv';
import { userRanks, eloTiers } from '../schema/categories.schema';
import { eq } from 'drizzle-orm';
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

      let targetTier: typeof allTiers[0] | undefined;

      // Sort tiers by minElo descending
      const sortedTiers = [...categoryTiers].sort((a, b) => b.minElo - a.minElo);
      for (const tier of sortedTiers) {
        if (tier.minElo !== null && elo >= tier.minElo) {
          targetTier = tier;
          break;
        }
      }

      // If top player and no tier matched (ELO < lowest minElo), use lowest tier
      if (!targetTier && sortedTiers.length > 0) {
        targetTier = sortedTiers[sortedTiers.length - 1];
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
