/**
 * Preflight: detect duplicate group_standings rows BEFORE adding the
 * UNIQUE(group_id, participant_id) constraint (migration
 * 2026-08-04_match_integrity_remediation.sql).
 *
 * NOTE-2 / plan mục 6.2: KHÔNG tự merge counters mù — duplicate có thể là
 * double-count. Script chỉ REPORT; reconcile do operator quyết định theo
 * từng nhóm duplicate (giữ row đại diện + xóa row thừa, hoặc recompute từ
 * matches COMPLETED) với backup bắt buộc.
 *
 * Chạy: pnpm exec ts-node src/database/seeds/preflight-standings-duplicates.ts
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '../schema';
import { createPostgresClientFromEnv } from '../postgres-client';

const pg = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(pg, { schema });

async function main() {
  const duplicates = (await db.execute(sql`
    SELECT group_id, participant_id, COUNT(*) AS row_count
    FROM group_standings
    GROUP BY group_id, participant_id
    HAVING COUNT(*) > 1
    ORDER BY group_id, participant_id
  `)) as unknown as Array<{ group_id: string; participant_id: string; row_count: string }>;

  const rows = duplicates;

  if (rows.length === 0) {
    console.log('PREFLIGHT CLEAN — no duplicate (group_id, participant_id) rows.');
    console.log('Safe to apply UNIQUE constraint idx_standings_group_participant_unique.');
    process.exit(0);
  }

  console.log(`PREFLIGHT BLOCKED — ${rows.length} duplicate group(s) found. DO NOT add UNIQUE yet.\n`);
  for (const dup of rows) {
    console.log(
      `- group_id=${String(dup.group_id)} participant_id=${String(dup.participant_id)} rows=${String(dup.row_count)}`,
    );
    const detail = (await db.execute(sql`
      SELECT id, played, won, lost, draws, points_for, points_against, total_points, updated_at
      FROM group_standings
      WHERE group_id = ${dup.group_id} AND participant_id = ${dup.participant_id}
      ORDER BY updated_at
    `)) as unknown as Array<{
      id: string;
      played: string;
      won: string;
      lost: string;
      draws: string;
      points_for: string;
      points_against: string;
      total_points: string;
      updated_at: string;
    }>;
    for (const row of detail) {
      console.log(
        `    id=${String(row.id)} played=${String(row.played)} won=${String(row.won)} lost=${String(row.lost)} ` +
          `draws=${String(row.draws)} pf=${String(row.points_for)} pa=${String(row.points_against)} ` +
          `pts=${String(row.total_points)} updated_at=${String(row.updated_at)}`,
      );
    }
  }
  console.log(
    '\nReconcile steps (operator-approved, backup REQUIRED):\n' +
      '1. pg_dump --table=group_standings (hoặc CREATE TABLE group_standings_backup_<date> AS SELECT * FROM group_standings)\n' +
      '2. Với TỪNG nhóm duplicate: giữ row đại diện (mới nhất/theo audit) và XÓA row thừa (KHÔNG merge counters — nghi double-count),\n' +
      '   hoặc recompute standings từ matches COMPLETED của group (nguồn chính xác nhất).\n' +
      '3. Chạy lại preflight → phải CLEAN rồi mới apply migration.',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('Preflight failed:', err);
  process.exit(2);
});
