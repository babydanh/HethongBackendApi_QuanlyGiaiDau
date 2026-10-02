import 'reflect-metadata';
import {
  CanActivate,
  ExecutionContext,
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
      providers: [{ provide: AiService, useValue: { parseTournamentSource } }],
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