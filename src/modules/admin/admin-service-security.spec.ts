import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AdminService } from './admin.service';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

describe('AdminService user punishment safety', () => {
  it('rejects a self-ban before any database transaction', async () => {
    const database = { transaction: jest.fn() };
    const service = new AdminService(
      database as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.banUser(ADMIN_ID, ADMIN_ID, 'test', 'HARD_BAN'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('rejects a self-unban before changing sanctions', async () => {
    const database = { update: jest.fn() };
    const service = new AdminService(
      database as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.unbanUser(ADMIN_ID, ADMIN_ID)).rejects.toBeInstanceOf(BadRequestException);
    expect(database.update).not.toHaveBeenCalled();
  });

  it('keeps stale-admin and soft/hard session-revocation guards in the transaction path', () => {
    const source = readFileSync(join(__dirname, 'admin.service.ts'), 'utf8');

    expect(source).toContain("eq(schema.roles.name, UserRole.ADMIN)");
    expect(source).toContain("throw new ForbiddenException('Quyền quản trị của bạn không còn hiệu lực");
    expect(source).toContain("banType === 'SOFT_BAN' || banType === 'HARD_BAN'");
    expect(source).toContain('eq(schema.sessions.isRevoked, false)');
    expect(source).toContain("active_ban.ban_type in ('SOFT_BAN', 'HARD_BAN')");
    expect(source).toContain('active_ban.expires_at > now()');
    expect(source).toContain("if (banType !== 'WARN' && targetAdminRoles.length > 0)");
    expect(source).toContain('this.accountSanctionService.markAccessBanned(userId, expiry)');
    expect(source).toContain('this.accountSanctionService.invalidateAccessBan(userId)');
  });
});
