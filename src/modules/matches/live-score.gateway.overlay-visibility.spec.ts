import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';
import { LiveScoreGateway } from './live-score.gateway';

const MATCH_ID = 'match-1';
const ROOM = `match:${MATCH_ID}`;

type OverlayPayload = {
  id: string;
  matchId: string;
  h2hOverlayVisible: boolean;
  bracketOverlayVisible: boolean;
};

const readOverlayPayloads = (emit: jest.Mock): OverlayPayload[] =>
  emit.mock.calls
    .filter(([event]) => event === 'overlay:visibility')
    .map(([, payload]) => JSON.parse(payload as string) as OverlayPayload);

describe('LiveScoreGateway overlay visibility', () => {
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

  it('sends the full H2H state to the match room only', () => {
    gateway.broadcastOverlayVisibility(MATCH_ID, {
      h2hOverlayVisible: true,
      bracketOverlayVisible: false,
    });

    expect(to).toHaveBeenCalledWith(ROOM);
    expect(readOverlayPayloads(roomEmit)).toEqual([
      {
        id: MATCH_ID,
        matchId: MATCH_ID,
        h2hOverlayVisible: true,
        bracketOverlayVisible: false,
      },
    ]);
    // Không lọt sang phòng giải đấu: các tab đang nghe `match:update` không được nhận payload điều khiển.
    expect(tournamentEmit).not.toHaveBeenCalled();
  });

  it('sends the BRACKET state with H2H explicitly false', () => {
    gateway.broadcastOverlayVisibility(MATCH_ID, {
      h2hOverlayVisible: false,
      bracketOverlayVisible: true,
    });

    expect(readOverlayPayloads(roomEmit)).toEqual([
      {
        id: MATCH_ID,
        matchId: MATCH_ID,
        h2hOverlayVisible: false,
        bracketOverlayVisible: true,
      },
    ]);
  });

  it('does nothing when the server is not attached yet', () => {
    gateway.server = undefined as unknown as Server;

    gateway.broadcastOverlayVisibility(MATCH_ID, {
      h2hOverlayVisible: false,
      bracketOverlayVisible: false,
    });

    expect(roomEmit).not.toHaveBeenCalled();
  });
});
