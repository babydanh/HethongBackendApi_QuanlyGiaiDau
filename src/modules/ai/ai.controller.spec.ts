import 'reflect-metadata';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '../../common/constants/enums';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { VerifiedGuard } from '../../common/guards/verified.guard';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { TournamentsService } from '../tournaments/tournaments.service';

const PARSE_PATH = '/api/v1/ai/parse-tournament-source';
const INSTRUCTION = 'Tạo giải cầu lông cho CLB Minh Đức, khai mạc 14/03/2026 tại Đồng Nai';

const PARSED_DRAFT = {
  name: 'Giải Cầu Lông Đồng Nai 2026',
  sport: 'badminton',
  formats: [
    {
      name: 'Đôi Nam',
      formatKey: 'DOUBLES_MALE',
      bracketType: 'SINGLE_ELIMINATION',
      maxParticipants: 32,
    },
  ],
  registrationFormFields: [],
};

interface AuthenticatedUser {
  sub: string;
  email: string;
  roles: string[];
  isEmailVerified: boolean;
}

function verifiedUser(role: UserRole): AuthenticatedUser {
  return {
    sub: 'organizer-1',
    email: 'organizer@example.test',
    roles: [role],
    isEmailVerified: true,
  };
}

function bearerHeader(user: AuthenticatedUser): [string, string] {
  return ['Authorization', `Bearer ${Buffer.from(JSON.stringify(user)).toString('base64url')}`];
}

/**
 * Stands in for `JwtAuthGuard`: it reproduces the guard's one contract-relevant behaviour
 * of honouring `@Public()` and otherwise requiring an authenticated principal. The role and
 * verification decisions below are made by the real `RolesGuard`/`VerifiedGuard`.
 */
class BearerAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const httpRequest = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();

    if (isPublic) return true;

    const token = httpRequest.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException();

    try {
      httpRequest.user = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }
}

/** Mirrors the drizzle query chain `RolesGuard` runs to confirm a still-assigned role. */
function createRoleLookup(assignedRoles: string[]) {
  const limit = jest
    .fn()
    .mockResolvedValue(assignedRoles.map((roleName) => ({ roleName })));
  const where = jest.fn().mockReturnValue({ limit });
  const innerJoinRoles = jest.fn().mockReturnValue({ where });
  const innerJoinUsers = jest.fn().mockReturnValue({ innerJoin: innerJoinRoles });
  const from = jest.fn().mockReturnValue({ innerJoin: innerJoinUsers });
  return { select: jest.fn().mockReturnValue({ from }) };
}

