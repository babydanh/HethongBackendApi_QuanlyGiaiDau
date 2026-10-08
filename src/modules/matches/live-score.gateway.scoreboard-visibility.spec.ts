import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { LiveScoreGateway } from './live-score.gateway';

const MATCH_ID = 'match-1';
const ROOM = `match:${MATCH_ID}`;

type VisibilityPayload = {
  id: string;
  matchId: string;
  scoreboardVisible: boolean;
};

const readVisibilityPayloads = (emit: jest.Mock): VisibilityPayload[] =>
  emit.mock.calls
    .filter(([event]) => event === 'scoreboard:visibility')
    .map(([, payload]) => JSON.parse(payload as string) as VisibilityPayload);

describe('LiveScoreGateway scoreboard visibility', () => {
  let gateway: LiveScoreGateway;
  let roomEmit: jest.Mock;
  let tournamentEmit: jest.Mock;
  let to: jest.Mock;

  beforeEach(() => {
    roomEmit = jest.fn();
    tournamentEmit = jest.fn();
    to = jest.fn((room: string) =>
      room.startsWith('match:')
        ? { emit: roomEmit }
        : { emit: tournamentEmit },
    );
    gateway = new LiveScoreGateway(
      {} as never,
      { verify: jest.fn() } as unknown as JwtService,
    );
    gateway.server = {
      sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
      to,
      volatile: { to: jest.fn(() => ({ emit: jest.fn() })) },
    } as unknown as Server;
  });

  afterEach(() => {
    gateway.onApplicationShutdown();
  });

  it('broadcasts the flag to the match room only', () => {
    gateway.broadcastScoreboardVisibility(MATCH_ID, false);

    expect(to).toHaveBeenCalledWith(ROOM);
    expect(readVisibilityPayloads(roomEmit)).toEqual([
      { id: MATCH_ID, matchId: MATCH_ID, scoreboardVisible: false },
    ]);
    // Payload điều khiển sóng không được lọt sang phòng giải đấu: các tab giải
    // đấu đang nghe `match:update` và sẽ nhận dữ liệu thiếu trường điểm.
    expect(tournamentEmit).not.toHaveBeenCalled();
  });

  it('emits the flag unchanged when turning the scoreboard back on', () => {
    gateway.broadcastScoreboardVisibility(MATCH_ID, true);

    expect(readVisibilityPayloads(roomEmit)).toEqual([
      { id: MATCH_ID, matchId: MATCH_ID, scoreboardVisible: true },
    ]);
  });

  it('does nothing when the server is not attached yet', () => {
    gateway.server = undefined as unknown as Server;

    gateway.broadcastScoreboardVisibility(MATCH_ID, false);

    expect(roomEmit).not.toHaveBeenCalled();
  });
});
