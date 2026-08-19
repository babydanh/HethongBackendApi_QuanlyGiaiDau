import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VERIFIED_KEY } from '../decorators/verified.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class VerifiedGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isVerifiedRoute = this.reflector.getAllAndOverride<boolean>(
      VERIFIED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!isVerifiedRoute) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    // If route is @Public(), no user object — skip
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    if (!user) {
      throw new ForbiddenException('Email verification is required');
    }

    // Mock/test accounts intentionally bypass email verification.
    if (user.isMock) {
      return true;
    }

    if (user.isEmailVerified !== true) {
      throw new ForbiddenException('Email verification is required');
    }

    return true;
  }
}