describe('AiController POST /ai/parse-tournament-source', () => {
  let app: INestApplication;
  let parseTournamentSource: jest.Mock;
  let roleLookup: { select: jest.Mock };

  beforeEach(async () => {
    parseTournamentSource = jest.fn().mockResolvedValue(PARSED_DRAFT);
    roleLookup = createRoleLookup([UserRole.ORGANIZER, UserRole.ADMIN]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: AiService, useValue: { parseTournamentSource } },
        { provide: TournamentsService, useValue: {} },
      ],
    }).compile();

    const reflector = new Reflector();
    const config = {
      get: jest.fn((key: string) => (key === 'NODE_ENV' ? 'test' : undefined)),
    } as unknown as ConfigService;

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalGuards(
      new BearerAuthGuard(reflector),
      new RolesGuard(reflector, roleLookup as never),
      new VerifiedGuard(reflector, config),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('refuses an anonymous parse before the parser can fetch or call the provider', async () => {
    const response = await request(app.getHttpServer())
      .post(PARSE_PATH)
      .send({ instruction: INSTRUCTION });

    expect(response.status).toBe(401);
    expect(parseTournamentSource).not.toHaveBeenCalled();
  });

  it('refuses a verified player before the parser can fetch or call the provider', async () => {
    const response = await request(app.getHttpServer())
      .post(PARSE_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.PLAYER)))
      .send({ instruction: INSTRUCTION });

    expect(response.status).toBe(403);
    expect(parseTournamentSource).not.toHaveBeenCalled();
  });

  it('refuses an organizer whose email is not verified before the parser can fetch or call the provider', async () => {
    const response = await request(app.getHttpServer())
      .post(PARSE_PATH)
      .set(
        ...bearerHeader({
          ...verifiedUser(UserRole.ORGANIZER),
          isEmailVerified: false,
        }),
      )
      .send({ instruction: INSTRUCTION });

    expect(response.status).toBe(403);
    expect(parseTournamentSource).not.toHaveBeenCalled();
  });

  it('returns the parsed draft in the existing success envelope for a verified organizer', async () => {
    const response = await request(app.getHttpServer())
      .post(PARSE_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)))
      .send({ instruction: INSTRUCTION, sportHint: 'badminton' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: PARSED_DRAFT });
    expect(parseTournamentSource).toHaveBeenCalledTimes(1);
  });

  it('allows a verified administrator to run the same prompt-only parse', async () => {
    const response = await request(app.getHttpServer())
      .post(PARSE_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ADMIN)))
      .send({ instruction: INSTRUCTION });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: PARSED_DRAFT });
    expect(parseTournamentSource).toHaveBeenCalledTimes(1);
  });

  it('accepts a refinement body carrying an instruction and a schema-valid currentDraft', async () => {
    const response = await request(app.getHttpServer())
      .post(PARSE_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)))
      .send({ instruction: 'Rút gọn mô tả', currentDraft: PARSED_DRAFT });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: PARSED_DRAFT });
    expect(parseTournamentSource).toHaveBeenCalledTimes(1);
  });

  it('rejects a refinement body whose currentDraft is not an object', async () => {
    const response = await request(app.getHttpServer())
      .post(PARSE_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)))
      .send({ instruction: 'Rút gọn mô tả', currentDraft: 'ban-nhap sai kieu' });

    expect(response.status).toBe(400);
    expect(parseTournamentSource).not.toHaveBeenCalled();
  });

  it('rejects a body without an instruction without invoking the parser', async () => {
    const response = await request(app.getHttpServer())
      .post(PARSE_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)))
      .send({ sportHint: 'badminton' });

    expect(response.status).toBe(400);
    expect(parseTournamentSource).not.toHaveBeenCalled();
  });

  it('rejects an empty instruction without invoking the parser', async () => {
    const response = await request(app.getHttpServer())
      .post(PARSE_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)))
      .send({ instruction: '' });

    expect(response.status).toBe(400);
    expect(parseTournamentSource).not.toHaveBeenCalled();
  });

  it('rejects an instruction beyond the documented character budget without invoking the parser', async () => {
    const response = await request(app.getHttpServer())
      .post(PARSE_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)))
      .send({ instruction: 'a'.repeat(4001) });

    expect(response.status).toBe(400);
    expect(parseTournamentSource).not.toHaveBeenCalled();
  });

  it('rejects an unknown body property without invoking the parser', async () => {
    const response = await request(app.getHttpServer())
      .post(PARSE_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)))
      .send({ instruction: INSTRUCTION, uploadFileBase64: 'UEsDBA==' });

    expect(response.status).toBe(400);
    expect(parseTournamentSource).not.toHaveBeenCalled();
  });
});

const TOURNAMENT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const ROSTER_LAYOUT_PATH = `/api/v1/ai/tournaments/${TOURNAMENT_ID}/roster-layout`;
const ROSTER_BODY = {
  sheets: [
    {
      name: 'Danh sách thi',
      rowCount: 40,
      columnCount: 6,
      rows: [{ r: 3, cells: ['Cặp đấu', 'VĐV 1', 'Email VĐV 1', 'SĐT VĐV 1', 'VĐV 2', 'Email VĐV 2'] }],
    },
  ],
  locale: 'vi',
};
const ROSTER_LAYOUT_UNAVAILABLE = { data: null, aiAvailable: false };

