import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import { createPostgresClientFromEnv } from '../postgres-client';

const sql = createPostgresClientFromEnv({
  ssl: undefined,
});
const db = drizzle(sql, { schema });

async function main() {
  console.log('Seeding categories and elo_tiers...');

  // 1. Seed Pickleball
  console.log('Seeding Pickleball...');
  const [pickleball] = await db
    .insert(schema.categories)
    .values({
      name: 'Pickleball',
      slug: 'pickleball',
      description: 'Môn thể thao dùng vợt, bóng nhựa đục lỗ',
      categoryConfig: {
        ruleKind: 'PICKLEBALL_RALLY',
        allowedRuleKinds: ['PICKLEBALL_RALLY', 'PICKLEBALL_SIDE_OUT'],
        defaultSportRules: {
          setsToWin: 2,
          pointsPerSet: 11,
          mustWinByTwo: true,
          maxPointsPerSet: 15,
          serveSwitchEvery: 1,
          switchSidesBetweenSets: true,
          switchSidesAtTiebreakPoints: 6,
        },
        supportedMatchTypes: ['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'],
        description: 'Môn thể thao dùng vợt, bóng nhựa đục lỗ',
      },
    })
    .onConflictDoUpdate({
      target: schema.categories.slug,
      set: {
        categoryConfig: {
          ruleKind: 'PICKLEBALL_RALLY',
          allowedRuleKinds: ['PICKLEBALL_RALLY', 'PICKLEBALL_SIDE_OUT'],
          defaultSportRules: {
            setsToWin: 2,
            pointsPerSet: 11,
            mustWinByTwo: true,
            maxPointsPerSet: 15,
            serveSwitchEvery: 1,
            switchSidesBetweenSets: true,
            switchSidesAtTiebreakPoints: 6,
          },
          supportedMatchTypes: ['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'],
          description: 'Môn thể thao dùng vợt, bóng nhựa đục lỗ',
        },
        description: 'Môn thể thao dùng vợt, bóng nhựa đục lỗ',
      },
    })
    .returning();

  if (pickleball) {
    await db
      .insert(schema.eloTiers)
      .values([
        { categoryId: pickleball.id, name: 'Beginner', minElo: 0, maxElo: 1500 },
        {
          categoryId: pickleball.id,
          name: 'Intermediate',
          minElo: 1500,
          maxElo: 2000,
        },
        {
          categoryId: pickleball.id,
          name: 'Advanced',
          minElo: 2000,
          maxElo: 2500,
        },
        { categoryId: pickleball.id, name: 'Pro', minElo: 2500, maxElo: 4000 },
      ])
      .onConflictDoNothing();
  }

  // 2. Seed Tennis
  console.log('Seeding Tennis...');
  const [tennis] = await db
    .insert(schema.categories)
    .values({
      name: 'Tennis',
      slug: 'tennis',
      description: 'Môn thể thao quần vợt',
      categoryConfig: {
        ruleKind: 'TENNIS',
        allowedRuleKinds: ['TENNIS'],
        defaultSportRules: {
          setsToWin: 2,
          pointsPerSet: 6,
          mustWinByTwo: true,
          maxPointsPerSet: 7,
          tiebreakPoints: 7,
          switchSidesBetweenSets: true,
        },
        supportedMatchTypes: ['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'],
        description: 'Môn thể thao quần vợt',
      },
    })
    .onConflictDoUpdate({
      target: schema.categories.slug,
      set: {
        categoryConfig: {
          ruleKind: 'TENNIS',
          allowedRuleKinds: ['TENNIS'],
          defaultSportRules: {
            setsToWin: 2,
            pointsPerSet: 6,
            mustWinByTwo: true,
            maxPointsPerSet: 7,
            tiebreakPoints: 7,
            switchSidesBetweenSets: true,
          },
          supportedMatchTypes: ['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'],
          description: 'Môn thể thao quần vợt',
        },
        description: 'Môn thể thao quần vợt',
      },
    })
    .returning();

  if (tennis) {
    await db
      .insert(schema.eloTiers)
      .values([
        {
          categoryId: tennis.id,
          name: 'NTRP 2.0-3.0 (Beginner)',
          minElo: 0,
          maxElo: 1500,
        },
        {
          categoryId: tennis.id,
          name: 'NTRP 3.5-4.0 (Intermediate)',
          minElo: 1500,
          maxElo: 2000,
        },
        {
          categoryId: tennis.id,
          name: 'NTRP 4.5+ (Advanced)',
          minElo: 2000,
          maxElo: 2500,
        },
      ])
      .onConflictDoNothing();
  }

  // 3. Seed Badminton
  console.log('Seeding Badminton...');
  const [badminton] = await db
    .insert(schema.categories)
    .values({
      name: 'Cầu lông',
      slug: 'badminton',
      description: 'Môn thể thao dùng vợt và quả cầu lông',
      categoryConfig: {
        ruleKind: 'BADMINTON',
        allowedRuleKinds: ['BADMINTON'],
        defaultSportRules: {
          setsToWin: 2,
          pointsPerSet: 21,
          mustWinByTwo: true,
          maxPointsPerSet: 30,
          switchSidesBetweenSets: true,
          switchSidesAtTiebreakPoints: 11,
        },
        supportedMatchTypes: ['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'],
        description: 'Môn thể thao dùng vợt và quả cầu lông',
      },
    })
    .onConflictDoUpdate({
      target: schema.categories.slug,
      set: {
        categoryConfig: {
          ruleKind: 'BADMINTON',
          allowedRuleKinds: ['BADMINTON'],
          defaultSportRules: {
            setsToWin: 2,
            pointsPerSet: 21,
            mustWinByTwo: true,
            maxPointsPerSet: 30,
            switchSidesBetweenSets: true,
            switchSidesAtTiebreakPoints: 11,
          },
          supportedMatchTypes: ['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'],
          description: 'Môn thể thao dùng vợt và quả cầu lông',
        },
        description: 'Môn thể thao dùng vợt và quả cầu lông',
      },
    })
    .returning();

  if (badminton) {
    await db
      .insert(schema.eloTiers)
      .values([
        { categoryId: badminton.id, name: 'Phong trào', minElo: 0, maxElo: 1500 },
        {
          categoryId: badminton.id,
          name: 'Bán chuyên',
          minElo: 1500,
          maxElo: 2000,
        },
        {
          categoryId: badminton.id,
          name: 'Chuyên nghiệp',
          minElo: 2000,
          maxElo: 3000,
        },
      ])
      .onConflictDoNothing();
  }

  // 4. Seed Table Tennis
  console.log('Seeding Table Tennis...');
  const [tableTennis] = await db
    .insert(schema.categories)
    .values({
      name: 'Bóng bàn',
      slug: 'table_tennis',
      description: 'Môn thể thao dùng vợt gỗ và quả bóng bàn nhỏ',
      categoryConfig: {
        ruleKind: 'TABLE_TENNIS',
        allowedRuleKinds: ['TABLE_TENNIS'],
        defaultSportRules: {
          setsToWin: 3,
          pointsPerSet: 11,
          mustWinByTwo: true,
          maxPointsPerSet: 99,
          serveSwitchEvery: 2,
          switchSidesBetweenSets: true,
          switchSidesAtTiebreakPoints: 5,
        },
        supportedMatchTypes: ['SINGLES', 'DOUBLES'],
        description: 'Môn thể thao dùng vợt gỗ và quả bóng bàn nhỏ',
      },
    })
    .onConflictDoUpdate({
      target: schema.categories.slug,
      set: {
        categoryConfig: {
          ruleKind: 'TABLE_TENNIS',
          allowedRuleKinds: ['TABLE_TENNIS'],
          defaultSportRules: {
            setsToWin: 3,
            pointsPerSet: 11,
            mustWinByTwo: true,
            maxPointsPerSet: 99,
            serveSwitchEvery: 2,
            switchSidesBetweenSets: true,
            switchSidesAtTiebreakPoints: 5,
          },
          supportedMatchTypes: ['SINGLES', 'DOUBLES'],
          description: 'Môn thể thao dùng vợt gỗ và quả bóng bàn nhỏ',
        },
        description: 'Môn thể thao dùng vợt gỗ và quả bóng bàn nhỏ',
      },
    })
    .returning();

  if (tableTennis) {
    await db
      .insert(schema.eloTiers)
      .values([
        { categoryId: tableTennis.id, name: 'Phong trào', minElo: 0, maxElo: 1500 },
        {
          categoryId: tableTennis.id,
          name: 'Bán chuyên',
          minElo: 1500,
          maxElo: 2000,
        },
        {
          categoryId: tableTennis.id,
          name: 'Chuyên nghiệp',
          minElo: 2000,
          maxElo: 3000,
        },
      ])
      .onConflictDoNothing();
  }

  console.log('Seeding complete!');
  await sql.end();
}

main().catch(async (err) => {
  console.error('Error seeding data:', err);
  await sql.end();
  process.exit(1);
});
