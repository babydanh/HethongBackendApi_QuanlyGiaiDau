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
require("dotenv/config");
const postgres_js_1 = require("drizzle-orm/postgres-js");
const drizzle_orm_1 = require("drizzle-orm");
const schema = __importStar(require("../schema"));
const postgres_client_1 = require("../postgres-client");
const sqlClient = (0, postgres_client_1.createPostgresClientFromEnv)({ ssl: undefined });
const db = (0, postgres_js_1.drizzle)(sqlClient, { schema });
async function main() {
    const rows = await db.select().from(schema.tournaments);
    let repaired = 0;
    for (const tournament of rows) {
        const config = tournament.tournamentConfig || {};
        if (config.hideFeaturedCardText !== true)
            continue;
        await db
            .update(schema.tournaments)
            .set({ tournamentConfig: { ...config, hideFeaturedCardText: false } })
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournament.id));
        repaired += 1;
    }
    console.log(`Reset hideFeaturedCardText=false for ${repaired} tournaments.`);
    await sqlClient.end();
}
main().catch(async (error) => {
    console.error('Failed to repair hide banner seed:', error);
    await sqlClient.end();
    process.exit(1);
});
//# sourceMappingURL=repair-hide-banner-seed.js.map