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
const schema = __importStar(require("../schema"));
const drizzle_orm_1 = require("drizzle-orm");
const postgres_client_1 = require("../postgres-client");
const pg = (0, postgres_client_1.createPostgresClientFromEnv)({ ssl: undefined });
const db = (0, postgres_js_1.drizzle)(pg, { schema });
async function main() {
    const tourId = '7cacbc00-4fa1-48ae-9bb9-aa8c3699491d';
    const matches = await db.select({
        id: schema.matches.id,
        matchOrder: schema.matches.matchOrder,
        roundNumber: schema.matches.roundNumber,
        bracketBranch: schema.matches.bracketBranch,
        isBye: schema.matches.isBye,
        status: schema.matches.status,
        p1Id: schema.matches.participant1Id,
        p2Id: schema.matches.participant2Id,
        winnerId: schema.matches.winnerId,
        nextMatchId: schema.matches.nextMatchId,
        loserNextMatchId: schema.matches.loserNextMatchId,
    })
        .from(schema.matches)
        .where((0, drizzle_orm_1.eq)(schema.matches.tournamentId, tourId))
        .orderBy(schema.matches.bracketBranch, schema.matches.roundNumber, schema.matches.matchOrder);
    const teamMap = new Map();
    const participants = await db.select().from(schema.tournamentParticipants).where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tourId));
    for (const p of participants) {
        teamMap.set(p.id, p.teamName);
    }
    console.log(`=== Matches for DE-13 (${tourId}) ===`);
    for (const m of matches) {
        const p1Name = m.p1Id ? teamMap.get(m.p1Id) || m.p1Id : 'TBD';
        const p2Name = m.p2Id ? teamMap.get(m.p2Id) || m.p2Id : (m.isBye ? 'BYE' : 'TBD');
        console.log(`[${m.bracketBranch} R${m.roundNumber} M${m.matchOrder}] status=${m.status} | p1=${p1Name} vs p2=${p2Name} | winner=${m.winnerId ? teamMap.get(m.winnerId) : 'None'} | next=${m.nextMatchId} | loserNext=${m.loserNextMatchId}`);
    }
    await pg.end();
}
main().catch(console.error);
//# sourceMappingURL=check-de-matches.js.map