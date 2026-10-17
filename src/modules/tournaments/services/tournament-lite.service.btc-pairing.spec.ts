import { TournamentLiteService } from './tournament-lite.service';
import { validateSync } from 'class-validator';
import { GenerateLitePairsDto } from '../dto/generate-lite-pairs.dto';

function buildService() {
  const tournamentsRepository = {
    findById: jest.fn().mockResolvedValue({
      id: 'tournament-1',
      communityId: 'club-1',
      isRanked: true,
      matchType: 'SINGLES',
      tournamentConfig: { isLite: true },
    }),
    getDivisionsByTournament: jest.fn().mockResolvedValue([]),
    findCommunityMember: jest
      .fn()
      .mockResolvedValue({ role: 'PLAYER', status: 'JOINED' }),
    findUserProfile: jest.fn().mockResolvedValue({ fullName: 'Nữ CLB' }),
    generateLitePairsTx: jest.fn().mockResolvedValue({
      paired: [],
      unpairedParticipantIds: [],
    }),
  };
  const tournamentAccessService = {
    isManager: jest.fn().mockResolvedValue(true),
  };
  const service = new TournamentLiteService(
    tournamentsRepository as never,
    tournamentAccessService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, tournamentsRepository };
}

describe('TournamentLiteService BTC club add (TC-BTCPAIR-12)', () => {
  it('TC-BTCPAIR-12 passes the organizer flag through the club member callback', async () => {
    const { service } = buildService();
    const registerParticipant = jest.fn().mockResolvedValue({ id: 'p-1' });

    await service.addLiteClubMember(
      'tournament-1',
      'member-1',
      'organizer-1',
      registerParticipant,
    );

    expect(registerParticipant).toHaveBeenCalledWith(
      'tournament-1',
      'member-1',
      expect.objectContaining({ teamName: 'Nữ CLB' }),
      undefined,
      'organizer-1',
      { organizerAdded: true },
    );
  });
});

describe('GenerateLitePairsDto divisionId (TC-BTCPAIR-09)', () => {
  it('TC-BTCPAIR-09 accepts an omitted or UUID divisionId and rejects other values', () => {
    const cases: Array<[unknown, number]> = [
      [undefined, 0],
      ['4d5f9a2e-8c1b-4e7a-9f3e-2b6c7d8e9f01', 0],
      ['not-a-uuid', 1],
    ];
    for (const [divisionId, errorCount] of cases) {
      const dto = Object.assign(new GenerateLitePairsDto(), {
        strategy: 'RANDOM',
        divisionId,
      });
      expect(validateSync(dto)).toHaveLength(errorCount);
    }
  });

  it('TC-BTCPAIR-09 service forwards the dto divisionId to the pairing transaction', async () => {
    const { service, tournamentsRepository } = buildService();
    tournamentsRepository.findById.mockResolvedValue({
      id: 'tournament-1',
      matchType: 'DOUBLES',
      tournamentConfig: { isLite: true },
    });

    await service.generateLitePairs('tournament-1', 'organizer-1', ['ADMIN'], {
      strategy: 'RANDOM',
      divisionId: 'division-1',
    });

    expect(tournamentsRepository.generateLitePairsTx).toHaveBeenCalledWith(
      'tournament-1',
      'organizer-1',
      'RANDOM',
      'division-1',
    );
  });
});
