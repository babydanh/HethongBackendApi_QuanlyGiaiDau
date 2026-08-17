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
async function run() {
    const sql = (0, postgres_client_1.createPostgresClientFromEnv)();
    const db = (0, postgres_js_1.drizzle)(sql);
    console.log('--- Recalculating All Player Tiers Started ---');
    try {
        const allTiers = await db.select().from(categories_schema_1.eloTiers);
        console.log(`Fetched ${allTiers.length} tier definitions.`);
        const allRanks = await db.select().from(categories_schema_1.userRanks);
        console.log(`Fetched ${allRanks.length} player rank records.`);
        const tiersByCategory = new Map();
        for (const tier of allTiers) {
            if (!tiersByCategory.has(tier.categoryId)) {
                tiersByCategory.set(tier.categoryId, []);
            }
            tiersByCategory.get(tier.categoryId).push(tier);
        }
        let updatedCount = 0;
        for (const rank of allRanks) {
            const categoryId = rank.categoryId;
            const matchType = rank.matchType || 'SINGLES';
            const elo = rank.eloPoints;
            const categoryTiers = tiersByCategory.get(categoryId) || [];
            if (categoryTiers.length === 0)
                continue;
            let targetTier;
            const sortedTiers = [...categoryTiers].sort((a, b) => b.minElo - a.minElo);
            for (const tier of sortedTiers) {
                if (tier.minElo !== null && elo >= tier.minElo) {
                    targetTier = tier;
                    break;
                }
            }
            if (!targetTier && sortedTiers.length > 0) {
                targetTier = sortedTiers[sortedTiers.length - 1];
            }
            if (targetTier) {
                await db
                    .update(categories_schema_1.userRanks)
                    .set({ tierId: targetTier.id })
                    .where((0, drizzle_orm_1.eq)(categories_schema_1.userRanks.id, rank.id));
                updatedCount++;
            }
        }
        console.log(`Successfully updated ${updatedCount} rank records.`);
        console.log('--- Recalculating All Player Tiers Completed! ---');
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('❌ Recalculation Failed:', message);
    }
    finally {
        await sql.end();
    }
}
run();
//# sourceMappingURL=recalculate-all-tiers.js.map