/**
 * Regression guard for the PostGIS geolocation drift.
 *
 * Two defects motivated this file, and neither was catchable by the tests that
 * already existed in this directory:
 *
 *  1. `communities.location_geolocation` and `tournament_venues.location_geolocation`
 *     were created as `text` by 0000_living_lila_cheney.sql:111,137 while the
 *     Drizzle schema and every snapshot declare `geography(Point, 4326)`. No test
 *     asserted a column DATA TYPE anywhere in the repo, so the mismatch survived
 *     from the first migration until now.
 *
 *  2. The social_sessions geo statements lived in journal entry `0038`, which
 *     runs BEFORE every standalone file (run-prod-migration.js:198), so they
 *     executed before 2026-09-22_add_social_sessions.sql created the table and CI
 *     died with 42P01 on every fresh database.
 *
 * These are static assertions, matching the convention of the other specs in this
 * directory (they read files rather than opening a connection). What they add over
 * the existing specs is the *type* and the *ordering* dimension, which nothing
 * covered.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = __dirname;
const REPAIR_FILE = '2026-09-27_add_social_session_geolocation.sql';
const EMPTIED_FILE = '0038_social-session-geolocation.sql';

const readMigration = (file: string) =>
  readFileSync(join(MIGRATIONS_DIR, file), 'utf8');

const journal = JSON.parse(
  readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
);

describe('PostGIS geolocation columns', () => {
  it('declares every geolocation column as geography(Point, 4326) in the Drizzle schema', () => {
    // A `text` column here is the defect this file exists to prevent: the
    // customType resolves to `string` either way, so TypeScript never flags it.
    for (const file of ['communities', 'venues', 'social-sessions']) {
      const source = readFileSync(
        join(MIGRATIONS_DIR, '..', 'schema', `${file}.schema.ts`),
        'utf8',
      );
      expect(source).toContain("return 'geography(Point, 4326)'");
    }
  });

  it('never lets a journal entry depend on a table a standalone migration creates', () => {
    // The runner returns journalEntries.concat(standalone), so a journal entry
    // cannot rely on any standalone file having run. social_sessions is created
    // by 2026-09-22 (standalone); the geo work must therefore be standalone too.
    expect(existsSync(join(MIGRATIONS_DIR, '2026-09-22_add_social_sessions.sql'))).toBe(
      true,
    );

    const journalTags: string[] = journal.entries.map(
      (entry: { tag: string }) => entry.tag,
    );
    const repairTag = REPAIR_FILE.replace('.sql', '');

    // The repair must NOT be a journal entry.
    expect(journalTags).not.toContain(repairTag);

    // And it must sort after the file that creates the table.
    expect(repairTag > '2026-09-22_add_social_sessions').toBe(true);
  });

  it('keeps the emptied 0038 entry as a no-op instead of deleting its snapshot', () => {
    // meta/0038_snapshot.json is full-schema state, not a delta: it carries 13
    // tables no journal migration creates. Dropping it would make the next
    // `drizzle-kit generate` re-emit all of them against existing tables.
    const source = readMigration(EMPTIED_FILE);
    expect(source).toContain('SELECT 1;');
    expect(source).not.toContain('ALTER TABLE "social_sessions"');
    expect(existsSync(join(MIGRATIONS_DIR, 'meta', '0038_snapshot.json'))).toBe(true);
  });

  it('repairs the drifted columns with ALTER COLUMN ... TYPE and an explicit USING clause', () => {
    const source = readMigration(REPAIR_FILE);

    // A bare ALTER COLUMN ... TYPE fails: there is no assignment cast from
    // text to geography, so Postgres raises 42804 "cannot be cast automatically".
    for (const table of ['communities', 'tournament_venues']) {
      expect(source).toMatch(
        new RegExp(
          `ALTER TABLE "${table}" ALTER COLUMN "location_geolocation" TYPE geography\\(Point, 4326\\) USING "location_geolocation"::geography`,
        ),
      );
    }

    // Re-issuing ADD COLUMN could never converge a wrong-typed column, because
    // run-prod-migration.js:53 swallows SQLSTATE 42701 for any ADD COLUMN.
    // The corrective statement must be an ALTER COLUMN ... TYPE.
    expect(source).not.toMatch(/ADD COLUMN IF NOT EXISTS "location_geolocation"/);
  });

  it('creates social_sessions.venue_geolocation as geography with a gist index', () => {
    const source = readMigration(REPAIR_FILE);
    expect(source).toContain(
      'ADD COLUMN IF NOT EXISTS "venue_geolocation" geography(Point, 4326)',
    );
    expect(source).toContain(
      'CREATE INDEX IF NOT EXISTS "social_session_geo_idx" ON "social_sessions" USING gist',
    );
  });

  it('enables postgis inside the migration pipeline', () => {
    // run-prod-migration.js issues no CREATE EXTENSION anywhere, and no .sql in
    // this directory did either. Only migrate.ts did, and that is not the
    // production path (Dockerfile:30, docker-compose.yml:58, deploy.yml:132-133
    // all invoke run-prod-migration.js).
    expect(readMigration(REPAIR_FILE)).toContain(
      'CREATE EXTENSION IF NOT EXISTS postgis',
    );
  });

  it('compares metres to metres in the communities radius filter', () => {
    // Without ::geography the reference point stays a bare geometry, PostGIS
    // resolves ST_DWithin to the (geometry, geometry, double precision)
    // overload whose third argument is in DEGREES, and a metre radius is wrong
    // by ~111000x. social-sessions.repository.ts:66 already had this right.
    const source = readFileSync(
      join(
        MIGRATIONS_DIR,
        '..',
        '..',
        'modules',
        'communities',
        'communities.repository.ts',
      ),
      'utf8',
    );
    expect(source).toMatch(
      /ST_SetSRID\(ST_MakePoint\(\$\{query\.lng\}, \$\{query\.lat\}\), 4326\)::geography/,
    );
  });
});
