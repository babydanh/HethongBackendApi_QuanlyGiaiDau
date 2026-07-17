import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request) => {
          return request?.cookies?.accessToken;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('auth.jwtAccessSecret')!,
    });
  }

  validate(payload: {
    sub: string;
    email: string;
    roles: string[];
    isEmailVerified?: boolean;
    isMock?: boolean;
  }) {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException();
    }
    return {
      id: payload.sub,
      sub: payload.sub,
      email: payload.email,
      roles: payload.roles,
      isEmailVerified: payload.isEmailVerified,
      isMock: payload.isMock,
    };
  }
}
