import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { categories, eloTiers } from '../schema/categories.schema';
import { eq, and } from 'drizzle-orm';

dotenv.config();

const tierDefinitions = [
  { name: 'Tier D (Low)', minElo: 1000, maxElo: 1099 },
  { name: 'Tier D (High)', minElo: 1100, maxElo: 1199 },
  { name: 'Tier C (Low)', minElo: 1200, maxElo: 1299 },
  { name: 'Tier C (High)', minElo: 1300, maxElo: 1399 },
  { name: 'Tier B (Low)', minElo: 1400, maxElo: 1499 },
  { name: 'Tier B (High)', minElo: 1500, maxElo: 1599 },
  { name: 'Tier A (Low)', minElo: 1600, maxElo: 1699 },
  { name: 'Tier A (High)', minElo: 1700, maxElo: 1799 },
  { name: 'Tier S', minElo: 1800, maxElo: 99999 },
];

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });
  const db = drizzle(pool);

  console.log('--- ELO Tiers Seeding Started ---');

  try {
    // 1. Get all categories
    const allCategories = await db.select().from(categories);
    console.log(`Found ${allCategories.length} categories to seed tiers for.`);

    for (const category of allCategories) {
      console.log(`Seeding tiers for category: ${category.name} (${category.id})`);

      for (const tierDef of tierDefinitions) {
        // Check if tier already exists for this category
        const existing = await db
          .select()
          .from(eloTiers)
          .where(
            and(
              eq(eloTiers.categoryId, category.id),
              eq(eloTiers.name, tierDef.name)
            )
          )
          .limit(1)
          .then((rows) => rows[0]);

        if (existing) {
          // Update ELO range just in case
          await db
            .update(eloTiers)
            .set({
              minElo: tierDef.minElo,
              maxElo: tierDef.maxElo,
            })
            .where(eq(eloTiers.id, existing.id));
          console.log(`  Updated existing tier: ${tierDef.name}`);
        } else {
          // Create new tier
          await db.insert(eloTiers).values({
            categoryId: category.id,
            name: tierDef.name,
            minElo: tierDef.minElo,
            maxElo: tierDef.maxElo,
          });
          console.log(`  Created new tier: ${tierDef.name}`);
        }
      }
    }

    console.log('--- ELO Tiers Seeding Completed Successfully! ---');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ ELO Tiers Seeding Failed:', message);
  } finally {
    pool.end();
  }
}

run();
