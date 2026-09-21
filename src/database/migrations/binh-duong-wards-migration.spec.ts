import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Binh Duong wards compatibility migration', () => {
  it('restores legacy province-code 74 wards without destructive SQL', () => {
    const sql = readFileSync(
      join(__dirname, '2026-09-21_seed-binh-duong-wards.sql'),
      'utf8',
    );

    expect(sql).toContain('INSERT INTO "wards"');
    expect(sql).toContain("'74'");
    expect(sql).toContain('ON CONFLICT ("code") DO UPDATE');
    expect(sql).not.toMatch(/DELETE FROM|DROP TABLE|TRUNCATE/i);
  });
});
