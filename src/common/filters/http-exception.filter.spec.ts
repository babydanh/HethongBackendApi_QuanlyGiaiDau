import { ConflictException, type ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter contract', () => {
  it('preserves stable domain code and structured extensions', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
        getRequest: () => ({ url: '/club-match-sessions/session-1/matches' }),
      }),
    } as unknown as ArgumentsHost;

    new HttpExceptionFilter().catch(
      new ConflictException({
        code: 'PAIRING_WARNINGS_REQUIRE_CONFIRMATION',
        warnings: [{ code: 'REPEATED_PAIRING', userIds: ['user-1'] }],
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        code: 'PAIRING_WARNINGS_REQUIRE_CONFIRMATION',
        warnings: [{ code: 'REPEATED_PAIRING', userIds: ['user-1'] }],
      }),
    );
  });
});
