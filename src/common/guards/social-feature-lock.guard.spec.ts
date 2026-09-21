import { ServiceUnavailableException } from '@nestjs/common';
import {
  isSocialFeatureEnabled,
  SocialFeatureLockGuard,
} from './social-feature-lock.guard';

describe('SocialFeatureLockGuard', () => {
  const originalValue = process.env.SOCIAL_FEATURE_ENABLED;

  afterEach(() => {
    if (originalValue === undefined) delete process.env.SOCIAL_FEATURE_ENABLED;
    else process.env.SOCIAL_FEATURE_ENABLED = originalValue;
  });

  it('fails closed when the switch is missing', () => {
    delete process.env.SOCIAL_FEATURE_ENABLED;
    const guard = new SocialFeatureLockGuard();

    expect(isSocialFeatureEnabled()).toBe(false);
    expect(() => guard.canActivate({} as never)).toThrow(ServiceUnavailableException);
  });

  it('keeps social available only for an explicit true value', () => {
    process.env.SOCIAL_FEATURE_ENABLED = 'true';
    const guard = new SocialFeatureLockGuard();

    expect(isSocialFeatureEnabled()).toBe(true);
    expect(guard.canActivate({} as never)).toBe(true);
  });

  it('does not enable social for arbitrary values', () => {
    process.env.SOCIAL_FEATURE_ENABLED = '1';

    expect(isSocialFeatureEnabled()).toBe(false);
  });
});
