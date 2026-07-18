import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-facebook';
import { OAuthProfileDto } from '../dto/oauth-profile.dto';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(private configService: ConfigService) {
    super({
      clientID:
        configService.get<string>('auth.facebookAppId') || 'MISSING_CLIENT_ID',
      clientSecret:
        configService.get<string>('auth.facebookAppSecret') ||
        'MISSING_SECRET',
      callbackURL:
        configService.get<string>('auth.facebookCallbackUrl') ||
        'http://localhost:3000/api/v1/auth/facebook/callback',
      profileFields: ['id', 'emails', 'name', 'photos'],
      scope: ['email'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (err: any, user?: any, info?: any) => void,
  ): void {
    const oauthProfile: OAuthProfileDto = {
      provider: 'FACEBOOK',
      providerUserId: profile.id,
      email: profile.emails?.[0]?.value,
      displayName: `${profile.name?.familyName || ''} ${profile.name?.givenName || ''}`.trim() || profile.displayName,
      avatarUrl: profile.photos?.[0]?.value,
      accessToken,
      refreshToken,
    };
    done(null, oauthProfile);
  }
}
