import {
  Injectable,
  Inject,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../constants/enums';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{
      user?: { id?: string; sub?: string; roles?: string[] };
    }>();

    if (!user || !Array.isArray(user.roles)) {
      throw new ForbiddenException('User roles not found');
    }

    const tokenRoles = user.roles;
    const matchedRoles = requiredRoles.filter((role) => tokenRoles.includes(role));
    if (matchedRoles.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }

    const userId = user.sub ?? user.id;
    if (!userId) {
      throw new ForbiddenException('User roles not found');
    }

    const activeRole = await this.db
      .select({ roleName: schema.roles.name })
      .from(schema.userToRoles)
      .innerJoin(schema.roles, eq(schema.userToRoles.roleId, schema.roles.id))
      .innerJoin(schema.users, eq(schema.userToRoles.userId, schema.users.id))
      .where(and(
        eq(schema.userToRoles.userId, userId),
        inArray(schema.roles.name, matchedRoles),
        isNull(schema.users.deletedAt),
        sql`not exists (
          select 1 from ${schema.userBans} active_ban
          where active_ban.user_id = ${schema.userToRoles.userId}
            and active_ban.is_active = true
            and active_ban.ban_type in ('SOFT_BAN', 'HARD_BAN')
            and (active_ban.expires_at is null or active_ban.expires_at > now())
        )`,
      ))
      .limit(1);
    if (activeRole.length === 0) {
      throw new ForbiddenException('Your role is no longer valid');
    }

    return true;
  }
}
