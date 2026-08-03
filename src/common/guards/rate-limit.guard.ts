import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private store = new Map<string, RateLimitEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests = 10, windowMs = 60000, forceLimit = false) {
    // Always use high limit for non-production environments unless forceLimit is true
    const env = (process.env.NODE_ENV || 'development').toLowerCase();
    this.maxRequests = (env === 'production' || forceLimit) ? maxRequests : 100000;
    this.windowMs = windowMs;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const authenticatedUserId = request.user?.sub || request.user?.id;
    const clientAddress = (request.ip || request.ips?.[0]) || 'unknown';
    const key = authenticatedUserId
      ? `user:${authenticatedUserId}`
      : `ip:${clientAddress}`;
    const now = Date.now();

    const entry = this.store.get(key);
    if (!entry || now > entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      response.setHeader('X-RateLimit-Limit', this.maxRequests.toString());
      response.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - 1).toString());
      return true;
    }

    if (entry.count >= this.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      response.setHeader('Retry-After', retryAfterSeconds.toString());
      response.setHeader('X-RateLimit-Limit', this.maxRequests.toString());
      response.setHeader('X-RateLimit-Remaining', '0');
      throw new HttpException(
        'Bạn thao tác quá nhanh. Vui lòng đợi một chút rồi thử lại.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count++;
    response.setHeader('X-RateLimit-Limit', this.maxRequests.toString());
    response.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - entry.count).toString());
    return true;
  }
}
