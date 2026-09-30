import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { LiveScoreGateway } from './live-score.gateway';

const MATCH_ID = 'match-1';
const ROOM = `match:${MATCH_ID}`;

type ViewerCountPayload = { matchId: string; viewerCount: number };

const createClient = (
  id: string,
  subject: string | undefined,
  rooms: Map<string, Set<string>>,
  sockets: Map<string, Socket>,
): Socket => {
  const client = {
    id,
    connected: true,
    data: subject ? { user: { sub: subject } } : {},
    handshake: { auth: {}, headers: {}, query: {} },
    join: jest.fn((room: string) => {
      const members = rooms.get(room) ?? new Set<string>();
      members.add(id);
      rooms.set(room, members);
    }),
    leave: jest.fn((room: string) => {
      rooms.get(room)?.delete(id);
    }),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };

  const socket = client as unknown as Socket;
  sockets.set(id, socket);
  return socket;
};

const readViewerPayloads = (emit: jest.Mock): ViewerCountPayload[] =>
  emit.mock.calls
    .filter(([event]) => event === 'viewer:count')
    .map(([, payload]) => JSON.parse(payload as string) as ViewerCountPayload);

describe('LiveScoreGateway viewer count', () => {
  let gateway: LiveScoreGateway;
  let rooms: Map<string, Set<string>>;
  let sockets: Map<string, Socket>;
  let roomEmit: jest.Mock;
  let volatileEmit: jest.Mock;

  beforeEach(() => {
    rooms = new Map();
    sockets = new Map();
    roomEmit = jest.fn();
    volatileEmit = jest.fn();
    const repository = {
      canAccessLiveMatch: jest.fn().mockResolvedValue(true),
      canAccessLiveTournament: jest.fn(),
    };
    gateway = new LiveScoreGateway(
      repository as never,
      { verify: jest.fn() } as unknown as JwtService,
    );
    gateway.server = {
      sockets: { adapter: { rooms }, sockets },
      to: jest.fn(() => ({ emit: roomEmit })),
      volatile: { to: jest.fn(() => ({ emit: volatileEmit })) },
    } as unknown as Server;
  });

  afterEach(() => {
    gateway.onApplicationShutdown();
  });

  it('counts each verified account once and anonymous sockets independently', async () => {
    const clients = [
      createClient('socket-1', 'user-1', rooms, sockets),
      createClient('socket-2', 'user-1', rooms, sockets),
      createClient('socket-3', 'user-2', rooms, sockets),
      createClient('socket-4', undefined, rooms, sockets),
      createClient('socket-5', undefined, rooms, sockets),
    ];

    for (const client of clients) {
      await gateway.handleJoinMatch(MATCH_ID, client);
    }

    const payloads = readViewerPayloads(roomEmit);
    expect(payloads).toEqual([
      { matchId: MATCH_ID, viewerCount: 1 },
      { matchId: MATCH_ID, viewerCount: 1 },
      { matchId: MATCH_ID, viewerCount: 2 },
      { matchId: MATCH_ID, viewerCount: 3 },
      { matchId: MATCH_ID, viewerCount: 4 },
    ]);
    expect(
      payloads.every(
        (payload) => Object.keys(payload).sort().join(',') === 'matchId,viewerCount',
      ),
    ).toBe(true);
    expect(JSON.stringify(payloads)).not.toContain('user-1');
  });

  it('uses the same deduplicated count for periodic reconciliation', async () => {
    await gateway.handleJoinMatch(
      MATCH_ID,
      createClient('socket-1', 'user-1', rooms, sockets),
    );
    await gateway.handleJoinMatch(
      MATCH_ID,
      createClient('socket-2', 'user-1', rooms, sockets),
    );
    await gateway.handleJoinMatch(
      MATCH_ID,
      createClient('socket-3', 'user-2', rooms, sockets),
    );
    roomEmit.mockClear();

    const broadcastAllViewerCounts = Reflect.get(gateway, 'broadcastAllViewerCounts') as () => void;
    broadcastAllViewerCounts.call(gateway);

    expect(readViewerPayloads(roomEmit)).toEqual([
      { matchId: MATCH_ID, viewerCount: 2 },
    ]);
  });

  it('removes departed sockets while retaining a same-account socket until it leaves', async () => {
    const firstSocket = createClient('socket-1', 'user-1', rooms, sockets);
    const remainingSocket = createClient('socket-2', 'user-1', rooms, sockets);
    await gateway.handleJoinMatch(MATCH_ID, firstSocket);
    await gateway.handleJoinMatch(MATCH_ID, remainingSocket);

    gateway.handleLeaveMatch(MATCH_ID, firstSocket);
    const flushViewerCounts = Reflect.get(gateway, 'flushViewerCounts') as () => void;
    flushViewerCounts.call(gateway);
    expect(readViewerPayloads(volatileEmit)).toEqual([
      { matchId: MATCH_ID, viewerCount: 1 },
    ]);

    rooms.get(ROOM)?.delete('socket-2');
    remainingSocket.connected = false;
    gateway.handleDisconnect(remainingSocket);
    volatileEmit.mockClear();
    flushViewerCounts.call(gateway);
    expect(readViewerPayloads(volatileEmit)).toEqual([
      { matchId: MATCH_ID, viewerCount: 0 },
    ]);
  });
});
