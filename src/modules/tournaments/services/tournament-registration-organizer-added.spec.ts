import { BadRequestException } from '@nestjs/common';
import { TournamentRegistrationService } from './tournament-registration.service';

function createHarness({
  gender,
  matchType = 'SINGLES',
  genderRestriction = 'MALE',
}: {
  gender: 'MALE' | 'FEMALE' | null;
  matchType?: string;
  genderRestriction?: string | null;
}) {
  const division = {
    id: 'division-1',
    matchType,
    genderRestriction,
    minElo: null,
    maxElo: null,
  };
  const tournament = {
    id: 'tournament-1',
    name: 'Giải CLB',
    createdBy: 'organizer-1',
    status: 'REGISTRATION_OPEN',
    communityId: 'community-1',
    tournamentType: 'CLUB',
    matchType,
    genderRestriction: null,
    tournamentConfig: { isLite: true, mode: 'LITE' },
    registrationStartDate: null,
    registrationEndDate: null,
    isRegistrationLocked: false,
    categoryId: 'category-1',
    maxParticipants: 8,
    entryFee: 0,
  };
  const repository = {
    findById: jest.fn().mockResolvedValue(tournament),
    findCommunityMember: jest.fn().mockResolvedValue({ status: 'JOINED' }),
    findUserProfile: jest.fn().mockResolvedValue({
      fullName: 'Nguyen Thi B',
      phoneNumber: '0900000000',
      gender,
    }),
    findDivisionById: jest.fn().mockResolvedValue(division),
    getDivisionsByTournament: jest.fn().mockResolvedValue([division]),
    registerParticipant: jest.fn().mockResolvedValue({
      participant: {
        id: 'participant-1',
        tournamentDivisionId: division.id,
        teamStatus: 'WAITLISTED',
        isPaid: false,
      },
    }),
  };
  const realtime = { broadcastRegistrationChanged: jest.fn() };
  const notifications = { sendNotification: jest.fn() };
  const service = new TournamentRegistrationService(
    repository as never,
    {} as never,
    notifications as never,
    realtime as never,
  );

  return { service, repository };
}

const noSeed = async () => undefined;
const registerDto = {
  tournamentDivisionId: 'division-1',
  teamName: 'Nguyen Thi B',
};

describe('organizer-added club member gender check', () => {
  it('TC-BTCPAIR-12: organizer-added female club member bypasses a male-only division restriction', async () => {
    const { service, repository } = createHarness({ gender: 'FEMALE' });

    await expect(
      service.register(
        'tournament-1',
        'member-1',
        registerDto,
        undefined,
        'organizer-1',
        noSeed,
        { organizerAdded: true },
      ),
    ).resolves.toBeDefined();

    expect(repository.registerParticipant).toHaveBeenCalledTimes(1);
  });

  it('TC-BTCPAIR-13: self-registered female is still rejected by a male-only division', async () => {
    const { service, repository } = createHarness({ gender: 'FEMALE' });

    await expect(
      service.register(
        'tournament-1',
        'member-1',
        registerDto,
        undefined,
        undefined,
        noSeed,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.register(
        'tournament-1',
        'member-1',
        registerDto,
        undefined,
        undefined,
        noSeed,
      ),
    ).rejects.toThrow('Division này chỉ dành cho Nam.');

    expect(repository.registerParticipant).not.toHaveBeenCalled();
  });

  it('TC-BTCPAIR-13: an explicit organizerAdded false keeps the gender check', async () => {
    const { service, repository } = createHarness({ gender: 'FEMALE' });

    await expect(
      service.register(
        'tournament-1',
        'member-1',
        registerDto,
        undefined,
        'organizer-1',
        noSeed,
        { organizerAdded: false },
      ),
    ).rejects.toThrow('Division này chỉ dành cho Nam.');

    expect(repository.registerParticipant).not.toHaveBeenCalled();
  });

  it('TC-BTCPAIR-01b: organizer-added doubles club member with one athlete is forwarded as organizer-added', async () => {
    const { service, repository } = createHarness({
      gender: 'MALE',
      matchType: 'DOUBLES',
      genderRestriction: null,
    });

    await service.register(
      'tournament-1',
      'member-1',
      registerDto,
      undefined,
      'organizer-1',
      noSeed,
      { organizerAdded: true },
    );

    expect(repository.registerParticipant).toHaveBeenCalledWith(
      'tournament-1',
      'member-1',
      expect.objectContaining({ tournamentDivisionId: 'division-1' }),
      undefined,
      { organizerAdded: true },
    );
  });
});
