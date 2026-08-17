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
const BASE = 'http://localhost:3000/api/v1';
async function api(path, options) {
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, body, headers: res.headers };
}
async function main() {
    console.log('=== GENERATE BRACKETS ===\n');
    console.log('1. Login as organizer...');
    const login = await api('/auth/mobile/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'organizer@vndcsport.com', password: 'password123' }),
    });
    const loginBody = login.body;
    const token = loginBody?.data?.accessToken || loginBody?.accessToken || '';
    if (!token) {
        console.error('Login failed, no token in response');
        console.error('  Response:', JSON.stringify(login.body).substring(0, 200));
        console.error('  Tip: use POST /auth/mobile/login (web login strips tokens from body)');
        return;
    }
    const authHeaders = { 'Authorization': `Bearer ${token}` };
    console.log('  OK\n');
    const tours = await db.select().from(schema.tournaments)
        .where((0, drizzle_orm_1.sql) `invite_code LIKE 'T%'`)
        .orderBy(schema.tournaments.createdAt);
    console.log(`2. Found ${tours.length} tournaments\n`);
    let successCount = 0;
    let failCount = 0;
    let totalMatches = 0;
    for (const tour of tours) {
        process.stdout.write(`[${tour.name.substring(0, 30).padEnd(31)}] `);
        try {
            const div = await api(`/tournaments/${tour.id}/divisions`, { headers: authHeaders });
            const divisions = Array.isArray(div.body?.data) ? div.body.data
                : Array.isArray(div.body) ? div.body : [];
            const divId = divisions[0]?.id;
            if (!divId) {
                console.log(`No division (data=${JSON.stringify(div.body).substring(0, 80)})`);
                failCount++;
                continue;
            }
            await db.update(schema.tournaments)
                .set({ status: 'DRAFT' })
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tour.id));
            let gen = await api(`/tournaments/${tour.id}/generate-bracket`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ divisionId: divId }),
            });
            if (!gen.ok) {
                console.log(`\n    First attempt failed (${gen.status}), trying publish first...`);
                await db.update(schema.tournaments)
                    .set({
                    description: tour.description || `Bracket test for ${tour.name}`,
                    bannerUrl: tour.bannerUrl || 'https://placehold.co/1200x400?text=Tournament',
                })
                    .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tour.id));
                const pub = await api(`/tournaments/${tour.id}/publish`, {
                    method: 'POST',
                    headers: authHeaders,
                });
                if (pub.ok) {
                    console.log(`    Publish OK (status: ${pub.body?.status || 'set'}), retrying bracket generation...`);
                    gen = await api(`/tournaments/${tour.id}/generate-bracket`, {
                        method: 'POST',
                        headers: authHeaders,
                        body: JSON.stringify({ divisionId: divId }),
                    });
                }
                else {
                    console.log(`    Publish failed (${pub.status}): ${JSON.stringify(pub.body).substring(0, 120)}`);
                    console.log(`    Skipping tournament.`);
                    failCount++;
                    continue;
                }
            }
            if (!gen.ok) {
                console.log(`Error ${gen.status}: ${JSON.stringify(gen.body).substring(0, 120)}`);
                failCount++;
                continue;
            }
            await db.update(schema.tournaments)
                .set({ status: 'IN_PROGRESS' })
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tour.id));
            await db.update(schema.tournamentDivisions)
                .set({ status: 'ACTIVE' })
                .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.tournamentId, tour.id));
            const matchRes = await api(`/matches?tournamentId=${tour.id}`, { headers: authHeaders });
            const matches = Array.isArray(matchRes.body?.data) ? matchRes.body.data
                : Array.isArray(matchRes.body) ? matchRes.body : [];
            let validMatches = 0;
            for (const m of matches) {
                if (m.round_number != null && m.match_order != null) {
                    validMatches++;
                }
            }
            totalMatches += matches.length;
            successCount++;
            console.log(`Bracket OK → ${matches.length} matches (${validMatches} with round/match_order)`);
        }
        catch (err) {
            console.log(`Error: ${err.message}`);
            failCount++;
        }
    }
    await pg.end();
    console.log(`\n=== DONE ===`);
    console.log(`  Successful: ${successCount}`);
    console.log(`  Failed:     ${failCount}`);
    console.log(`  Total matches: ${totalMatches}`);
}
main().catch(err => { console.error(err); process.exit(1); });
//# sourceMappingURL=generate-brackets.js.map