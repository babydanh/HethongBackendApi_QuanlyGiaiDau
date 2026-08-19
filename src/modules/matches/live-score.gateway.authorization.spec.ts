import { Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { MatchesRepository } from './matches.repository';
import { LiveScoreGateway } from './live-score.gateway';

const createClient = (token?: string, queryToken?: string) =>
  ({
    id: 'client-1',
    connected: true,
    data: {},
    handshake: {
      auth: token ? { token: `Bearer ${token}` } : {},
      headers: {},
      query: queryToken ? { token: queryToken } : {},
    },
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  }) as unknown as Socket;

describe('LiveScoreGateway room authorization', () => {
  let gateway: LiveScoreGateway;
  let repository: { canAccessLiveMatch: jest.Mock; canAccessLiveTournament: jest.Mock };
  let jwtService: { verify: jest.Mock };

  beforeEach(() => {
    repository = {
      canAccessLiveMatch: jest.fn(),
      canAccessLiveTournament: jest.fn(),
    };
    jwtService = { verify: jest.fn() };
    gateway = new LiveScoreGateway(
      repository as unknown as MatchesRepository,
      jwtService as unknown as JwtService,
    );
    gateway.server = {
      sockets: { adapter: { rooms: new Map() } },
      to: jest.fn(() => ({ emit: jest.fn() })),
    } as never;
  });

  afterEach(() => {
    gateway.onApplicationShutdown();
  });

  it('allows an anonymous client into a public match room', async () => {
    repository.canAccessLiveMatch.mockResolvedValue(true);
    const client = createClient();

    await expect(gateway.handleJoinMatch('match-1', client)).resolves.toEqual({
      event: 'joined',
      data: 'match:match-1',
    });
    expect(repository.canAccessLiveMatch).toHaveBeenCalledWith('match-1', undefined, []);
    expect(client.join).toHaveBeenCalledWith('match:match-1');
  });

  it('rejects a client that is not authorized for a private tournament room', async () => {
    repository.canAccessLiveTournament.mockResolvedValue(false);
    const client = createClient();

    await expect(gateway.handleJoinTournament('tournament-1', client)).rejects.toThrow(
      'Bạn không có quyền theo dõi giải đấu này',
    );
    expect(client.join).not.toHaveBeenCalled();
  });

  it('does not use query-string tokens for live authorization', () => {
    const client = createClient(undefined, 'query-token');

    gateway.handleConnection(client);

    expect(jwtService.verify).not.toHaveBeenCalled();
    expect(client.data.user).toBeUndefined();
  });

  it('passes verified JWT identity and roles to match authorization', async () => {
    jwtService.verify.mockReturnValue({
      sub: 'user-1',
      roles: ['ORGANIZER'],
      isEmailVerified: true,
    });
    repository.canAccessLiveMatch.mockResolvedValue(false);
    const client = createClient('signed-token');

    gateway.handleConnection(client);
    await expect(gateway.handleJoinMatch('match-1', client)).rejects.toThrow(
      'Bạn không có quyền xem trận đấu này',
    );
    expect(repository.canAccessLiveMatch).toHaveBeenCalledWith(
      'match-1',
      'user-1',
      ['ORGANIZER'],
    );
  });
});
