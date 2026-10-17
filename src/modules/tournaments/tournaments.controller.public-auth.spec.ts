import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { RedisService } from '../../providers/redis/redis.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { TournamentAccessService } from './services/tournament-access.service';
import { TournamentDiscoveryService } from './services/tournament-discovery.service';
import { TournamentsRepository } from './tournaments.repository';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';

const JWT_SECRET = 'test-access-secret';
const FORGED_SECRET = 'attacker-chosen-secret';
const TOURNAMENT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OWNER_ID = '6c9a1f0e-2b7d-4c1a-9e3f-7a1b2c3d4e5f';
const ADMIN_ID = '8d2e4f6a-1b3c-4d5e-8f70-9a1b2c3d4e6f';
const PLAYER_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const INVITE_CODE = 'invite-secret';

type Visibility = 'PUBLIC' | 'PRIVATE';

const tournamentWith = (visibility: Visibility) => ({
  id: TOURNAMENT_ID,
  createdBy: OWNER_ID,
  status: 'PUBLISHED',
  visibility,
  tournamentType: 'PUBLIC',
  inviteCode: INVITE_CODE,
  tournamentConfig: {},
});

let tournament = tournamentWith('PRIVATE');

const repository = {
  findById: jest.fn(),
  findParticipantById: jest.fn(),
  findCommunityMember: jest.fn(),
  isUserParticipant: jest.fn(),
};
const access = { isManager: jest.fn() };

// Real discovery rules; only persistence and access lookups are stubbed.
const discovery = new TournamentDiscoveryService(
  repository as unknown as TournamentsRepository,
  null as unknown as RedisService,
  access as unknown as TournamentAccessService,
);

const claims = (sub: string, roles: string[]) => ({
  sub,
  email: `${sub}@test.local`,
  roles,
  isEmailVerified: true,
  isMock: false,
});

type Transport = 'bearer' | 'cookie';

describe('TC-PUBJWT GET /api/v1/tournaments/:id (route @Public)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: JWT_SECRET })],
      controllers: [TournamentsController],
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'auth.jwtAccessSecret' ? JWT_SECRET : undefined,
          },
        },
        {
          provide: TournamentsService,
          useValue: {
            findOne: (
              ...args: Parameters<TournamentDiscoveryService['findOne']>
            ) => discovery.findOne(...args),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tournament = tournamentWith('PRIVATE');
    repository.findById.mockImplementation(async () => tournament);
    repository.findParticipantById.mockResolvedValue(null);
    repository.findCommunityMember.mockResolvedValue(null);
    repository.isUserParticipant.mockResolvedValue(false);
    access.isManager.mockResolvedValue(false);
  });

  const fetchTournament = (token?: string, transport: Transport = 'bearer') => {
    const req = request(app.getHttpServer()).get(
      `/api/v1/tournaments/${TOURNAMENT_ID}`,
    );
    if (!token) return req;
    return transport === 'cookie'
      ? req.set('Cookie', `accessToken=${token}`)
      : req.set('Authorization', `Bearer ${token}`);
  };

  const forgedAdminToken = () =>
    new JwtService({ secret: FORGED_SECRET }).signAsync(
      claims(ADMIN_ID, ['ADMIN']),
    );

  it.each<Transport>(['bearer', 'cookie'])(
    'TC-PUBJWT-01 giải PRIVATE: JWT ký sai secret mang roles ADMIN (%s) bị coi như khách → 403',
    async (transport) => {
      const forged = await forgedAdminToken();

      const res = await fetchTournament(forged, transport);

      expect(res.status).toBe(403);
      expect(res.body.inviteCode).toBeUndefined();
    },
  );

  it.each<Transport>(['bearer', 'cookie'])(
    'TC-PUBJWT-02 giải PRIVATE: JWT ADMIN đúng chữ ký nhưng đã hết hạn (%s) → 403',
    async (transport) => {
      const expired = await jwt.signAsync({
        ...claims(ADMIN_ID, ['ADMIN']),
        exp: Math.floor(Date.now() / 1000) - 60,
      });

      const res = await fetchTournament(expired, transport);

      expect(res.status).toBe(403);
    },
  );

  it.each<Transport>(['bearer', 'cookie'])(
    'TC-PUBJWT-03 giải PRIVATE: JWT ADMIN đúng secret còn hạn (%s) → 200',
    async (transport) => {
      const valid = await jwt.signAsync(claims(ADMIN_ID, ['ADMIN']));

      const res = await fetchTournament(valid, transport);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(TOURNAMENT_ID);
    },
  );

  it('TC-PUBJWT-04 giải PRIVATE: không có token → 403', async () => {
    const res = await fetchTournament();

    expect(res.status).toBe(403);
  });

  it('TC-PUBJWT-05 giải PRIVATE: JWT đúng của người chơi không liên quan (roles PLAYER) → 403', async () => {
    const player = await jwt.signAsync(claims(PLAYER_ID, ['PLAYER']));

    const res = await fetchTournament(player);

    expect(res.status).toBe(403);
  });

  it('TC-PUBJWT-06 giải PRIVATE: owner với JWT đúng → 200 và thấy mã mời', async () => {
    const owner = await jwt.signAsync(claims(OWNER_ID, ['ORGANIZER']));

    const res = await fetchTournament(owner);

    expect(res.status).toBe(200);
    expect(res.body.inviteCode).toBe(INVITE_CODE);
  });

  it('TC-PUBJWT-07 giải PUBLIC: không có token → 200', async () => {
    tournament = tournamentWith('PUBLIC');

    const res = await fetchTournament();

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TOURNAMENT_ID);
  });

  it('TC-PUBJWT-08 giải PUBLIC: JWT ký sai secret mang roles ADMIN → 200 nhưng không lộ mã mời', async () => {
    tournament = tournamentWith('PUBLIC');
    const forged = await forgedAdminToken();

    const res = await fetchTournament(forged);

    expect(res.status).toBe(200);
    expect(res.body.inviteCode ?? null).toBeNull();
  });
});
