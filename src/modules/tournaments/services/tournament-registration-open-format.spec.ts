import { TournamentRegistrationService } from './tournament-registration.service';

function createHarness({
  matchType,
  genderRestriction,
  profileGender = null,
}: {
  matchType: string;
  genderRestriction: string | null;
  profileGender?: string | null;
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
    name: 'Open court',
    createdBy: 'user-1',
    status: 'REGISTRATION_OPEN',
    communityId: null,
    tournamentType: 'PUBLIC',
    matchType,
    genderRestriction,
    tournamentConfig: {},
    registrationStartDate: null,
    registrationEndDate: null,
    isRegistrationLocked: false,
    categoryId: 'category-1',
    maxParticipants: 8,
    entryFee: 0,
  };
  const repository = {
    findById: jest.fn().mockResolvedValue(tournament),
    findUserProfile: jest.fn().mockResolvedValue({
      fullName: 'Nguyen Van A',
      phoneNumber: '0900000000',
      gender: profileGender,
    }),
    findDivisionById: jest.fn().mockResolvedValue(division),
    getDivisionsByTournament: jest.fn().mockResolvedValue([division]),
    findParticipantById: jest.fn().mockResolvedValue({
      id: 'participant-1',
      registeredBy: 'user-1',
      tournamentDivisionId: division.id,
      rosterLockedAt: null,
    }),
    registerParticipant: jest.fn().mockResolvedValue({
      participant: {
        id: 'participant-1',
        tournamentDivisionId: division.id,
        teamStatus: 'WAITLISTED',
        isPaid: false,
      },
    }),
    joinTeam: jest.fn().mockResolvedValue({
      participant: {
        id: 'participant-1',
        tournamentDivisionId: division.id,
        teamStatus: 'WAITLISTED',
        isPaid: false,
      },
    }),
    getParticipantRosters: jest.fn().mockResolvedValue([]),
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

describe('open-format profile gender requirements', () => {
  it('allows open singles registration with an unset profile gender', async () => {
    const { service, repository } = createHarness({
      matchType: 'SINGLES',
      genderRestriction: null,
    });

    await expect(
      service.register(
        'tournament-1',
        'user-1',
        { tournamentDivisionId: 'division-1', teamName: 'Player One' },
        undefined,
        undefined,
        noSeed,
      ),
    ).resolves.toBeDefined();

    expect(repository.registerParticipant).toHaveBeenCalledTimes(1);
  });
  it('uses the sole active division before validating an ID-less open registration', async () => {
    const { service, repository } = createHarness({
      matchType: 'SINGLES',
      genderRestriction: null,
    });

    await expect(
      service.register(
        'tournament-1',
        'user-1',
        { teamName: 'Player One' },
        undefined,
        undefined,
        noSeed,
      ),
    ).resolves.toBeDefined();

    expect(repository.getDivisionsByTournament).toHaveBeenCalledWith(
      'tournament-1',
    );
    expect(repository.registerParticipant).toHaveBeenCalledTimes(1);
  });

  it('rejects ID-less registration when multiple active divisions exist', async () => {
    const { service, repository } = createHarness({
      matchType: 'SINGLES',
      genderRestriction: 'MALE',
    });
    repository.getDivisionsByTournament.mockResolvedValue([
      { id: 'division-1', status: 'ACTIVE' },
      { id: 'division-2', status: 'ACTIVE' },
    ]);

    await expect(
      service.register(
        'tournament-1',
        'user-1',
        { teamName: 'Player One' },
        undefined,
        undefined,
        noSeed,
      ),
    ).rejects.toThrow('Vui lòng chọn nội dung');

    expect(repository.findUserProfile).not.toHaveBeenCalled();
    expect(repository.registerParticipant).not.toHaveBeenCalled();
  });

  it('still requires a profile gender for restricted divisions', async () => {
    const { service, repository } = createHarness({
      matchType: 'SINGLES',
      genderRestriction: 'MALE',
    });

    await expect(
      service.register(
        'tournament-1',
        'user-1',
        { tournamentDivisionId: 'division-1', teamName: 'Player One' },
        undefined,
        undefined,
        noSeed,
      ),
    ).rejects.toThrow('giới tính');

    expect(repository.registerParticipant).not.toHaveBeenCalled();
  });

  it('keeps phone details required for open-format registrations', async () => {
    const { service, repository } = createHarness({
      matchType: 'DOUBLES',
      genderRestriction: null,
    });
    repository.findUserProfile.mockResolvedValue({
      fullName: 'Nguyen Van A',
      phoneNumber: null,
      gender: null,
    });

    await expect(
      service.register(
        'tournament-1',
        'user-1',
        { tournamentDivisionId: 'division-1', teamName: 'Player One' },
        undefined,
        undefined,
        noSeed,
      ),
    ).rejects.toThrow('số điện thoại');

    expect(repository.registerParticipant).not.toHaveBeenCalled();
  });

  it('allows joining an open doubles team with an unset profile gender', async () => {
    const { service, repository } = createHarness({
      matchType: 'DOUBLES',
      genderRestriction: null,
    });

    await expect(
      service.joinTeam(
        'tournament-1',
        'user-1',
        'participant-1',
        'invite-token',
      ),
    ).resolves.toBeDefined();

    expect(repository.joinTeam).toHaveBeenCalledTimes(1);
  });
});
