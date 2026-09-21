import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (relativePath: string) =>
  readFileSync(resolve(__dirname, '../../', relativePath), 'utf8');

describe('social feature lock scope', () => {
  it('keeps the generic personal social API locked', () => {
    expect(source('modules/social/social.controller.ts')).toContain(
      'SocialFeatureLockGuard',
    );
  });

  it('does not register the removed standalone pickup feature', () => {
    expect(source('app.module.ts')).not.toContain('SocialPickupsModule');
    expect(source('database/schema/index.ts')).not.toContain(
      'social-pickups.schema',
    );
    expect(
      existsSync(resolve(__dirname, '../../modules/social-pickups')),
    ).toBe(false);
  });

  it('keeps club/community social visible while the replacement is developed', () => {
    expect(source('modules/communities/community-social.controller.ts')).not.toContain(
      'SocialFeatureLockGuard',
    );
    expect(source('modules/communities/communities.controller.ts')).not.toContain(
      'assertSocialFeatureEnabled',
    );
    expect(source('modules/communities/communities.controller.ts')).not.toContain(
      'isSocialFeatureEnabled',
    );
  });

  it('does not suppress club/tournament community announcements', () => {
    for (const relativePath of [
      'modules/club-match-sessions/club-match-sessions.repository.ts',
      'modules/club-match-sessions/club-match-session-scheduler.service.ts',
      'modules/tournaments/tournament-scheduler.service.ts',
    ]) {
      expect(source(relativePath)).not.toContain('isSocialFeatureEnabled');
    }
  });
});
