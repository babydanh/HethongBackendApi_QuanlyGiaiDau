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
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AppKeyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const skipAppKey = this.reflector.getAllAndOverride<boolean>(SKIP_APP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic || skipAppKey) {
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
      // If no key configured, allow all
      return true;
    }

    const providedKey = request.headers['x-app-key'] as string;
    if (providedKey && providedKey === expectedKey) {
      return true;
    }

    // Allow requests originating from official Web domain (sporto.asia, www.sporto.asia, localhost, etc.)
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://sporto.asia';
    const origin = (request.headers['origin'] as string) || '';
    const referer = (request.headers['referer'] as string) || '';
    const host = (request.headers['host'] as string) || '';

    const isAllowedDomain = (urlStr: string) => {
      if (!urlStr) return false;
      return (
        urlStr.includes('sporto.asia') ||
        urlStr.includes('localhost') ||
        urlStr.includes('127.0.0.1') ||
        urlStr.startsWith(frontendUrl)
      );
    };

    if (
      isAllowedDomain(origin) ||
      isAllowedDomain(referer) ||
      isAllowedDomain(host)
    ) {
      return true;
    }

    throw new ForbiddenException('Unauthorized Application (Invalid App Key)');
  }
}
