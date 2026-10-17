import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AqvisionAgencyApiClient } from './aqvision-agency-api.client';
import type { AqvisionApiClient } from './aqvision-api.client';
import type { AqvisionPublishService } from './aqvision-publish.service';
import type { AqvisionRecordingService } from './aqvision-recording.service';
import type { LivestreamCameraSourceCryptoService } from './livestream-camera-source-crypto.service';
import type { LivestreamHealthQueue } from './livestream-health.queue';
import type { LivestreamRepository } from './livestream.repository';
import { LivestreamService } from './livestream.service';

const creator: JwtPayload = {
  sub: 'creator-1',
  email: 'creator@example.com',
  role: 'USER',
  roles: [],
};

const tournamentId = '11111111-1111-4111-8111-111111111111';

function makeService(membership: { status: string; role: string } | null) {
  const repository = {
    findTournamentById: jest.fn().mockResolvedValue({
      id: tournamentId,
      createdBy: creator.sub,
      communityId: 'club-1',
    }),
    findCommunityMember: jest.fn().mockResolvedValue(membership),
    isTournamentStaff: jest.fn().mockResolvedValue(false),
    listCameras: jest.fn().mockResolvedValue([]),
  };
  const service = new LivestreamService(
    repository as unknown as LivestreamRepository,
    { get: () => undefined } as unknown as ConfigService,
    {} as AqvisionPublishService,
    {} as AqvisionApiClient,
    {} as unknown as AqvisionRecordingService,
    {} as unknown as LivestreamHealthQueue,
    {} as LivestreamCameraSourceCryptoService,
    {} as AqvisionAgencyApiClient,
  );
  return { repository, service };
}

describe('LivestreamService creator membership (giải CLB)', () => {
  it('denies the club tournament creator who has left the club', async () => {
    const { repository, service } = makeService(null);

    await expect(
      service.listCameras(tournamentId, creator),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.listCameras).not.toHaveBeenCalled();
  });

  it('allows the club tournament creator who is still an active member', async () => {
    const { repository, service } = makeService({
      status: 'JOINED',
      role: 'MEMBER',
    });

    await expect(service.listCameras(tournamentId, creator)).resolves.toEqual(
      [],
    );
    expect(repository.listCameras).toHaveBeenCalledWith(tournamentId);
  });
});
