import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Double Submit Cookie CSRF Guard
 *
 * Bảo vệ các state-changing requests (POST/PUT/PATCH/DELETE)
 * bằng cách so khớp csrf-token trong cookie với header X-CSRF-Token.
 *
 * Cơ chế:
 * - Server set cookie `csrf-token` (non-httpOnly) khi login
 * - Frontend đọc cookie → gửi lên header `X-CSRF-Token`
 * - Guard so sánh: cookie === header
 *
 * Bỏ qua (skip) cho:
 * - Các route @Public() (login, register, webhook, ...)
 * - Các safe methods: GET, HEAD, OPTIONS
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 0. Skip nếu đang ở môi trường development local
    if (process.env.NODE_ENV === 'development') {
      return true;
    }

    // 1. Skip nếu route được đánh dấu @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // 2. Skip cho safe methods (GET, HEAD, OPTIONS)
    const method = request.method?.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return true;
    }

    // 3. Skip nếu request sử dụng Bearer Token (Mobile app / API client)
    // Vì CSRF chỉ áp dụng cho Cookie-based Auth
    const authHeader = request.headers?.['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
      return true;
    }

    // 4. Kiểm tra Double Submit Cookie cho Cookie Auth
    const csrfCookie = request.cookies?.['csrf-token'];
    const csrfHeader = request.headers?.['x-csrf-token'];

    if (!csrfCookie || !csrfHeader) {
      throw new ForbiddenException('Missing CSRF token');
    }

    if (csrfCookie !== csrfHeader) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }
}
