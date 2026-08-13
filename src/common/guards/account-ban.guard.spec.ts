import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountBanGuard } from './account-ban.guard';
import { AccountSanctionService } from '../services/account-sanction.service';

const userId = '11111111-1111-4111-8111-111111111111';

function contextWithUser(user?: { sub?: string }): ExecutionContext {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('AccountBanGuard', () => {
  it('does not check public routes', async () => {
    const sanctions = { hasActiveAccessBan: jest.fn() } as unknown as AccountSanctionService;
    const guard = new AccountBanGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(true) } as unknown as Reflector,
      sanctions,
    );

    await expect(guard.canActivate(contextWithUser())).resolves.toBe(true);
    expect(sanctions.hasActiveAccessBan).not.toHaveBeenCalled();
  });

  it('rejects a protected request with an active access ban', async () => {
    const sanctions = { hasActiveAccessBan: jest.fn().mockResolvedValue(true) } as unknown as AccountSanctionService;
    const guard = new AccountBanGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector,
      sanctions,
    );

    await expect(guard.canActivate(contextWithUser({ sub: userId }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a protected request when no access-denying sanction is active', async () => {
    const sanctions = { hasActiveAccessBan: jest.fn().mockResolvedValue(false) } as unknown as AccountSanctionService;
    const guard = new AccountBanGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector,
      sanctions,
    );

    await expect(guard.canActivate(contextWithUser({ sub: userId }))).resolves.toBe(true);
  });
});
