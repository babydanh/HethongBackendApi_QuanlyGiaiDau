import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { categories, eloTiers } from '../schema/categories.schema';
import { eq, and } from 'drizzle-orm';

dotenv.config();

const tierDefinitions = [
  { name: 'Tier D (Low)', minElo: 0, maxElo: 1099 },
  { name: 'Tier D (High)', minElo: 1100, maxElo: 1299 },
  { name: 'Tier C (Low)', minElo: 1300, maxElo: 1499 },
  { name: 'Tier C (High)', minElo: 1500, maxElo: 1699 },
  { name: 'Tier B', minElo: 1700, maxElo: 1899 },
  { name: 'Tier A', minElo: 1900, maxElo: 2199 },
  { name: 'Tier S', minElo: 2200, maxElo: 99999 }, // Special Top 1 City Tier
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
  } catch (err: any) {
    console.error('❌ ELO Tiers Seeding Failed:', err.message);
  } finally {
    pool.end();
  }
}

run();
