import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AccountSanctionService } from '../services/account-sanction.service';

@Injectable()
export class AccountBanGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly accountSanctionService: AccountSanctionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{
      user?: { id?: string; sub?: string };
    }>();
    const userId = user?.sub ?? user?.id;
    if (!userId) {
      // JwtAuthGuard owns the authentication failure; avoid changing its
      // response contract if a different guard is used on a route.
      return true;
    }

    if (await this.accountSanctionService.hasActiveAccessBan(userId)) {
      throw new ForbiddenException('Tài khoản của bạn đang bị hạn chế truy cập.');
    }

    return true;
  }
}