describe('AiController POST /ai/tournaments/:tournamentId/roster-layout', () => {
  let app: INestApplication;
  let analyzeRosterLayout: jest.Mock;
  let assertTournamentManager: jest.Mock;

  beforeEach(async () => {
    analyzeRosterLayout = jest.fn().mockResolvedValue(ROSTER_LAYOUT_UNAVAILABLE);
    assertTournamentManager = jest.fn().mockResolvedValue(undefined);
    const roleLookup = createRoleLookup([UserRole.ORGANIZER, UserRole.ADMIN, UserRole.PLAYER]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: AiService, useValue: { analyzeRosterLayout } },
        { provide: TournamentsService, useValue: { assertTournamentManager } },
      ],
    }).compile();

    const reflector = new Reflector();
    const config = {
      get: jest.fn((key: string) => (key === 'NODE_ENV' ? 'test' : undefined)),
    } as unknown as ConfigService;

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    // Production wraps every answer in this interceptor; without it the spec would assert a shape no client ever sees.
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalGuards(
      new BearerAuthGuard(reflector),
      new RolesGuard(reflector, roleLookup as never),
      new VerifiedGuard(reflector, config),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('refuses an anonymous request before the service is asked', async () => {
    const response = await request(app.getHttpServer()).post(ROSTER_LAYOUT_PATH).send(ROSTER_BODY);

    expect(response.status).toBe(401);
    expect(analyzeRosterLayout).not.toHaveBeenCalled();
  });

  it('refuses a verified player before the service is asked', async () => {
    const response = await request(app.getHttpServer())
      .post(ROSTER_LAYOUT_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.PLAYER)))
      .send(ROSTER_BODY);

    expect(response.status).toBe(403);
    expect(assertTournamentManager).not.toHaveBeenCalled();
    expect(analyzeRosterLayout).not.toHaveBeenCalled();
  });

  it('refuses an organizer whose email is not verified before the service is asked', async () => {
    const response = await request(app.getHttpServer())
      .post(ROSTER_LAYOUT_PATH)
      .set(...bearerHeader({ ...verifiedUser(UserRole.ORGANIZER), isEmailVerified: false }))
      .send(ROSTER_BODY);

    expect(response.status).toBe(403);
    expect(analyzeRosterLayout).not.toHaveBeenCalled();
  });

  it('refuses an organizer who does not manage this tournament before the service is asked', async () => {
    assertTournamentManager.mockRejectedValueOnce(new ForbiddenException());

    const response = await request(app.getHttpServer())
      .post(ROSTER_LAYOUT_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)))
      .send(ROSTER_BODY);

    expect(response.status).toBe(403);
    expect(assertTournamentManager).toHaveBeenCalledWith(TOURNAMENT_ID, 'organizer-1', [UserRole.ORGANIZER]);
    expect(analyzeRosterLayout).not.toHaveBeenCalled();
  });

  it('rejects a body without sheets before the service is asked', async () => {
    const response = await request(app.getHttpServer())
      .post(ROSTER_LAYOUT_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)))
      .send({ locale: 'vi' });

    expect(response.status).toBe(400);
    expect(analyzeRosterLayout).not.toHaveBeenCalled();
  });

  it('rejects an unsupported locale before the service is asked', async () => {
    const response = await request(app.getHttpServer())
      .post(ROSTER_LAYOUT_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)))
      .send({ ...ROSTER_BODY, locale: 'fr' });

    expect(response.status).toBe(400);
    expect(analyzeRosterLayout).not.toHaveBeenCalled();
  });

  it('rejects an unknown body property before the service is asked', async () => {
    const response = await request(app.getHttpServer())
      .post(ROSTER_LAYOUT_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)))
      .send({ ...ROSTER_BODY, rawSheet: 'không được phép' });

    expect(response.status).toBe(400);
    expect(analyzeRosterLayout).not.toHaveBeenCalled();
  });

  it('rejects a tournament id that is not a UUID before the service is asked', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/ai/tournaments/not-a-uuid/roster-layout')
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)))
      .send(ROSTER_BODY);

    expect(response.status).toBe(400);
    expect(assertTournamentManager).not.toHaveBeenCalled();
    expect(analyzeRosterLayout).not.toHaveBeenCalled();
  });

  it('answers the service envelope for a manager and passes the validated body through', async () => {
    const response = await request(app.getHttpServer())
      .post(ROSTER_LAYOUT_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)))
      .send(ROSTER_BODY);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ statusCode: 200, message: 'Success', data: { aiAvailable: false, layout: null } });
    expect(assertTournamentManager).toHaveBeenCalledWith(TOURNAMENT_ID, 'organizer-1', [UserRole.ORGANIZER]);
    expect(analyzeRosterLayout).toHaveBeenCalledWith(TOURNAMENT_ID, expect.objectContaining({ locale: 'vi' }));
  });

  it('keeps aiAvailable and the layout on the wire when the model answered', async () => {
    const layout = { sheets: [], notes: ['đã đọc xong'] };
    analyzeRosterLayout.mockResolvedValueOnce({ data: layout, aiAvailable: true });

    const response = await request(app.getHttpServer())
      .post(ROSTER_LAYOUT_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)))
      .send(ROSTER_BODY);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ statusCode: 200, message: 'Success', data: { aiAvailable: true, layout } });
  });
});

