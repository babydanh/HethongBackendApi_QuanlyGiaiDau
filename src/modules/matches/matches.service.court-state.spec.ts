import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MatchesService } from './matches.service';

describe('MatchesService court state', () => {
  const repository = {
    findById: jest.fn(),
    isTournamentManager: jest.fn(),
    isRefereeAccepted: jest.fn(),
    canAccessLiveMatch: jest.fn(),
    updateCourtState: jest.fn(),
    updateScore: jest.fn(),
  };
  const gateway = { broadcastScoreUpdate: jest.fn() };
  const redis = {
    del: jest.fn(),
    delByPattern: jest.fn(),
    hset: jest.fn(),
    getClient: jest.fn(() => ({ expire: jest.fn() })),
  };
  const service = new MatchesService(
    repository as never,
    gateway as never,
    {} as never,
    {} as never,
    redis as never,
  );

  const referee = { sub: 'referee-1', roles: ['REFEREE'] } as never;
  const outsider = { sub: 'outsider-1', roles: ['PLAYER'] } as never;

  const storedSets = [{ team1Score: 11, team2Score: 7, isFinished: true }];
  const storedCourtState = {
    version: 1,
    startingRight: { team1: 0, team2: 1 },
    endsOverride: null,
    autoSwitchEnds: true,
    midSetSwitchDone: false,
    serverOverride: null,
    turnStart: null,
    history: [],
    updatedAt: '2026-10-14T10:00:00.000Z',
    updatedBy: 'referee-1',
  };

  const pickleballMatch = (overrides: Record<string, unknown> = {}) => ({
    id: 'match-1',
    tournamentId: 'tournament-1',
    status: 'ONGOING',
    refereeId: 'referee-1',
    participant1Id: 'p1',
    participant2Id: 'p2',
    p1SetsWon: 1,
    p2SetsWon: 0,
    revision: 4,
    scoreDetails: { sets: storedSets, courtState: storedCourtState },
    tournament: {
      id: 'tournament-1',
      createdBy: 'owner-1',
      sportRules: { kind: 'PICKLEBALL_RALLY' },
    },
    ...overrides,
  });

  const courtStateInput = (overrides: Record<string, unknown> = {}) => ({
    version: 1,
    startingRight: { team1: 1, team2: 0 },
    endsOverride: true,
    autoSwitchEnds: false,
    midSetSwitchDone: true,
    serverOverride: { team: 2, playerIndex: 1 },
    turnStart: {
      team: 2,
      serverNumber: 1,
      teamScoreAtStart: 4,
      serverPlayerIndex: 0,
    },
    history: [],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findById.mockResolvedValue(pickleballMatch());
    repository.isTournamentManager.mockResolvedValue(false);
    repository.isRefereeAccepted.mockResolvedValue(false);
    repository.canAccessLiveMatch.mockResolvedValue(false);
    // Repo trả về bản đã ghi: scoreDetails của DB, giữ sets cũ và courtState mới.
    repository.updateCourtState.mockImplementation(
      (_id: string, courtState: unknown) =>
        Promise.resolve({
          ...pickleballMatch(),
          scoreDetails: { sets: storedSets, courtState },
        }),
    );
    repository.updateScore.mockResolvedValue(pickleballMatch());
  });

  describe('updateCourtState', () => {
    it('passes only the normalized courtState to the repository and never score fields', async () => {
      await service.updateCourtState('match-1', referee, {
        courtState: courtStateInput(),
      });

      expect(repository.updateCourtState).toHaveBeenCalledTimes(1);
      const [matchId, courtState] = repository.updateCourtState.mock.calls[0];
      expect(matchId).toBe('match-1');
      expect(courtState).toEqual(
        expect.objectContaining({
          startingRight: { team1: 1, team2: 0 },
          endsOverride: true,
          updatedBy: 'referee-1',
          updatedAt: expect.any(String),
          history: [],
        }),
      );
      expect(courtState).not.toHaveProperty('sets');
      expect(repository.updateScore).not.toHaveBeenCalled();
    });

    it('broadcasts the updated match and drops the live cache copy', async () => {
      await service.updateCourtState('match-1', referee, {
        courtState: courtStateInput(),
      });

      expect(gateway.broadcastScoreUpdate).toHaveBeenCalledWith(
        'match-1',
        expect.objectContaining({ id: 'match-1', tournamentId: 'tournament-1' }),
        'tournament-1',
      );
      expect(redis.del).toHaveBeenCalledWith('match:live:match-1');
    });

    it('caps history at the newest 20 snapshots before writing', async () => {
      const history = Array.from({ length: 22 }, (_, index) => ({
        version: 1,
        startingRight: { team1: 1, team2: 0 },
        endsOverride: null,
        autoSwitchEnds: true,
        midSetSwitchDone: false,
        serverOverride: null,
        turnStart: {
          team: 1,
          serverNumber: 1,
          teamScoreAtStart: index,
          serverPlayerIndex: 0,
        },
      }));

      await service.updateCourtState('match-1', referee, {
        courtState: courtStateInput({ history }),
      });

      const [, courtState] = repository.updateCourtState.mock.calls[0];
      expect(courtState.history).toHaveLength(20);
      expect(courtState.history[0].turnStart.teamScoreAtStart).toBe(2);
    });

    it('rejects users without score access with 403 and never writes', async () => {
      repository.findById.mockResolvedValue(
        pickleballMatch({ refereeId: 'other-referee' }),
      );

      await expect(
        service.updateCourtState('match-1', outsider, {
          courtState: courtStateInput(),
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.updateCourtState).not.toHaveBeenCalled();
    });

    it('rejects a COMPLETED match with 400 and never writes', async () => {
      repository.findById.mockResolvedValue(
        pickleballMatch({ status: 'COMPLETED' }),
      );

      await expect(
        service.updateCourtState('match-1', referee, {
          courtState: courtStateInput(),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.updateCourtState).not.toHaveBeenCalled();
    });

    it('rejects a non-pickleball match with 400 and never writes', async () => {
      repository.findById.mockResolvedValue(
        pickleballMatch({
          tournament: {
            id: 'tournament-1',
            createdBy: 'owner-1',
            sportRules: { kind: 'BADMINTON' },
          },
        }),
      );

      await expect(
        service.updateCourtState('match-1', referee, {
          courtState: courtStateInput(),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.updateCourtState).not.toHaveBeenCalled();
    });

    it('rejects a schema-invalid courtState with 400 and never writes', async () => {
      await expect(
        service.updateCourtState('match-1', referee, {
          courtState: courtStateInput({ version: 2 }),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.updateCourtState).not.toHaveBeenCalled();
    });

    it('throws 404 when the match does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.updateCourtState('missing', referee, {
          courtState: courtStateInput(),
        }),
      ).rejects.toThrow(NotFoundException);
      expect(repository.updateCourtState).not.toHaveBeenCalled();
    });
  });

  describe('updateScore live cache', () => {
    it('caches the scoreDetails the DB returned, so the live cache keeps courtState', async () => {
      await service.updateScore('match-1', referee, {
        p1SetsWon: 1,
        p2SetsWon: 0,
        scoreDetails: {
          sets: [{ team1Score: 11, team2Score: 5, isFinished: true }],
        },
      });

      expect(redis.hset).toHaveBeenCalledWith(
        'match:live:match-1',
        'scoreDetails',
        JSON.stringify({ sets: storedSets, courtState: storedCourtState }),
      );
    });
  });
});
