import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';
import * as jwt from 'jsonwebtoken';

/** Keeps authenticated users isolated from each other behind a shared proxy IP. */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(UserAwareThrottlerGuard.name);

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

    const forwardedFor = req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'];
    const clientIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0].trim()
        : req.ip || req.socket?.remoteAddress || 'unknown';

    // Browsers and the mobile app persist this opaque id per installation.
    // Keep the IP in the key as a coarse abuse boundary while preventing
    // unrelated guests on the same NAT/Wi-Fi from sharing one bucket.
    const rawClientId = req.headers?.['x-client-id'];
    const clientId = Array.isArray(rawClientId) ? rawClientId[0] : rawClientId;
    if (typeof clientId === 'string' && /^[a-zA-Z0-9._:-]{8,128}$/.test(clientId)) {
      return Promise.resolve(`ip:${clientIp}:client:${clientId}`);
    }

    return Promise.resolve(`ip:${clientIp}`);
  }

  /**
   * Make the cooldown actionable for web/app clients. Nest's default
   * throttler only emits Retry-After when a block duration is configured;
   * production clients otherwise receive a bare 429 and retry blindly.
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const response = context.switchToHttp().getResponse();
    const retryAfter = Math.max(
      1,
      Math.ceil((detail.timeToBlockExpire || detail.timeToExpire || 1000) / 1000),
    );
    if (typeof response?.header === 'function') {
      response.header('Retry-After', retryAfter);
    } else if (typeof response?.setHeader === 'function') {
      response.setHeader('Retry-After', String(retryAfter));
    }

    this.logger.warn(
      `Rate limit exceeded: ${context.getClass().name}.${context.getHandler().name} (${detail.tracker.startsWith('user:') ? 'user' : 'ip'}) retry=${retryAfter}s`,
    );
    await super.throwThrottlingException(context, detail);
  }
}
