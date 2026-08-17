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
async function main() {
    const duplicates = (await db.execute((0, drizzle_orm_1.sql) `
    SELECT group_id, participant_id, COUNT(*) AS row_count
    FROM group_standings
    GROUP BY group_id, participant_id
    HAVING COUNT(*) > 1
    ORDER BY group_id, participant_id
  `));
    const rows = duplicates;
    if (rows.length === 0) {
        console.log('PREFLIGHT CLEAN — no duplicate (group_id, participant_id) rows.');
        console.log('Safe to apply UNIQUE constraint idx_standings_group_participant_unique.');
        process.exit(0);
    }
    console.log(`PREFLIGHT BLOCKED — ${rows.length} duplicate group(s) found. DO NOT add UNIQUE yet.\n`);
    for (const dup of rows) {
        console.log(`- group_id=${String(dup.group_id)} participant_id=${String(dup.participant_id)} rows=${String(dup.row_count)}`);
        const detail = (await db.execute((0, drizzle_orm_1.sql) `
      SELECT id, played, won, lost, draws, points_for, points_against, total_points, updated_at
      FROM group_standings
      WHERE group_id = ${dup.group_id} AND participant_id = ${dup.participant_id}
      ORDER BY updated_at
    `));
        for (const row of detail) {
            console.log(`    id=${String(row.id)} played=${String(row.played)} won=${String(row.won)} lost=${String(row.lost)} ` +
                `draws=${String(row.draws)} pf=${String(row.points_for)} pa=${String(row.points_against)} ` +
                `pts=${String(row.total_points)} updated_at=${String(row.updated_at)}`);
        }
    }
    console.log('\nReconcile steps (operator-approved, backup REQUIRED):\n' +
        '1. pg_dump --table=group_standings (hoặc CREATE TABLE group_standings_backup_<date> AS SELECT * FROM group_standings)\n' +
        '2. Với TỪNG nhóm duplicate: giữ row đại diện (mới nhất/theo audit) và XÓA row thừa (KHÔNG merge counters — nghi double-count),\n' +
        '   hoặc recompute standings từ matches COMPLETED của group (nguồn chính xác nhất).\n' +
        '3. Chạy lại preflight → phải CLEAN rồi mới apply migration.');
    process.exit(1);
}
main().catch((err) => {
    console.error('Preflight failed:', err);
    process.exit(2);
});
//# sourceMappingURL=preflight-standings-duplicates.js.map