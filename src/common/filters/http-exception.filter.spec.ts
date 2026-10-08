import {
  BadRequestException,
  ConflictException,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter contract', () => {
  afterEach(() => jest.restoreAllMocks());

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

  it('logs the nested SQLSTATE without exposing database or request data', () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
        getRequest: () => ({
          method: 'GET',
          route: { path: '/api/v1/tournaments/home' },
          url: '/api/v1/tournaments/home?latitude=10.123&token=secret-token',
          headers: { authorization: 'Bearer secret-token' },
        }),
      }),
    } as unknown as ArgumentsHost;
    const cause = Object.assign(
      new Error('column reference "id" is ambiguous'),
      {
        code: '42702',
        query: 'select secret-query',
        params: ['secret-token', 10.123],
      },
    );
    const exception = new Error('Failed query: select secret-query', {
      cause: new Error('Database request failed', { cause }),
    });

    new HttpExceptionFilter().catch(exception, host);

    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0][0] as string)).toEqual({
      event: 'http_server_error',
      method: 'GET',
      route: '/api/v1/tournaments/home',
      statusCode: 500,
      errorType: 'Error',
      sqlState: '42702',
    });
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INTERNAL_SERVER_ERROR',
        details: null,
      }),
    );
    expect(JSON.stringify([log.mock.calls, json.mock.calls])).not.toMatch(
      /secret-token|secret-query|10\.123|ambiguous/,
    );
  });

  it('does not log ordinary validation errors', () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const status = jest.fn().mockReturnThis();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, json: jest.fn() }),
        getRequest: () => ({
          method: 'GET',
          route: { path: '/tournaments/home' },
        }),
      }),
    } as unknown as ArgumentsHost;
    new HttpExceptionFilter().catch(
      new BadRequestException('Invalid status'),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(log).not.toHaveBeenCalled();
  });

  it('handles cyclic causes without leaking unmatched request URLs', () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const exception = Object.assign(new Error('secret-query'), { cause: {} });
    exception.cause = exception;
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        }),
        getRequest: () => ({ method: 'GET', url: '/secret-token' }),
      }),
    } as unknown as ArgumentsHost;
    new HttpExceptionFilter().catch(exception, host);
    expect(JSON.parse(log.mock.calls[0][0] as string)).toEqual(
      expect.objectContaining({
        route: '<unmatched>',
        sqlState: null,
      }),
    );
  });
});
