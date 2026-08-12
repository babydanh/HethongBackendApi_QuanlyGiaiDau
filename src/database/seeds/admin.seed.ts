import { drizzle } from 'drizzle-orm/postgres-js';
import * as dotenv from 'dotenv';
import { roles, users, userToRoles, profiles } from '../schema/users.schema';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { createPostgresClientFromEnv } from '../postgres-client';

dotenv.config();

async function run() {
  const sql = createPostgresClientFromEnv();
  const db = drizzle(sql);

  try {
    console.log('--- Admin Seeding Started ---');

    // 1. Ensure ADMIN role exists
    let adminRole = await db.select().from(roles).where(eq(roles.name, 'ADMIN')).limit(1).then(rows => rows[0]);
    if (!adminRole) {
      console.log('ADMIN role not found. Creating ADMIN role...');
      const [newRole] = await db.insert(roles).values({
        name: 'ADMIN',
        slug: 'admin',
        description: 'Administrator'
      }).returning();
      adminRole = newRole;
    }
    console.log(`ADMIN role ID: ${adminRole.id}`);

    // 2. Hash password
    const password = '123456';
    const hashedPassword = bcrypt.hashSync(password, 12);

    // 3. Find or Create admin@gmail.com
    let adminUser = await db.select().from(users).where(eq(users.email, 'admin@gmail.com')).limit(1).then(rows => rows[0]);
    
    if (adminUser) {
      console.log('admin@gmail.com user already exists. Overwriting password...');
      const [updatedUser] = await db.update(users).set({
        passwordHash: hashedPassword,
        isEmailVerified: true,
        deletedAt: null,
        updatedAt: new Date()
      }).where(eq(users.id, adminUser.id)).returning();
      adminUser = updatedUser;
    } else {
      console.log('Creating admin@gmail.com user...');
      const [newUser] = await db.insert(users).values({
        email: 'admin@gmail.com',
        passwordHash: hashedPassword,
        isEmailVerified: true
      }).returning();
      adminUser = newUser;
    }
    console.log(`Admin User ID: ${adminUser.id}`);

    // 4. Assign ADMIN role if not already assigned
    const existingUserRole = await db.select()
      .from(userToRoles)
      .where(
        eq(userToRoles.userId, adminUser.id)
      );
    
    const hasAdminRole = existingUserRole.some(ur => ur.roleId === adminRole.id);
    if (!hasAdminRole) {
      console.log('Assigning ADMIN role to user...');
      await db.insert(userToRoles).values({
        userId: adminUser.id,
        roleId: adminRole.id
      });
    } else {
      console.log('User already has ADMIN role.');
    }

    // 5. Ensure user profile exists
    const adminProfile = await db.select().from(profiles).where(eq(profiles.userId, adminUser.id)).limit(1).then(rows => rows[0]);
    if (!adminProfile) {
      console.log('Creating profile for admin...');
      await db.insert(profiles).values({
        userId: adminUser.id,
        fullName: 'Platform Admin',
        bio: 'System Administrator'
      });
    } else {
      console.log('Admin profile already exists.');
    }

    // 6. Ensure organizer@vndcsport.com exists
    let organizerRole = await db.select().from(roles).where(eq(roles.name, 'ORGANIZER')).limit(1).then(rows => rows[0]);
    if (!organizerRole) {
      const [newRole] = await db.insert(roles).values({
        name: 'ORGANIZER',
        slug: 'organizer',
        description: 'Organizer'
      }).returning();
      organizerRole = newRole;
    }
    
    const organizerPasswordHash = bcrypt.hashSync('password123', 12);
    let organizerUser = await db.select().from(users).where(eq(users.email, 'organizer@vndcsport.com')).limit(1).then(rows => rows[0]);
    if (!organizerUser) {
      console.log('Creating organizer@vndcsport.com user...');
      [organizerUser] = await db.insert(users).values({
        email: 'organizer@vndcsport.com',
        passwordHash: organizerPasswordHash,
        isEmailVerified: true
      }).returning();
    } else {
      await db.update(users).set({ passwordHash: organizerPasswordHash, deletedAt: null }).where(eq(users.id, organizerUser.id));
    }

    await db.insert(userToRoles).values({
      userId: organizerUser.id,
      roleId: organizerRole.id
    }).onConflictDoNothing();

    const organizerProfile = await db.select().from(profiles).where(eq(profiles.userId, organizerUser.id)).limit(1).then(rows => rows[0]);
    if (!organizerProfile) {
      await db.insert(profiles).values({
        userId: organizerUser.id,
        fullName: 'BTC Sporto',
      });
    }

    console.log('--- Admin and Organizer Seeding Completed Successfully! ---');
  } finally {
    await sql.end();
  }
}

run().catch(console.error);
