import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Binh Thuan wards compatibility migration', () => {
  it('restores ward rows for the legacy province code without touching other provinces', () => {
    const sql = readFileSync(
      join(__dirname, '2026-09-21_seed-binh-thuan-wards.sql'),
      'utf8',
    );

    expect(sql).toContain('INSERT INTO "wards"');
    expect(sql).toContain("'60'");
    expect(sql).toContain('ON CONFLICT ("code") DO UPDATE');
    expect(sql).not.toMatch(/DELETE FROM|DROP TABLE|TRUNCATE/i);
  });
});
