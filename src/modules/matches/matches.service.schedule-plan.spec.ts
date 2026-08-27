import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MatchesService } from './matches.service';

function match(overrides: Record<string, unknown> = {}) {
  return {
    id: 'match-1',
    tournamentId: 'tournament-1',
    status: 'SCHEDULED',
    isBye: false,
    participant1Id: 'p1',
    participant2Id: 'p2',
    scheduledAt: null,
    courtId: null,
    roundNumber: 1,
    leg: 1,
    matchOrder: 1,
    revision: 1,
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function result(data: unknown[]) {
  return {
    data,
    meta: { total: data.length, page: 1, limit: 500, totalPages: 1, nextCursor: null, hasMore: false },
  };
}

describe('MatchesService schedule plan preview', () => {
  const repository = {
    findScheduleTournament: jest.fn(),
    isTournamentManager: jest.fn(),
    findScheduleCourts: jest.fn(),
    findAll: jest.fn(),
  };
  const service = new MatchesService(
    repository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findScheduleTournament.mockResolvedValue({
      id: 'tournament-1',
      createdBy: 'owner-1',
      startDate: new Date('2026-08-27T08:00:00.000Z'),
      endDate: new Date('2026-08-27T22:00:00.000Z'),
      updatedAt: new Date('2026-08-27T00:00:00.000Z'),
    });
    repository.isTournamentManager.mockResolvedValue(false);
    repository.findScheduleCourts.mockResolvedValue([
      { id: 'court-1', venueId: 'venue-1', courtName: 'Court 1', status: 'AVAILABLE' },
    ]);
    repository.findAll.mockResolvedValue(result([match()]));
  });

  it('previews in round order and never calls the write endpoint', async () => {
    const preview = await service.previewSchedulePlan(
      'tournament-1',
      { sub: 'owner-1', roles: ['PLAYER'] } as never,
      {
        date: '2026-08-27',
        courtIds: ['court-1'],
        strategy: 'ROUND_ORDER_EARLIEST_AVAILABLE',
      } as never,
    );

    expect(preview.data.assignments).toHaveLength(1);
    expect(preview.data.durationMinutes).toBe(45);
    expect(preview.data.bufferMinutes).toBe(5);
    expect(preview.data.assignments[0]).toMatchObject({ matchId: 'match-1', courtId: 'court-1' });
    expect(preview.data.assignments[0]?.scheduledAt).toBe('2026-08-27T08:00:00.000Z');
  });

  it('rejects an unrelated player before reading courts or matches', async () => {
    await expect(
      service.previewSchedulePlan(
        'tournament-1',
        { sub: 'player-1', roles: ['PLAYER'] } as never,
        { date: '2026-08-27', courtIds: ['court-1'], strategy: 'ROUND_ORDER_EARLIEST_AVAILABLE' } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.findScheduleCourts).not.toHaveBeenCalled();
    expect(repository.findAll).not.toHaveBeenCalled();
  });

  it('rejects a court outside the tournament scope', async () => {
    repository.isTournamentManager.mockResolvedValue(true);
    repository.findScheduleCourts.mockResolvedValue([]);

    await expect(
      service.previewSchedulePlan(
        'tournament-1',
        { sub: 'co-organizer-1', roles: ['PLAYER'] } as never,
        { date: '2026-08-27', courtIds: ['court-other'], strategy: 'ROUND_ORDER_EARLIEST_AVAILABLE' } as never,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repository.findAll).not.toHaveBeenCalled();
  });

  it('skips BYE, TBD, ongoing and already scheduled matches', async () => {
    repository.findScheduleCourts.mockResolvedValue([
      { id: 'court-1', venueId: 'venue-1', courtName: 'Court 1', status: 'AVAILABLE' },
    ]);
    repository.findAll.mockResolvedValue(result([
      match({ id: 'bye', isBye: true }),
      match({ id: 'tbd', participant2Id: null, matchOrder: 2 }),
      match({ id: 'ongoing', status: 'ONGOING', matchOrder: 3 }),
      match({ id: 'scheduled', scheduledAt: '2026-08-27T09:00:00.000Z', courtId: 'court-1', matchOrder: 4 }),
    ]));

    const preview = await service.previewSchedulePlan(
      'tournament-1',
      { sub: 'owner-1', roles: ['PLAYER'] } as never,
      { date: '2026-08-27', courtIds: ['court-1'], strategy: 'ROUND_ORDER_EARLIEST_AVAILABLE' } as never,
    );

    expect(preview.data.assignments).toHaveLength(0);
    expect(preview.data.skipped.map((item) => item.reason)).toEqual([
      'BYE',
      'TBD_OR_DEPENDENCY_BLOCKED',
      'TERMINAL_OR_ONGOING',
      'ALREADY_SCHEDULED',
    ]);
  });
});
