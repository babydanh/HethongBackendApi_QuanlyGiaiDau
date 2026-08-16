import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('football team migration bundle', () => {
  const directory = join(__dirname);
  const required = [
    '2026-08-15_add_football_team_domain.sql',
    '2026-08-15_add_football_team_logo_snapshot.sql',
    '2026-08-15_add_tournament_roster_lock.sql',
    '2026-08-15_link_football_team_to_participants.sql',
    '2026-08-16_backfill_football_team_config.sql',
  ];

  it('contains the standalone files consumed by the production runner', () => {
    for (const file of required) {
      expect(existsSync(join(directory, file))).toBe(true);
    }
  });

  it('keeps the dependency order and idempotent DDL markers', () => {
    const domain = readFileSync(join(directory, required[0]), 'utf8');
    const logo = readFileSync(join(directory, required[1]), 'utf8');
    const lock = readFileSync(join(directory, required[2]), 'utf8');
    const link = readFileSync(join(directory, required[3]), 'utf8');
    const legacyConfig = readFileSync(join(directory, required[4]), 'utf8');
    expect(domain).toContain('CREATE TABLE IF NOT EXISTS football_teams');
    expect(domain).toContain('CREATE TABLE IF NOT EXISTS tournament_team_entries');
    expect(logo).toContain('ADD COLUMN IF NOT EXISTS football_team_logo_url');
    expect(lock).toContain('ADD COLUMN IF NOT EXISTS roster_locked_at');
    expect(link).toContain('ADD COLUMN IF NOT EXISTS football_team_id');
    expect(legacyConfig).toContain("lower(c.slug) = 'football'");
    expect(legacyConfig).toContain("'teamSize'");
    expect(legacyConfig).toContain("'minTeamSize'");
    expect(required.indexOf(required[0])).toBeLessThan(required.indexOf(required[3]));
  });

  it('is safe for existing participant data and has no destructive table DDL', () => {
    for (const file of required) {
      const sql = readFileSync(join(directory, file), 'utf8');
      expect(sql).not.toMatch(/DROP\s+TABLE/i);
      expect(sql).not.toMatch(/DROP\s+COLUMN/i);

      const addColumnStatements = sql.match(/ALTER\s+TABLE[\s\S]*?ADD\s+COLUMN[^;]*;/gi) ?? [];
      for (const statement of addColumnStatements) {
        expect(statement).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i);
      }
    }
  });

  it('keeps standalone football migrations discoverable by the production runner', () => {
    const runnerPath = join(directory, '..', '..', '..', 'run-prod-migration.js');
    const runner = readFileSync(runnerPath, 'utf8');

    expect(runner).toContain("!file.startsWith('meta')");
    expect(runner).toContain('.filter((tag) => !journalTags.has(tag))');
    expect(runner).toContain('.sort()');
    expect(runner).toContain("process.argv.includes('--dry-run')");
    expect(runner).toContain('database unchanged.');
    expect(runner).toContain('process.exitCode = 1');
    expect(runner).toContain('finally');
    expect(runner).toContain('FK triggers restored after migration failure');
    for (const file of required) {
      expect(runner).toContain('standaloneMigrations');
      expect(existsSync(join(directory, file))).toBe(true);
    }
  });

  it('runs migration dry-run and API smoke before deploy succeeds', () => {
    const workflowPath = join(directory, '..', '..', '..', '.github', 'workflows', 'deploy.yml');
    const workflow = readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain('node run-prod-migration.js --dry-run');
    // Categories does not accept cursor/limit query parameters; keep the
    // release smoke check on the public endpoint contract used in production.
    expect(workflow).toContain('https://sporto.asia/api/v1/categories');
    expect(workflow).toContain('docker compose logs --tail=120 backend');
  });

  it('mounts host migrations at the runner path in the root compose file', () => {
    const composePath = join(directory, '..', '..', '..', '..', 'docker-compose.yml');
    const compose = readFileSync(composePath, 'utf8');
    expect(compose).toContain(':/app/src/database/migrations');
    expect(compose).not.toContain(':/app/dist/database/migrations');
  });
});
