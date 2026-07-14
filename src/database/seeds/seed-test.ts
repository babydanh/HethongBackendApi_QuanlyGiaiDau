import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import * as bcrypt from 'bcrypt';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { createPostgresClientFromEnv } from '../postgres-client';
import * as crypto from 'crypto';
const uuidv4 = () => crypto.randomUUID();

const sqlClient = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(sqlClient, { schema });

async function createTournament(params: {
  name: string; bracketType: string; numTeams: number; venueId: string;
  categoryId: string; organizerId: string; status?: string;
}) {
  const { name, bracketType, numTeams, venueId, categoryId, organizerId, status = 'IN_PROGRESS' } = params;
  const maxSlots = numTeams === 0 ? 16
    : bracketType === 'round_robin' ? numTeams
      : bracketType === 'double_elimination'
        ? Math.pow(2, Math.ceil(Math.log2(numTeams)))
        : Math.pow(2, Math.ceil(Math.log2(numTeams)));

  const tourId = uuidv4();
  const shortTs = Date.now().toString().slice(-6);
  const inviteCode = `T${bracketType.substring(0,2).toUpperCase()}${numTeams}-${shortTs}`;

  await db.insert(schema.tournaments).values({
    id: tourId,
    name: name,
    categoryId: categoryId,
    createdBy: organizerId,
    status: status as any,
    matchType: 'SINGLES',
    sportRules: { kind: 'BADMINTON', setsToWin: 2, pointsPerSet: 21, winByTwo: true },
    tournamentConfig: {
      bracketType: bracketType,
      maxTeams: maxSlots,
      roundRobinLegs: bracketType === 'round_robin' ? 2 : undefined,
    },
    venueId: venueId,
    entryFee: '0',
    tournamentType: 'PUBLIC',
    visibility: 'PUBLIC',
    maxParticipants: maxSlots,
    registrationStartDate: new Date(),
    registrationEndDate: new Date(Date.now() + 30 * 86400000),
    startDate: new Date(Date.now() + 30 * 86400000),
    endDate: new Date(Date.now() + 60 * 86400000),
    inviteCode: inviteCode,
    isRanked: true,
  }).onConflictDoNothing();

  const divisionId = uuidv4();
  await db.insert(schema.tournamentDivisions).values({
    id: divisionId,
    tournamentId: tourId,
    name: name,
    matchType: 'SINGLES',
    bracketType: bracketType,
    status: 'ACTIVE',
    entryFee: '0',
  }).onConflictDoNothing();

  // Add participants
  for (let i = 1; i <= numTeams; i++) {
    await db.insert(schema.tournamentParticipants).values({
      id: uuidv4(),
      tournamentId: tourId,
      tournamentDivisionId: divisionId,
      registeredBy: organizerId,
      teamName: `Đội ${i}`,
      teamStatus: 'COMPLETE',
      isMock: true,
      isPaid: true,
    });
  }

  const byes = maxSlots - numTeams;
  console.log(`  ${name}: ${numTeams} teams, ${maxSlots} slots, ${byes} BYEs`);
  return tourId;
}

