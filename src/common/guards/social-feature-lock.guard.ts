import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * Social is intentionally locked while the replacement workflow is being built.
 * Keep this switch fail-closed: only an explicit "true" enables the feature.
 */
export function isSocialFeatureEnabled(): boolean {
  return process.env.SOCIAL_FEATURE_ENABLED?.trim().toLowerCase() === 'true';
}

export function assertSocialFeatureEnabled(): void {
  if (isSocialFeatureEnabled()) return;

  throw new ServiceUnavailableException({
    code: 'SOCIAL_FEATURE_LOCKED',
    message: 'Tính năng social đang tạm khóa để xây dựng lại logic.',
  });
}

@Injectable()
export class SocialFeatureLockGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    assertSocialFeatureEnabled();
    return true;
  }
}
