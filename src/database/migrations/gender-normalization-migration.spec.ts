import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('gender canonicalization migration', () => {
  const directory = join(__dirname);
  const migrationPath = join(directory, '2026-09-16_canonicalize_gender_values.sql');

  it('is present as a standalone migration consumed by the production runner', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const runner = readFileSync(
      join(directory, '..', '..', '..', 'run-prod-migration.js'),
      'utf8',
    );
    expect(runner).toContain('standaloneMigrations');
    expect(runner).toContain('discoverMigrationFiles');
  });

  it('canonicalizes only recognized profile and ranking aliases', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    for (const table of [
      'profiles',
      'tournaments',
      'tournament_divisions',
      'user_ranks',
      'pair_ranks',
      'community_rankings',
      'ranking_context_statuses',
      'admin_elo_operations',
    ]) {
      expect(sql).toContain(`UPDATE "${table}"`);
    }
    expect(sql).toContain("WHEN 'NỮ' THEN 'FEMALE'");
    expect(sql).toContain("WHEN 'MIXED_DOUBLES' THEN 'MIXED'");
    expect(sql).toContain('ELSE "gender_restriction"');
  });
});
