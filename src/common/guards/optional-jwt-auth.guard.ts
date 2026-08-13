import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Resolves request.user when a valid JWT is present, while still allowing
 * anonymous access to genuinely public endpoints.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(_err: unknown, user: TUser | false | null) {
    return user || undefined;
  }
}
