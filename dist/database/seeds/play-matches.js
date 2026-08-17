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
function generateBadmintonScore(winner) {
    const isThreeSets = Math.random() > 0.5;
    const sets = [];
    if (winner === 1) {
        if (isThreeSets) {
            sets.push({ team1Score: 21, team2Score: 15, isFinished: true });
            sets.push({ team1Score: 18, team2Score: 21, isFinished: true });
            sets.push({ team1Score: 21, team2Score: 16, isFinished: true });
            return { p1SetsWon: 2, p2SetsWon: 1, scoreDetails: { sets } };
        }
        else {
            sets.push({ team1Score: 21, team2Score: 15, isFinished: true });
            sets.push({ team1Score: 21, team2Score: 17, isFinished: true });
            return { p1SetsWon: 2, p2SetsWon: 0, scoreDetails: { sets } };
        }
    }
    else {
        if (isThreeSets) {
            sets.push({ team1Score: 15, team2Score: 21, isFinished: true });
            sets.push({ team1Score: 21, team2Score: 18, isFinished: true });
            sets.push({ team1Score: 16, team2Score: 21, isFinished: true });
            return { p1SetsWon: 1, p2SetsWon: 2, scoreDetails: { sets } };
        }
        else {
            sets.push({ team1Score: 15, team2Score: 21, isFinished: true });
            sets.push({ team1Score: 17, team2Score: 21, isFinished: true });
            return { p1SetsWon: 0, p2SetsWon: 2, scoreDetails: { sets } };
        }
    }
}
async function main() {
    console.log('=== SEED SCORES & PLAY MATCHES ===\n');
    console.log('1. Login as organizer...');
    const login = await api('/auth/mobile/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'organizer@vndcsport.com', password: 'password123' }),
    });
    const loginBody = login.body;
    const token = loginBody?.data?.accessToken || loginBody?.accessToken || '';
    if (!token) {
        console.error('Login failed, no token in response');
        return;
    }
    const authHeaders = { 'Authorization': `Bearer ${token}` };
    console.log('  OK\n');
    const tours = await db.select().from(schema.tournaments)
        .where((0, drizzle_orm_1.sql) `invite_code LIKE 'T%'`)
        .orderBy(schema.tournaments.createdAt);
    console.log(`2. Found ${tours.length} tournaments to play\n`);
    for (const tour of tours) {
        if (tour.name.includes('Round Robin') || tour.name.startsWith('RR-')) {
            console.log(`Skipping match playing simulation for Round Robin tournament: ${tour.name}`);
            continue;
        }
        console.log(`\n--------------------------------------------`);
        console.log(`Playing tournament: ${tour.name} (${tour.id})`);
        console.log(`--------------------------------------------`);
        let loop = true;
        let iteration = 0;
        const maxIterations = 15;
        while (loop && iteration < maxIterations) {
            iteration++;
            console.log(`\n[Iteration ${iteration}] Fetching matches...`);
            const matchRes = await api(`/matches?tournamentId=${tour.id}&limit=200`, { headers: authHeaders });
            const matches = Array.isArray(matchRes.body?.data) ? matchRes.body.data
                : Array.isArray(matchRes.body) ? matchRes.body : [];
            if (matches.length === 0) {
                console.log('  No matches found for this tournament.');
                break;
            }
            const playableMatches = matches.filter((m) => m.participant1?.id &&
                m.participant2?.id &&
                m.status !== 'COMPLETED' &&
                !m.isBye);
            console.log(`  Total matches: ${matches.length}, Playable matches in this round: ${playableMatches.length}`);
            if (playableMatches.length === 0) {
                console.log('  No more playable matches. Tournament is fully played or waiting.');
                loop = false;
                break;
            }
            for (const match of playableMatches) {
                const winnerSide = (parseInt(match.id.substring(0, 2), 16) % 2 === 0) ? 1 : 2;
                const winnerId = winnerSide === 1 ? match.participant1.id : match.participant2.id;
                console.log(`  -> Playing Match #${match.matchOrder} (Round ${match.roundNumber}): ${match.participant1.teamName} vs ${match.participant2.teamName}`);
                const score = generateBadmintonScore(winnerSide);
                const scoreUpdate = await api(`/matches/${match.id}/score`, {
                    method: 'PATCH',
                    headers: authHeaders,
                    body: JSON.stringify({
                        p1SetsWon: score.p1SetsWon,
                        p2SetsWon: score.p2SetsWon,
                        winnerId: winnerId,
                        scoreDetails: score.scoreDetails,
                    }),
                });
                if (scoreUpdate.ok) {
                    const winnerName = winnerSide === 1 ? match.participant1.teamName : match.participant2.teamName;
                    console.log(`     OK: ${winnerName} won (${score.p1SetsWon}-${score.p2SetsWon})`);
                }
                else {
                    console.error(`     FAILED to update score: Status ${scoreUpdate.status}`, JSON.stringify(scoreUpdate.body));
                }
            }
        }
    }
    await pg.end();
    console.log(`\n=== ALL MATCHES SEEDED & PLAYED SUCCESSFULLY ===`);
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=play-matches.js.map