async function main() {
  console.log('=== SEED TEST DATA START ===\n');

  // 0. Clean old bracket test tournaments (those with inviteCode starting with 'T')
  console.log('0. Cleaning old test tournaments...');
  const oldTours = await db.select().from(schema.tournaments).where(sql`invite_code LIKE 'T%'`);
  const oldTourIds = oldTours.map(t => t.id);
  if (oldTourIds.length > 0) {
    // Delete matches of those tournaments
    const stages = await db.select().from(schema.tournamentStages).where(inArray(schema.tournamentStages.tournamentId, oldTourIds));
    const stageIds = stages.map(s => s.id);
    if (stageIds.length > 0) {
      const groups = await db.select().from(schema.tournamentGroups).where(inArray(schema.tournamentGroups.stageId, stageIds));
      const groupIds = groups.map(g => g.id);
      if (groupIds.length > 0) {
        await db.delete(schema.groupStandings).where(inArray(schema.groupStandings.groupId, groupIds));
        await db.delete(schema.matches).where(inArray(schema.matches.groupId, groupIds));
        await db.delete(schema.tournamentGroups).where(inArray(schema.tournamentGroups.stageId, stageIds));
      }
      await db.delete(schema.tournamentStages).where(inArray(schema.tournamentStages.tournamentId, oldTourIds));
    }
    await db.delete(schema.tournamentParticipants).where(inArray(schema.tournamentParticipants.tournamentId, oldTourIds));
    await db.delete(schema.tournamentDivisions).where(inArray(schema.tournamentDivisions.tournamentId, oldTourIds));
    await db.delete(schema.tournaments).where(inArray(schema.tournaments.id, oldTourIds));
  }
  console.log('  Cleaned old tournaments successfully.');

  // 1. Roles
  console.log('1. Roles...');
  const roleNames = ['ADMIN', 'ORGANIZER', 'PLAYER', 'REFEREE'];
  const roleMap = new Map<string, string>();
  for (const name of roleNames) {
    const slug = name.toLowerCase();
    let [role] = await db.insert(schema.roles).values({ name, slug, description: name }).onConflictDoNothing().returning();
    if (!role) role = await db.select().from(schema.roles).where(eq(schema.roles.slug, slug)).limit(1).then(r => r[0]);
    if (role) roleMap.set(name, role.id);
  }
  console.log('  OK');

  // 2. Categories
  console.log('\n2. Categories...');
  let badmintonCat = await db.select().from(schema.categories).where(eq(schema.categories.slug, 'badminton')).limit(1).then(r => r[0]);
  if (!badmintonCat) {
    console.log('  Run "npm run seed:categories" first!');
    return;
  }
  console.log(`  Badminton: ${badmintonCat.id}`);

  // 3. Test users
  console.log('\n3. Test Users...');
  const usersData = [
    { email: 'organizer@vndcsport.com', password: 'password123', fullName: 'Default Organizer', roles: ['ADMIN', 'ORGANIZER'] },
    { email: 'admin@gmail.com', password: '123456', fullName: 'Platform Admin', roles: ['ADMIN'] },
    { email: 'player@test.com', password: 'TestPass123!', fullName: 'Test Player', roles: ['PLAYER'] },
  ];

  let organizerId = '';
  for (const u of usersData) {
    const hp = bcrypt.hashSync(u.password, 12);
    let user = await db.select().from(schema.users).where(eq(schema.users.email, u.email)).limit(1).then(r => r[0]);
    if (user) {
      await db.update(schema.users).set({ passwordHash: hp, isEmailVerified: true, deletedAt: null }).where(eq(schema.users.id, user.id));
    } else {
      [user] = await db.insert(schema.users).values({ email: u.email, passwordHash: hp, isEmailVerified: true }).returning();
    }
    const p = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, user.id)).limit(1).then(r => r[0]);
    if (!p) await db.insert(schema.profiles).values({ userId: user.id, fullName: u.fullName });
    for (const rn of u.roles) {
      const rid = roleMap.get(rn);
      if (rid) {
        const ur = await db.select().from(schema.userToRoles)
          .where(and(eq(schema.userToRoles.userId, user.id), eq(schema.userToRoles.roleId, rid))).limit(1).then(r => r[0]);
        if (!ur) await db.insert(schema.userToRoles).values({ userId: user.id, roleId: rid });
      }
    }
    if (u.email === 'organizer@vndcsport.com') organizerId = user.id;
    console.log(`  ${u.email} / ${u.password}`);
  }

  // 4. Venue
  console.log('\n4. Venue...');
  const venueId = uuidv4();
  await db.insert(schema.tournamentVenues).values({
    id: venueId, name: 'Nhà thi đấu test Hà Nội', locationAddress: 'Hà Nội',
  }).onConflictDoNothing();
  console.log(`  Venue: ${venueId}`);

  // 5. Tournaments for bracket testing
  console.log('\n5. Creating 9 tournaments for bracket testing...\n');

  const configs = [
    // Single Elimination - odd numbers
    { name: 'SE-10: Single Elim 10 đội', bracketType: 'single_elimination', numTeams: 10 },
    { name: 'SE-11: Single Elim 11 đội', bracketType: 'single_elimination', numTeams: 11 },
    { name: 'SE-13: Single Elim 13 đội', bracketType: 'single_elimination', numTeams: 13 },
    // Double Elimination - odd numbers
    { name: 'DE-10: Double Elim 10 đội', bracketType: 'double_elimination', numTeams: 10 },
    { name: 'DE-11: Double Elim 11 đội', bracketType: 'double_elimination', numTeams: 11 },
    { name: 'DE-13: Double Elim 13 đội', bracketType: 'double_elimination', numTeams: 13 },
    // Round Robin - odd numbers
    { name: 'RR-10: Round Robin 10 đội', bracketType: 'round_robin', numTeams: 10 },
    { name: 'RR-11: Round Robin 11 đội', bracketType: 'round_robin', numTeams: 11 },
    { name: 'RR-13: Round Robin 13 đội', bracketType: 'round_robin', numTeams: 13 },
    // Registration test
    { name: 'REG-TEST: Đăng ký thử nghiệm', bracketType: 'single_elimination', numTeams: 0, status: 'REGISTRATION_OPEN' },
  ];

  const tourIds: string[] = [];
  for (const cfg of configs) {
    const id = await createTournament({
      name: cfg.name, bracketType: cfg.bracketType, numTeams: cfg.numTeams,
      venueId, categoryId: badmintonCat.id, organizerId, status: cfg.status,
    });
    tourIds.push(id);
  }

  console.log('\n=== SEED COMPLETE ===');
  console.log('\n=== Test Accounts ===');
  console.log('  organizer@vndcsport.com / password123');
  console.log('  admin@gmail.com / 123456');
  console.log('  player@test.com / TestPass123!');
  console.log(`\nVenue: ${venueId}`);
  console.log('\n=== Tournaments Created ===');
  for (let i = 0; i < configs.length; i++) {
    console.log(`  ${configs[i].name}: ${tourIds[i]}`);
  }

  await sqlClient.end();
}

main().catch(async (err) => {
  console.error('Error:', err);
  await sqlClient.end();
  process.exit(1);
});
