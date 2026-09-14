import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('tournament division entry fee override migration', () => {
  const migration = join(
    __dirname,
    '2026-09-14_add_tournament_division_entry_fee_override.sql',
  );

  it('is discoverable as a standalone production migration', () => {
    expect(existsSync(migration)).toBe(true);

    const runner = readFileSync(
      join(__dirname, '..', '..', '..', 'run-prod-migration.js'),
      'utf8',
    );
    expect(runner).toContain('standaloneMigrations');
    expect(runner).toContain('.filter((tag) => !journalTags.has(tag))');
  });

  it('drops NOT NULL before converting legacy inherited fees to NULL', () => {
    const sql = readFileSync(migration, 'utf8');
    const dropNotNull = sql.indexOf(
      'ALTER COLUMN "entry_fee" DROP NOT NULL;',
    );
    const backfill = sql.indexOf('UPDATE "tournament_divisions"');

    expect(dropNotNull).toBeGreaterThanOrEqual(0);
    expect(backfill).toBeGreaterThan(dropNotNull);
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS "entry_fee_override_enabled"',
    );
    expect(sql).toContain(
      'ADD CONSTRAINT "entry_fee_override_consistent"',
    );
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });
});