describe('AiController POST /ai/tournaments/:tournamentId/roster-review (deprecated alias)', () => {
  let app: INestApplication;
  let analyzeRosterLayout: jest.Mock;
  let assertTournamentManager: jest.Mock;
  const ALIAS_PATH = `/api/v1/ai/tournaments/${TOURNAMENT_ID}/roster-review`;

  beforeEach(async () => {
    analyzeRosterLayout = jest.fn();
    assertTournamentManager = jest.fn().mockResolvedValue(undefined);
    const roleLookup = createRoleLookup([UserRole.ORGANIZER, UserRole.ADMIN, UserRole.PLAYER]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: AiService, useValue: { analyzeRosterLayout } },
        { provide: TournamentsService, useValue: { assertTournamentManager } },
      ],
    }).compile();

    const reflector = new Reflector();
    const config = {
      get: jest.fn((key: string) => (key === 'NODE_ENV' ? 'test' : undefined)),
    } as unknown as ConfigService;

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalGuards(
      new BearerAuthGuard(reflector),
      new RolesGuard(reflector, roleLookup as never),
      new VerifiedGuard(reflector, config),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers the unavailable envelope for a manager with an opaque body, without the layout service', async () => {
    const response = await request(app.getHttpServer())
      .post(ALIAS_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)))
      .send({ opaque: 'alias does not read the body' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ statusCode: 200, message: 'Success', data: null });
    expect(assertTournamentManager).toHaveBeenCalledWith(TOURNAMENT_ID, 'organizer-1', [UserRole.ORGANIZER]);
    expect(analyzeRosterLayout).not.toHaveBeenCalled();
  });

  it('answers the same envelope when the request has no body', async () => {
    const response = await request(app.getHttpServer())
      .post(ALIAS_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ statusCode: 200, message: 'Success', data: null });
  });

  it('refuses a verified player by role before the manager check runs', async () => {
    const response = await request(app.getHttpServer())
      .post(ALIAS_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.PLAYER)))
      .send({ opaque: 'alias does not read the body' });

    expect(response.status).toBe(403);
    expect(assertTournamentManager).not.toHaveBeenCalled();
    expect(response.body).not.toHaveProperty('aiAvailable');
    expect(analyzeRosterLayout).not.toHaveBeenCalled();
  });

  it('refuses an organizer when the manager check rejects, and does not answer the envelope', async () => {
    assertTournamentManager.mockRejectedValueOnce(new ForbiddenException('not a manager of this tournament'));

    const response = await request(app.getHttpServer())
      .post(ALIAS_PATH)
      .set(...bearerHeader(verifiedUser(UserRole.ORGANIZER)))
      .send({ opaque: 'alias does not read the body' });

    expect(response.status).toBe(403);
    expect(response.body).not.toHaveProperty('aiAvailable');
    expect(analyzeRosterLayout).not.toHaveBeenCalled();
  });
});