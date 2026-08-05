import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as jwt from 'jsonwebtoken';

/** Keeps authenticated users isolated from each other behind a shared proxy IP. */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const type = context.getType();
    if (type === 'ws') return true;
    const req = context.switchToHttp().getRequest();
    if (req?.url?.includes('/socket.io/')) return true;
    return super.shouldSkip(context);
  }

  protected getTracker(req: Record<string, any>): Promise<string> {
    const authenticatedUserId = req.user?.sub || req.user?.id;
    if (authenticatedUserId) return Promise.resolve(`user:${authenticatedUserId}`);

    const authorization = req.headers?.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      const payload = jwt.decode(authorization.slice(7)) as { sub?: string; id?: string } | null;
      const tokenUserId = payload?.sub || payload?.id;
      if (tokenUserId) return Promise.resolve(`user:${tokenUserId}`);
    }

    const forwardedFor = req.headers?.['x-forwarded-for'];
    const clientIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0].trim()
        : req.ip || req.socket?.remoteAddress || 'unknown';
    return Promise.resolve(`ip:${clientIp}`);
  }
}
