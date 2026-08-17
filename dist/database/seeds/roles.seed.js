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
const postgres_client_1 = require("../postgres-client");
const path = __importStar(require("path"));
dotenv.config({ path: path.join(process.cwd(), '.env') });
async function run() {
    console.log('DB Connection Debug:', {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_DATABASE
    });
    const sql = (0, postgres_client_1.createPostgresClientFromEnv)();
    const db = (0, postgres_js_1.drizzle)(sql);
    try {
        console.log('Seeding roles...');
        await db
            .insert(users_schema_1.roles)
            .values([
            { name: 'ADMIN', slug: 'admin', description: 'Administrator' },
            {
                name: 'MODERATOR',
                slug: 'moderator',
                description: 'System Moderator',
            },
            {
                name: 'ORGANIZER',
                slug: 'organizer',
                description: 'Tournament Organizer',
            },
            {
                name: 'REFEREE',
                slug: 'referee',
                description: 'Match Referee',
            },
            { name: 'PLAYER', slug: 'player', description: 'Player' },
        ])
            .onConflictDoNothing();
        console.log('Roles seeded!');
    }
    finally {
        await sql.end();
    }
}
run().catch(console.error);
//# sourceMappingURL=roles.seed.js.map