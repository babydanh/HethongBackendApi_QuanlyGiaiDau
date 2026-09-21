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

  it('schedules TBD bracket slots but skips BYE, ongoing and already scheduled matches', async () => {
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

    expect(preview.data.assignments).toHaveLength(1);
    expect(preview.data.assignments[0]).toMatchObject({
      matchId: 'tbd',
      courtId: 'court-1',
    });
    expect(preview.data.skipped.map((item) => item.reason)).toEqual([
      'BYE',
      'TERMINAL_OR_ONGOING',
      'ALREADY_SCHEDULED',
    ]);
  });

  it('does not start a later knockout round before the previous round ends', async () => {
    repository.findScheduleCourts.mockResolvedValue([
      { id: 'court-1', venueId: 'venue-1', courtName: 'Court 1', status: 'AVAILABLE' },
      { id: 'court-2', venueId: 'venue-1', courtName: 'Court 2', status: 'AVAILABLE' },
    ]);
    repository.findAll.mockResolvedValue(result([
      match({ id: 'r1-a', matchOrder: 1, roundNumber: 1, participant1Id: 'p1', participant2Id: 'p2' }),
      match({ id: 'r1-b', matchOrder: 2, roundNumber: 1, participant1Id: 'p3', participant2Id: 'p4' }),
      match({ id: 'r2-a', matchOrder: 3, roundNumber: 2, participant1Id: null, participant2Id: null }),
    ]));

    const preview = await service.previewSchedulePlan(
      'tournament-1',
      { sub: 'owner-1', roles: ['PLAYER'] } as never,
      {
        date: '2026-08-27',
        courtIds: ['court-1', 'court-2'],
        durationMinutes: 15,
        bufferMinutes: 0,
        minimumStartIntervalMinutes: 15,
        strategy: 'ROUND_ORDER_EARLIEST_AVAILABLE',
      } as never,
    );

    const firstRound = preview.data.assignments.filter((item) => item.matchId !== 'r2-a');
    const laterRound = preview.data.assignments.find((item) => item.matchId === 'r2-a');
    expect(firstRound).toHaveLength(2);
    expect(laterRound).toBeDefined();
    expect(new Date(laterRound!.scheduledAt).getTime()).toBeGreaterThanOrEqual(
      Math.max(...firstRound.map((item) => new Date(item.scheduledAt).getTime())) + 15 * 60_000,
    );
  });

  it('schedules every round of a 16-slot knockout bracket in dependency order', async () => {
    repository.findScheduleCourts.mockResolvedValue([
      { id: 'court-1', venueId: 'venue-1', courtName: 'Court 1', status: 'AVAILABLE' },
      { id: 'court-2', venueId: 'venue-1', courtName: 'Court 2', status: 'AVAILABLE' },
      { id: 'court-3', venueId: 'venue-1', courtName: 'Court 3', status: 'AVAILABLE' },
      { id: 'court-4', venueId: 'venue-1', courtName: 'Court 4', status: 'AVAILABLE' },
      { id: 'court-5', venueId: 'venue-1', courtName: 'Court 5', status: 'AVAILABLE' },
    ]);
    repository.findAll.mockResolvedValue(result([
      ...Array.from({ length: 8 }, (_, index) => match({ id: `r1-${index + 1}`, roundNumber: 1, matchOrder: index + 1, participant1Id: null, participant2Id: null })),
      ...Array.from({ length: 4 }, (_, index) => match({ id: `r2-${index + 1}`, roundNumber: 2, matchOrder: index + 1, participant1Id: null, participant2Id: null })),
      ...Array.from({ length: 2 }, (_, index) => match({ id: `r3-${index + 1}`, roundNumber: 3, matchOrder: index + 1, participant1Id: null, participant2Id: null })),
      match({ id: 'r4-1', roundNumber: 4, matchOrder: 1, participant1Id: null, participant2Id: null }),
    ]));

    const preview = await service.previewSchedulePlan(
      'tournament-1',
      { sub: 'owner-1', roles: ['PLAYER'] } as never,
      {
        date: '2026-08-27',
        courtIds: ['court-1', 'court-2', 'court-3', 'court-4', 'court-5'],
        durationMinutes: 15,
        bufferMinutes: 0,
        minimumStartIntervalMinutes: 15,
        strategy: 'ROUND_ORDER_EARLIEST_AVAILABLE',
      } as never,
    );

    expect(preview.data.assignments).toHaveLength(15);
    const assignmentTime = (id: string) => {
      const assignment = preview.data.assignments.find((item) => item.matchId === id);
      expect(assignment).toBeDefined();
      return new Date(assignment!.scheduledAt).getTime();
    };
    const r1End = Math.max(...Array.from({ length: 8 }, (_, index) => assignmentTime(`r1-${index + 1}`))) + 15 * 60_000;
    const r2Start = Math.min(...Array.from({ length: 4 }, (_, index) => assignmentTime(`r2-${index + 1}`)));
    const r2End = Math.max(...Array.from({ length: 4 }, (_, index) => assignmentTime(`r2-${index + 1}`))) + 15 * 60_000;
    const r3Start = Math.min(...Array.from({ length: 2 }, (_, index) => assignmentTime(`r3-${index + 1}`)));
    const r3End = Math.max(...Array.from({ length: 2 }, (_, index) => assignmentTime(`r3-${index + 1}`))) + 15 * 60_000;

    expect(r2Start).toBeGreaterThanOrEqual(r1End);
    expect(r3Start).toBeGreaterThanOrEqual(r2End);
    expect(assignmentTime('r4-1')).toBeGreaterThanOrEqual(r3End);
  });
});
