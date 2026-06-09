import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { OAuthProfileDto } from '../dto/oauth-profile.dto';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    super({
      clientID:
        configService.get<string>('auth.googleClientId') || 'MISSING_CLIENT_ID',
      clientSecret:
        configService.get<string>('auth.googleClientSecret') ||
        'MISSING_SECRET',
      callbackURL:
        configService.get<string>('auth.googleCallbackUrl') ||
        'http://localhost:3000/api/v1/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const oauthProfile: OAuthProfileDto = {
      provider: 'GOOGLE',
      providerUserId: profile.id,
      email: profile.emails?.[0]?.value,
      displayName: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value,
      accessToken,
      refreshToken,
    };
    done(null, oauthProfile);
  }
}
