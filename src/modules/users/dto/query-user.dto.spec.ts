import { validate } from 'class-validator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UserRole } from '../../../common/constants/enums';
import { AdminUserStatusFilter, QueryUserDto } from './query-user.dto';

describe('QueryUserDto role filter', () => {
  it('accepts only known system roles', async () => {
    const valid = Object.assign(new QueryUserDto(), { role: UserRole.ORGANIZER });
    const invalid = Object.assign(new QueryUserDto(), { role: 'COMMUNITY_OWNER' });

    expect(await validate(valid)).toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('accepts only explicit admin status and exact YYYY-MM-DD date filters', async () => {
    const valid = Object.assign(new QueryUserDto(), {
      status: AdminUserStatusFilter.BANNED,
      from: '2026-08-01',
      to: '2026-08-31',
    });
    const invalid = Object.assign(new QueryUserDto(), {
      status: 'PENDING',
      from: '01/08/2026',
      to: '2026-08-31T00:00:00Z',
    });

    expect(await validate(valid)).toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('rejects impossible calendar dates', async () => {
    const invalid = Object.assign(new QueryUserDto(), { from: '2026-02-30' });

    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('keeps sanctions out of the cursor-paginated user query', () => {
    const source = readFileSync(join(__dirname, '..', 'users.repository.ts'), 'utf8');

    expect(source).toContain('const activeBanRows = data.length > 0');
    expect(source).toContain('const activeBanByUserId = new Map');
    expect(source).toContain('orderBy(desc(schema.userBans.createdAt), desc(schema.userBans.id))');
    expect(source).not.toContain('.leftJoin(\n        schema.userBans');
  });

  it('applies the same active-sanction and inclusive date predicates before list, count and cursor', () => {
    const source = readFileSync(join(__dirname, '..', 'users.repository.ts'), 'utf8');

    expect(source).toContain('const activeSanctionPredicate = sql`exists');
    expect(source).toContain('status === AdminUserStatusFilter.BANNED');
    expect(source).toContain('status === AdminUserStatusFilter.ACTIVE');
    expect(source).toContain('current_ban.is_active = true');
    expect(source).toContain('current_ban.expires_at > now()');
    expect(source).toContain("new Date(`${from}T00:00:00.000Z`)");
    expect(source).toContain('inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1)');
  });
});
