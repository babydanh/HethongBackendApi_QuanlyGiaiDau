import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

const extractRefreshToken = (request: Request): string | null => {
  if (!request) return null;
  
  // 1. Lấy từ Header 'x-refresh-token'
  const headerToken = request.headers['x-refresh-token'];
  if (headerToken && typeof headerToken === 'string') {
    return headerToken;
  }
  
  // 2. Lấy từ Request Body
  if (request.body && request.body.refreshToken) {
    return request.body.refreshToken;
  }
  
  // 3. Lấy từ Cookies
  return request.cookies?.refreshToken || null;
};

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => extractRefreshToken(request),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('auth.jwtRefreshSecret')!,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload): JwtPayload & { refreshToken: string } {
    const refreshToken = extractRefreshToken(req);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token malformed');
    }
    
    // Pass the refresh token along with the payload so the service can verify it against the DB
    return {
      ...payload,
      refreshToken,
    };
  }
}
