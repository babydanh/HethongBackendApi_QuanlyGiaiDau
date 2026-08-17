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
const pg = (0, postgres_client_1.createPostgresClientFromEnv)({ ssl: undefined });
const db = (0, postgres_js_1.drizzle)(pg, { schema });
const BASE = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1';
const FORCE = process.env.FORCE_REPAIR === 'true';
function parseCsv(value) {
    return (value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}
async function api(path, options) {
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, body };
}
async function loginOrganizer() {
    const login = await api('/auth/mobile/login', {
        method: 'POST',
        body: JSON.stringify({
            email: process.env.REPAIR_EMAIL ?? 'organizer@vndcsport.com',
            password: process.env.REPAIR_PASSWORD ?? 'password123',
        }),
    });
    const loginBody = login.body;
    const token = loginBody?.data?.accessToken || loginBody?.accessToken || '';
    if (!token) {
        throw new Error(`Login failed: ${JSON.stringify(login.body).slice(0, 200)}`);
    }
    return token;
}
async function deleteBracketData(tournamentId, divisionId) {
    const stageConditions = [
        (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId),
        (0, drizzle_orm_1.isNull)(schema.tournamentStages.deletedAt),
    ];
    if (divisionId) {
        stageConditions.push((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentDivisionId, divisionId));
    }
    const stages = await db
        .select({ id: schema.tournamentStages.id })
        .from(schema.tournamentStages)
        .where((0, drizzle_orm_1.and)(...stageConditions));
    if (stages.length === 0)
        return;
    const stageIds = stages.map((stage) => stage.id);
    const groups = await db
        .select({ id: schema.tournamentGroups.id })
        .from(schema.tournamentGroups)
        .where((0, drizzle_orm_1.inArray)(schema.tournamentGroups.stageId, stageIds));
    const groupIds = groups.map((group) => group.id);
    if (groupIds.length > 0) {
        await db.delete(schema.groupStandings).where((0, drizzle_orm_1.inArray)(schema.groupStandings.groupId, groupIds));
        await db.delete(schema.matches).where((0, drizzle_orm_1.inArray)(schema.matches.groupId, groupIds));
        await db.delete(schema.tournamentGroups).where((0, drizzle_orm_1.inArray)(schema.tournamentGroups.stageId, stageIds));
    }
    await db.delete(schema.tournamentStages).where((0, drizzle_orm_1.inArray)(schema.tournamentStages.id, stageIds));
}
async function repairDivision(token, tournament, division) {
    const bracketType = (division.bracketType || '').toUpperCase();
    if (bracketType !== 'DOUBLE_ELIMINATION')
        return { skipped: true, reason: 'not double elimination' };
    if (!FORCE && (tournament.status === 'IN_PROGRESS' || tournament.status === 'COMPLETED')) {
        return { skipped: true, reason: `tournament status is ${tournament.status}` };
    }
    console.log(`- Repairing ${tournament.name} / ${division.name}`);
    const originalStatus = tournament.status;
    try {
        if (originalStatus !== 'DRAFT') {
            await db.update(schema.tournaments)
                .set({ status: 'DRAFT', updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournament.id));
        }
        await deleteBracketData(tournament.id, division.id);
        const gen = await api(`/tournaments/${tournament.id}/generate-bracket`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify({ divisionId: division.id }),
        });
        if (!gen.ok) {
            throw new Error(`generate-bracket failed for ${tournament.name} / ${division.name}: ${gen.status} ${JSON.stringify(gen.body).slice(0, 200)}`);
        }
        return { repaired: true };
    }
    finally {
        if (originalStatus !== 'DRAFT') {
            await db.update(schema.tournaments)
                .set({ status: originalStatus, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournament.id));
        }
    }
}
async function main() {
    const targetIds = parseCsv(process.env.TARGET_TOURNAMENT_IDS);
    const invitePrefix = process.env.INVITE_PREFIX ?? 'T';
    const tournaments = await db
        .select({
        id: schema.tournaments.id,
        name: schema.tournaments.name,
        status: schema.tournaments.status,
        inviteCode: schema.tournaments.inviteCode,
    })
        .from(schema.tournaments)
        .where((0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt));
    const targetTournaments = targetIds.length > 0
        ? tournaments.filter((t) => targetIds.includes(t.id))
        : tournaments.filter((t) => (t.inviteCode || '').startsWith(invitePrefix));
    if (targetTournaments.length === 0) {
        console.log('No tournaments matched the repair scope.');
        return;
    }
    const token = await loginOrganizer();
    console.log(`Repairing ${targetTournaments.length} tournament(s)...`);
    let repaired = 0;
    let skipped = 0;
    for (const tournament of targetTournaments) {
        const divisions = await db
            .select({
            id: schema.tournamentDivisions.id,
            name: schema.tournamentDivisions.name,
            bracketType: schema.tournamentDivisions.bracketType,
        })
            .from(schema.tournamentDivisions)
            .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.tournamentId, tournament.id));
        const doubleElimDivisions = divisions.filter((division) => (division.bracketType || '').toUpperCase() === 'DOUBLE_ELIMINATION');
        if (doubleElimDivisions.length === 0) {
            skipped++;
            continue;
        }
        for (const division of doubleElimDivisions) {
            try {
                const result = await repairDivision(token, tournament, division);
                if (result.skipped) {
                    skipped++;
                    console.log(`- Skipped ${tournament.name} / ${division.name}: ${result.reason}`);
                }
                else {
                    repaired++;
                }
            }
            catch (error) {
                skipped++;
                console.log(`- Failed ${tournament.name} / ${division.name}: ${error?.message || error}`);
            }
        }
    }
    await pg.end();
    console.log(`Done. repaired=${repaired}, skipped=${skipped}`);
}
main().catch(async (error) => {
    console.error(error);
    await pg.end().catch(() => undefined);
    process.exit(1);
});
//# sourceMappingURL=repair-double-elim-brackets.js.map