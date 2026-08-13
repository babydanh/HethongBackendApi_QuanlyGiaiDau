import { BadRequestException, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validate } from 'class-validator';
import { UserRole } from '../../common/constants/enums';
import { UpdateSystemRolesDto } from './dto/update-system-roles.dto';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { StorageService } from '../../providers/storage/storage.service';
import { RankingsService } from '../rankings/rankings.service';
import { NotificationsService } from '../notifications/notifications.service';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';

describe('UpdateSystemRolesDto', () => {
  it('only accepts a non-empty, unique list of known global roles', async () => {
    const invalid = Object.assign(new UpdateSystemRolesDto(), {
      roles: [UserRole.ADMIN, UserRole.ADMIN, 'COMMUNITY_OWNER'],
    });
    const valid = Object.assign(new UpdateSystemRolesDto(), {
      roles: [UserRole.PLAYER, UserRole.REFEREE],
    });

    expect(await validate(invalid)).not.toHaveLength(0);
    expect(await validate(valid)).toHaveLength(0);
  });
});

describe('UsersService.updateSystemRoles', () => {
  let replaceSystemRoles: jest.Mock;
  let service: UsersService;

  beforeEach(() => {
    replaceSystemRoles = jest.fn().mockResolvedValue([UserRole.PLAYER]);
    service = new UsersService(
      { replaceSystemRoles } as unknown as UsersRepository,
      {} as StorageService,
      {} as RankingsService,
      {} as NotificationsService,
    );
  });

  it('blocks self role changes before touching the repository', async () => {
    await expect(
      service.updateSystemRoles(ADMIN_ID, ADMIN_ID, [UserRole.PLAYER]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(replaceSystemRoles).not.toHaveBeenCalled();
  });

  it('returns the replaced system roles only after repository success', async () => {
    replaceSystemRoles.mockResolvedValueOnce([UserRole.PLAYER, UserRole.ORGANIZER]);

    await expect(
      service.updateSystemRoles(ADMIN_ID, TARGET_ID, [UserRole.ORGANIZER]),
    ).resolves.toEqual({
      userId: TARGET_ID,
      roles: [UserRole.PLAYER, UserRole.ORGANIZER],
    });
    expect(replaceSystemRoles).toHaveBeenCalledWith(
      TARGET_ID,
      [UserRole.PLAYER, UserRole.ORGANIZER],
      ADMIN_ID,
    );
  });

  it('keeps PLAYER when the administrator requests an elevated role only', async () => {
    replaceSystemRoles.mockResolvedValueOnce([UserRole.PLAYER, UserRole.ADMIN]);

    await expect(
      service.updateSystemRoles(ADMIN_ID, TARGET_ID, [UserRole.ADMIN]),
    ).resolves.toEqual({
      userId: TARGET_ID,
      roles: [UserRole.PLAYER, UserRole.ADMIN],
    });
    expect(replaceSystemRoles).toHaveBeenCalledWith(
      TARGET_ID,
      [UserRole.PLAYER, UserRole.ADMIN],
      ADMIN_ID,
    );
  });

  it.each([
    ['SYSTEM_ROLE_NOT_FOUND', 'Một hoặc nhiều quyền hệ thống chưa được khởi tạo.'],
    ['LAST_ADMIN', 'Không thể gỡ quyền của quản trị viên hệ thống cuối cùng.'],
  ])('maps repository invariant %s to a safe validation error', async (code, message) => {
    replaceSystemRoles.mockRejectedValueOnce(new Error(code));

    await expect(
      service.updateSystemRoles(ADMIN_ID, TARGET_ID, [UserRole.PLAYER]),
    ).rejects.toMatchObject({ message });
  });

  it('rejects a stale JWT actor that no longer has ADMIN in the database', async () => {
    replaceSystemRoles.mockRejectedValueOnce(new Error('ACTOR_NOT_ADMIN'));

    await expect(
      service.updateSystemRoles(ADMIN_ID, TARGET_ID, [UserRole.PLAYER]),
    ).rejects.toMatchObject({
      name: 'ForbiddenException',
      message: 'Quyền quản trị của bạn không còn hiệu lực. Vui lòng đăng nhập lại.',
    });
  });

  it('defines usable admins as non-deleted and not actively soft/hard-banned', () => {
    const source = readFileSync(join(__dirname, 'users.repository.ts'), 'utf8');

    expect(source).toContain("active_ban.ban_type in ('SOFT_BAN', 'HARD_BAN')");
    expect(source).toContain('active_ban.expires_at > now()');
    expect(source).toContain('activeAdminUserIds.has(targetUserId)');
  });

  it('reports a missing target user', async () => {
    replaceSystemRoles.mockResolvedValueOnce(null);

    await expect(
      service.updateSystemRoles(ADMIN_ID, TARGET_ID, [UserRole.PLAYER]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
