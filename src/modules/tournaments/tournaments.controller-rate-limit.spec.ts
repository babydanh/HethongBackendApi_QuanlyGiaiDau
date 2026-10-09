import 'reflect-metadata';
import { HttpException, RequestMethod, type ExecutionContext } from '@nestjs/common';
import {
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test, type TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { UserAwareThrottlerGuard } from '../../common/guards/user-aware-throttler.guard';
import { TournamentsController } from './tournaments.controller';

describe('TournamentsController Add Athlete search route', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: 'default', ttl: 60000, limit: 50000 },
        ]),
      ],
      providers: [UserAwareThrottlerGuard],
    }).compile();
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('declares a private POST search route', () => {
    const handler = TournamentsController.prototype.searchAddAthleteCandidates;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':id/add-athletes/search',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('rejects the 21st request for one authenticated organizer in the 60-second window', async () => {
    const guard = moduleRef.get(UserAwareThrottlerGuard);
    const handler = TournamentsController.prototype.searchAddAthleteCandidates;
    const response = { header: jest.fn() };
    const request = {
      url: '/tournaments/tournament-1/add-athletes/search',
      user: { sub: 'organizer-1' },
      headers: {},
      ip: '127.0.0.1',
    };
    const context = {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => TournamentsController,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;

    for (let requestNumber = 0; requestNumber < 20; requestNumber += 1) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }

    const error = await guard.canActivate(context).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(response.header).toHaveBeenCalledWith(
      'Retry-After',
      expect.any(Number),
    );
  });
});
