import { readFileSync } from 'fs';
import { join } from 'path';

describe('social pickup drop migration', () => {
  const migrationPath = join(
    __dirname,
    '2026-09-21_drop_social_pickup_tables.sql',
  );

  it('drops only the explicitly approved tables in FK-safe order', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const participantDrop = sql.indexOf(
      'DROP TABLE IF EXISTS social_pickup_participants',
    );
    const sessionDrop = sql.indexOf(
      'DROP TABLE IF EXISTS social_pickup_sessions',
    );

    expect(participantDrop).toBeGreaterThanOrEqual(0);
    expect(sessionDrop).toBeGreaterThan(participantDrop);
    expect(sql).not.toMatch(/DROP TABLE IF EXISTS (users|communities|categories|tournament_venues|venue_courts)/i);
  });
});
