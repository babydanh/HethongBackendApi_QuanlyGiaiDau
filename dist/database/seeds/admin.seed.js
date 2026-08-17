"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_js_1 = require("drizzle-orm/postgres-js");
const dotenv = __importStar(require("dotenv"));
const users_schema_1 = require("../schema/users.schema");
const bcrypt = __importStar(require("bcrypt"));
const drizzle_orm_1 = require("drizzle-orm");
const postgres_client_1 = require("../postgres-client");
dotenv.config();
async function run() {
    const sql = (0, postgres_client_1.createPostgresClientFromEnv)();
    const db = (0, postgres_js_1.drizzle)(sql);
    try {
        console.log('--- Admin Seeding Started ---');
        let adminRole = await db.select().from(users_schema_1.roles).where((0, drizzle_orm_1.eq)(users_schema_1.roles.name, 'ADMIN')).limit(1).then(rows => rows[0]);
        if (!adminRole) {
            console.log('ADMIN role not found. Creating ADMIN role...');
            const [newRole] = await db.insert(users_schema_1.roles).values({
                name: 'ADMIN',
                slug: 'admin',
                description: 'Administrator'
            }).returning();
            adminRole = newRole;
        }
        console.log(`ADMIN role ID: ${adminRole.id}`);
        const password = '123456';
        const hashedPassword = bcrypt.hashSync(password, 12);
        let adminUser = await db.select().from(users_schema_1.users).where((0, drizzle_orm_1.eq)(users_schema_1.users.email, 'admin@gmail.com')).limit(1).then(rows => rows[0]);
        if (adminUser) {
            console.log('admin@gmail.com user already exists. Overwriting password...');
            const [updatedUser] = await db.update(users_schema_1.users).set({
                passwordHash: hashedPassword,
                isEmailVerified: true,
                deletedAt: null,
                updatedAt: new Date()
            }).where((0, drizzle_orm_1.eq)(users_schema_1.users.id, adminUser.id)).returning();
            adminUser = updatedUser;
        }
        else {
            console.log('Creating admin@gmail.com user...');
            const [newUser] = await db.insert(users_schema_1.users).values({
                email: 'admin@gmail.com',
                passwordHash: hashedPassword,
                isEmailVerified: true
            }).returning();
            adminUser = newUser;
        }
        console.log(`Admin User ID: ${adminUser.id}`);
        const existingUserRole = await db.select()
            .from(users_schema_1.userToRoles)
            .where((0, drizzle_orm_1.eq)(users_schema_1.userToRoles.userId, adminUser.id));
        const hasAdminRole = existingUserRole.some(ur => ur.roleId === adminRole.id);
        if (!hasAdminRole) {
            console.log('Assigning ADMIN role to user...');
            await db.insert(users_schema_1.userToRoles).values({
                userId: adminUser.id,
                roleId: adminRole.id
            });
        }
        else {
            console.log('User already has ADMIN role.');
        }
        const adminProfile = await db.select().from(users_schema_1.profiles).where((0, drizzle_orm_1.eq)(users_schema_1.profiles.userId, adminUser.id)).limit(1).then(rows => rows[0]);
        if (!adminProfile) {
            console.log('Creating profile for admin...');
            await db.insert(users_schema_1.profiles).values({
                userId: adminUser.id,
                fullName: 'Platform Admin',
                bio: 'System Administrator'
            });
        }
        else {
            console.log('Admin profile already exists.');
        }
        let organizerRole = await db.select().from(users_schema_1.roles).where((0, drizzle_orm_1.eq)(users_schema_1.roles.name, 'ORGANIZER')).limit(1).then(rows => rows[0]);
        if (!organizerRole) {
            const [newRole] = await db.insert(users_schema_1.roles).values({
                name: 'ORGANIZER',
                slug: 'organizer',
                description: 'Organizer'
            }).returning();
            organizerRole = newRole;
        }
        const organizerPasswordHash = bcrypt.hashSync('password123', 12);
        let organizerUser = await db.select().from(users_schema_1.users).where((0, drizzle_orm_1.eq)(users_schema_1.users.email, 'organizer@vndcsport.com')).limit(1).then(rows => rows[0]);
        if (!organizerUser) {
            console.log('Creating organizer@vndcsport.com user...');
            [organizerUser] = await db.insert(users_schema_1.users).values({
                email: 'organizer@vndcsport.com',
                passwordHash: organizerPasswordHash,
                isEmailVerified: true
            }).returning();
        }
        else {
            await db.update(users_schema_1.users).set({ passwordHash: organizerPasswordHash, deletedAt: null }).where((0, drizzle_orm_1.eq)(users_schema_1.users.id, organizerUser.id));
        }
        await db.insert(users_schema_1.userToRoles).values({
            userId: organizerUser.id,
            roleId: organizerRole.id
        }).onConflictDoNothing();
        const organizerProfile = await db.select().from(users_schema_1.profiles).where((0, drizzle_orm_1.eq)(users_schema_1.profiles.userId, organizerUser.id)).limit(1).then(rows => rows[0]);
        if (!organizerProfile) {
            await db.insert(users_schema_1.profiles).values({
                userId: organizerUser.id,
                fullName: 'BTC Sporto',
            });
        }
        console.log('--- Admin and Organizer Seeding Completed Successfully! ---');
    }
    finally {
        await sql.end();
    }
}
run().catch(console.error);
//# sourceMappingURL=admin.seed.js.map