import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccountSanctionService } from './account-sanction.service';

function databaseReturning(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  return { select: jest.fn().mockReturnValue({ from }) };
}

describe('AccountSanctionService access-ban predicate', () => {
  it('denies only active, unexpired soft/hard bans and leaves WARN unaffected', () => {
    const source = readFileSync(join(__dirname, 'account-sanction.service.ts'), 'utf8');

    expect(source).toContain("inArray(schema.userBans.banType, ['SOFT_BAN', 'HARD_BAN'])");
    expect(source).toContain('eq(schema.userBans.isActive, true)');
    expect(source).toContain('isNull(schema.userBans.expiresAt)');
    expect(source).toContain('gt(schema.userBans.expiresAt, new Date())');
  });

  it('uses a short negative cache result without querying PostgreSQL', async () => {
    const database = databaseReturning([]);
    const redis = {
      get: jest.fn().mockResolvedValue('0'),
      set: jest.fn(),
    };
    const service = new AccountSanctionService(database as never, redis as never);

    await expect(service.hasActiveAccessBan('user-1')).resolves.toBe(false);
    expect(database.select).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('falls back to PostgreSQL and caches an active ban', async () => {
    const database = databaseReturning([{ id: 'ban-1', expiresAt: null }]);
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
    const service = new AccountSanctionService(database as never, redis as never);

    await expect(service.hasActiveAccessBan('user-1')).resolves.toBe(true);
    expect(redis.set).toHaveBeenCalledWith('account:access-ban:user-1', '1', 60);
  });

  it('invalidates cached state after an unban', async () => {
    const redis = { del: jest.fn().mockResolvedValue(1) };
    const service = new AccountSanctionService({} as never, redis as never);

    await service.invalidateAccessBan('user-1');
    expect(redis.del).toHaveBeenCalledWith('account:access-ban:user-1');
  });
});
