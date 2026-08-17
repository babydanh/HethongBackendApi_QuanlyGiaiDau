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
const categories_schema_1 = require("../schema/categories.schema");
const drizzle_orm_1 = require("drizzle-orm");
const postgres_client_1 = require("../postgres-client");
dotenv.config();
const tierDefinitions = [
    { name: 'Low Tier D', minElo: 0, maxElo: 1099 },
    { name: 'High Tier D', minElo: 1100, maxElo: 1199 },
    { name: 'Low Tier C', minElo: 1200, maxElo: 1299 },
    { name: 'High Tier C', minElo: 1300, maxElo: 1399 },
    { name: 'Low Tier B', minElo: 1400, maxElo: 1499 },
    { name: 'High Tier B', minElo: 1500, maxElo: 1599 },
    { name: 'Low Tier A', minElo: 1600, maxElo: 1699 },
    { name: 'High Tier A', minElo: 1700, maxElo: 1799 },
    { name: 'Tier S', minElo: 1800, maxElo: 99999 },
];
async function run() {
    const sql = (0, postgres_client_1.createPostgresClientFromEnv)();
    const db = (0, postgres_js_1.drizzle)(sql);
    console.log('--- ELO Tiers Seeding Started ---');
    try {
        const allCategories = await db.select().from(categories_schema_1.categories);
        console.log(`Found ${allCategories.length} categories to seed tiers for.`);
        for (const category of allCategories) {
            console.log(`Seeding tiers for category: ${category.name} (${category.id})`);
            for (const tierDef of tierDefinitions) {
                const existing = await db
                    .select()
                    .from(categories_schema_1.eloTiers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(categories_schema_1.eloTiers.categoryId, category.id), (0, drizzle_orm_1.eq)(categories_schema_1.eloTiers.name, tierDef.name)))
                    .limit(1)
                    .then((rows) => rows[0]);
                if (existing) {
                    await db
                        .update(categories_schema_1.eloTiers)
                        .set({
                        minElo: tierDef.minElo,
                        maxElo: tierDef.maxElo,
                    })
                        .where((0, drizzle_orm_1.eq)(categories_schema_1.eloTiers.id, existing.id));
                    console.log(`  Updated existing tier: ${tierDef.name}`);
                }
                else {
                    await db.insert(categories_schema_1.eloTiers).values({
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
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('❌ ELO Tiers Seeding Failed:', message);
    }
    finally {
        await sql.end();
    }
}
run();
//# sourceMappingURL=elo-tiers.seed.js.map