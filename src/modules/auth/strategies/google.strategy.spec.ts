import { ConfigService } from '@nestjs/config';
import type { Profile } from 'passport-google-oauth20';
import { GoogleStrategy } from './google.strategy';

describe('GoogleStrategy', () => {
  const config = {
    get: jest.fn((key: string) => ({
      'auth.googleClientId': 'google-client-id',
      'auth.googleClientSecret': 'google-client-secret',
      'auth.googleCallbackUrl': 'https://sporto.asia/api/v1/auth/google/callback',
    }[key])),
  } as unknown as ConfigService;

  it('returns one OAuth profile for Nest Passport to submit once', () => {
    const strategy = new GoogleStrategy(config);
    const profile = {
      id: 'google-user-id',
      displayName: 'Google User',
      emails: [{ value: 'user@example.com' }],
      photos: [{ value: 'https://example.com/avatar.jpg' }],
    } as Profile;

    expect(strategy.validate('access-token', 'refresh-token', profile)).toEqual({
      provider: 'GOOGLE',
      providerUserId: 'google-user-id',
      email: 'user@example.com',
      displayName: 'Google User',
      avatarUrl: 'https://example.com/avatar.jpg',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
  });
});
