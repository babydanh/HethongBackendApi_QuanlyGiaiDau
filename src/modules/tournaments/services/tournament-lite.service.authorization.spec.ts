import { ForbiddenException } from '@nestjs/common';
import { TournamentAccessService } from './tournament-access.service';
import { TournamentLiteService } from './tournament-lite.service';

function buildService(membership: unknown) {
  const tournamentsRepository = {
    findById: jest.fn().mockResolvedValue({
      id: 'tournament-1',
      createdBy: 'creator-1',
      communityId: 'club-1',
      matchType: 'SINGLES',
      tournamentConfig: { isLite: true },
    }),
    getDivisionsByTournament: jest.fn().mockResolvedValue([]),
    isCoOrganizer: jest.fn().mockResolvedValue(false),
    findCommunityById: jest.fn().mockResolvedValue(null),
    findCommunityMember: jest.fn().mockResolvedValue(membership),
    findLiteParticipantsWithRosters: jest.fn().mockResolvedValue([]),
  };
  const access = new TournamentAccessService(tournamentsRepository as never);
  const service = new TournamentLiteService(
    tournamentsRepository as never,
    access,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return service;
}

describe('TournamentLiteService club manager authorization', () => {
  it('lets an active club OWNER read Lite participants', async () => {
    const service = buildService({ status: 'JOINED', role: 'OWNER' });

    await expect(
      service.getLiteParticipants('tournament-1', 'owner-1', ['PLAYER']),
    ).resolves.toEqual([]);
  });

  it('denies a banned club MODERATOR', async () => {
    const service = buildService({ status: 'BANNED', role: 'MODERATOR' });

    await expect(
      service.getLiteParticipants('tournament-1', 'mod-1', ['PLAYER']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a club OWNER whose membership is still PENDING', async () => {
    const service = buildService({ status: 'PENDING', role: 'OWNER' });

    await expect(
      service.getLiteParticipants('tournament-1', 'owner-1', ['PLAYER']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a former member whose membership row no longer exists', async () => {
    const service = buildService(null);

    await expect(
      service.getLiteParticipants('tournament-1', 'former-1', ['PLAYER']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies the creator of a club Lite tournament who has left the club', async () => {
    const service = buildService(null);

    await expect(
      service.getLiteParticipants('tournament-1', 'creator-1', ['PLAYER']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
