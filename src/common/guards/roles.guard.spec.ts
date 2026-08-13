import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../constants/enums';
import { RolesGuard } from './roles.guard';

const user = { sub: '11111111-1111-4111-8111-111111111111', roles: [UserRole.ADMIN] };

function contextWithUser(userValue?: unknown): ExecutionContext {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => ({ user: userValue }) }),
  } as unknown as ExecutionContext;
}

function queryDb(result: unknown[]) {
  const limit = jest.fn().mockResolvedValue(result);
  const where = jest.fn().mockReturnValue({ limit });
  const innerJoinSecond = jest.fn().mockReturnValue({ where });
  const innerJoinFirst = jest.fn().mockReturnValue({ innerJoin: innerJoinSecond });
  const from = jest.fn().mockReturnValue({ innerJoin: innerJoinFirst });
  return { select: jest.fn().mockReturnValue({ from }), limit };
}

describe('RolesGuard stale privileged role protection', () => {
  it('allows routes without role metadata', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const db = queryDb([]);
    const guard = new RolesGuard(reflector, db as never);

    await expect(guard.canActivate(contextWithUser())).resolves.toBe(true);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects a request missing role claims', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]) } as unknown as Reflector;
    const guard = new RolesGuard(reflector, queryDb([]) as never);

    await expect(guard.canActivate(contextWithUser({ sub: user.sub }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not query DB when no token role matches', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([UserRole.MODERATOR]) } as unknown as Reflector;
    const db = queryDb([]);
    const guard = new RolesGuard(reflector, db as never);

    await expect(guard.canActivate(contextWithUser(user))).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('confirms a currently assigned organizer role in DB', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([UserRole.ORGANIZER, UserRole.ADMIN]) } as unknown as Reflector;
    const db = queryDb([{ roleName: UserRole.ORGANIZER }]);
    const guard = new RolesGuard(reflector, db as never);

    await expect(guard.canActivate(contextWithUser({ ...user, roles: [UserRole.ORGANIZER] }))).resolves.toBe(true);
    expect(db.select).toHaveBeenCalled();
  });

  it('allows a currently assigned privileged role', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]) } as unknown as Reflector;
    const guard = new RolesGuard(reflector, queryDb([{ roleName: UserRole.ADMIN }]) as never);

    await expect(guard.canActivate(contextWithUser(user))).resolves.toBe(true);
  });

  it('rejects a stale privileged role claim', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]) } as unknown as Reflector;
    const guard = new RolesGuard(reflector, queryDb([]) as never);

    await expect(guard.canActivate(contextWithUser(user))).rejects.toMatchObject({
      message: 'Your role is no longer valid',
    });
  });

  it.each([UserRole.ORGANIZER, UserRole.REFEREE])('rejects stale %s role claims', async (role) => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([role]) } as unknown as Reflector;
    const guard = new RolesGuard(reflector, queryDb([]) as never);

    await expect(guard.canActivate(contextWithUser({ ...user, roles: [role] }))).rejects.toMatchObject({
      message: 'Your role is no longer valid',
    });
  });

  it('includes active soft/hard-ban exclusion in privileged validation', () => {
    const source = readFileSync(join(__dirname, 'roles.guard.ts'), 'utf8');

    expect(source).toContain("active_ban.ban_type in ('SOFT_BAN', 'HARD_BAN')");
    expect(source).toContain('active_ban.expires_at > now()');
  });
});
