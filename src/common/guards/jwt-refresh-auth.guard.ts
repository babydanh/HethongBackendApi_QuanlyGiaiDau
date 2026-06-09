import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtRefreshAuthGuard extends AuthGuard('jwt-refresh') {
  handleRequest(err, user) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired refresh token');
    }
    return user;
  }
}
