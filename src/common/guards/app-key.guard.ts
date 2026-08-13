import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { SKIP_APP_KEY } from '../decorators/skip-app-key.decorator';

@Injectable()
export class AppKeyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skipAppKey = this.reflector.getAllAndOverride<boolean>(SKIP_APP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipAppKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    
    // Only apply for /api/ routes
    if (!request.path.startsWith('/api/')) {
      return true;
    }

    // Always bypass OPTIONS request for CORS preflight
    if (request.method === 'OPTIONS') {
      return true;
    }

    const expectedKey = this.configService.get<string>('APP_API_KEY');
    if (!expectedKey) {
      // If no key configured, we allow it (or we could deny, but safer to allow in dev)
      return true;
    }

    const providedKey = request.headers['x-app-key'] as string;
    if (!providedKey || providedKey !== expectedKey) {
      throw new ForbiddenException('Unauthorized Application (Invalid App Key)');
    }

    return true;
  }
}
