import type { ConfigService } from '@nestjs/config';
import { LivestreamService } from './livestream.service';

const COURT_URL = 'https://media.aqvision.net/live/camera_court/hls.m3u8';

type MatchStatus = 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
type StreamStatus = 'IDLE' | 'LIVE' | 'OFFLINE';

function makeService(matchStatus: MatchStatus, streamStatus: StreamStatus | null) {
  const repository = {
    findMatchWithTournament: jest.fn().mockResolvedValue({
      id: 'match-1',
      courtId: 'court-1',
      tournamentId: 'tournament-1',
      tournamentVisibility: 'PUBLIC',
      tournamentStatus: 'ONGOING',
      status: matchStatus,
    }),
    // The court's own camera: the same one the match row points at, so it is NOT a manual override.
    findActiveCameraByCourt: jest.fn().mockResolvedValue({
      id: 'camera-court',
      name: 'Camera san 1',
      playbackUrl: COURT_URL,
    }),
    findMatchLivestream: jest.fn().mockResolvedValue(
      streamStatus
        ? {
            cameraId: 'camera-court',
            cameraName: 'Camera san 1',
            streamStatus,
            playbackUrl: COURT_URL,
            startedAt: null,
            endedAt: null,
          }
        : null,
    ),
  };
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => fallback),
  } as unknown as ConfigService;
  const Ctor = LivestreamService as unknown as {
    new (...args: unknown[]): LivestreamService;
  };
  const service = new Ctor(repository, configService, {}, {}, {}, {}, {});
  return { service, repository };
}

describe('LivestreamService.getMatchPlayback on the court camera path', () => {
  it('a finished match whose stream the organiser started again shows the live video', async () => {
    const { service } = makeService('COMPLETED', 'LIVE');

    await expect(service.getMatchPlayback('match-1')).resolves.toMatchObject({
      matchId: 'match-1',
      streamStatus: 'LIVE',
      playbackUrl: COURT_URL,
      cameraName: 'Camera san 1',
    });
  });

  it('a finished match that was merely scheduled on a court has no live video', async () => {
    const { service } = makeService('COMPLETED', 'IDLE');

    await expect(service.getMatchPlayback('match-1')).resolves.toMatchObject({
      streamStatus: 'OFFLINE',
      playbackUrl: null,
    });
  });

  it('a match that has not begun shows the live video once the organiser pressed Start', async () => {
    const { service } = makeService('SCHEDULED', 'LIVE');

    await expect(service.getMatchPlayback('match-1')).resolves.toMatchObject({
      streamStatus: 'LIVE',
      playbackUrl: COURT_URL,
    });
  });

  it('a match that has not begun and was only scheduled on a court has no live video', async () => {
    const { service } = makeService('SCHEDULED', 'IDLE');

    await expect(service.getMatchPlayback('match-1')).resolves.toMatchObject({
      playbackUrl: null,
    });
  });

  it('a cancelled match has no live video even when its stream row says LIVE', async () => {
    const { service } = makeService('CANCELLED', 'LIVE');

    await expect(service.getMatchPlayback('match-1')).resolves.toMatchObject({
      playbackUrl: null,
    });
  });

  it('Stop wins on a finished match: an OFFLINE stream hides the video', async () => {
    const { service } = makeService('COMPLETED', 'OFFLINE');

    await expect(service.getMatchPlayback('match-1')).resolves.toMatchObject({
      playbackUrl: null,
    });
  });

  it('a finished match with no stream row has no live video', async () => {
    const { service } = makeService('COMPLETED', null);

    await expect(service.getMatchPlayback('match-1')).resolves.toMatchObject({
      playbackUrl: null,
    });
  });

  it('an ongoing match keeps showing the court camera, and Stop still hides it', async () => {
    const live = makeService('ONGOING', 'IDLE');
    await expect(live.service.getMatchPlayback('match-1')).resolves.toMatchObject({
      streamStatus: 'LIVE',
      playbackUrl: COURT_URL,
    });

    const stopped = makeService('ONGOING', 'OFFLINE');
    await expect(stopped.service.getMatchPlayback('match-1')).resolves.toMatchObject({
      playbackUrl: null,
    });
  });
});
