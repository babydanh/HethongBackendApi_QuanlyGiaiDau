import { TournamentDivisionService } from './tournament-division.service';

function createRepositoryMock(divisions: Array<Record<string, unknown>>) {
  return {
    findById: jest.fn().mockResolvedValue({ id: 'tournament-1' }),
    getDivisionsByTournament: jest.fn().mockResolvedValue(divisions),
  };
}

function createService(options: {
  divisions: Array<Record<string, unknown>>;
  capacityByDivision: Record<string, Record<string, number | boolean>>;
}) {
  const repository = createRepositoryMock(options.divisions);
  const capacityService = {
    getDivisionCapacities: jest.fn(async () => options.capacityByDivision),
  };

  const service = new TournamentDivisionService(
    repository as never,
    { isManager: jest.fn() } as never,
    {
      resolveDivisionEntryFeeMutation: jest.fn(),
      assertEntryFeeAllowed: jest.fn(),
    } as never,
    capacityService as never,
  );

  return { service, capacityService };
}

describe('division capacity projection', () => {
  it('exposes team-equivalent occupancy for doubles divisions', async () => {
    const { service } = createService({
      divisions: [{ id: 'division-1', maxParticipants: 4 }],
      capacityByDivision: {
        'division-1': {
          occupiedTeamSlots: 0.5,
          occupiedMemberSlots: 1,
          maxTeamSlots: 4,
          isFull: false,
        },
      },
    });

    const [division] = await service.getDivisionsForTournament('tournament-1');

    expect(division.capacity).toEqual({
      occupiedTeamSlots: 0.5,
      occupiedMemberSlots: 1,
      maxTeamSlots: 4,
      isFull: false,
    });
  });

  it('marks a doubles division full at four team slots', async () => {
    const { service } = createService({
      divisions: [{ id: 'division-1', maxParticipants: 4 }],
      capacityByDivision: {
        'division-1': {
          occupiedTeamSlots: 4,
          occupiedMemberSlots: 8,
          maxTeamSlots: 4,
          isFull: true,
        },
      },
    });

    const [division] = await service.getDivisionsForTournament('tournament-1');

    expect(division.capacity.isFull).toBe(true);
  });

  it('keeps the legacy participant row count alongside team-slot capacity', async () => {
    const { service } = createService({
      divisions: [
        { id: 'division-1', maxParticipants: 4, _count: { participants: 4 } },
      ],
      capacityByDivision: {
        'division-1': {
          occupiedTeamSlots: 2,
          occupiedMemberSlots: 4,
          maxTeamSlots: 4,
          isFull: false,
        },
      },
    });

    const [division] = await service.getDivisionsForTournament('tournament-1');

    expect(division._count).toEqual({ participants: 4 });
    expect(division.capacity.occupiedTeamSlots).toBe(2);
  });

  it('reads capacity for the whole tournament in one call, not one per division', async () => {
    const { service, capacityService } = createService({
      divisions: [
        { id: 'division-1', maxParticipants: 4 },
        { id: 'division-2', maxParticipants: 8 },
        { id: 'division-3', maxParticipants: 8 },
      ],
      capacityByDivision: {
        'division-1': {
          occupiedTeamSlots: 0.5,
          occupiedMemberSlots: 1,
          maxTeamSlots: 4,
          isFull: false,
        },
        'division-2': {
          occupiedTeamSlots: 2,
          occupiedMemberSlots: 4,
          maxTeamSlots: 8,
          isFull: false,
        },
        'division-3': {
          occupiedTeamSlots: 8,
          occupiedMemberSlots: 16,
          maxTeamSlots: 8,
          isFull: true,
        },
      },
    });

    const divisions = await service.getDivisionsForTournament('tournament-1');

    expect(capacityService.getDivisionCapacities).toHaveBeenCalledTimes(1);
    expect(divisions.map((division) => division.capacity.isFull)).toEqual([
      false,
      false,
      true,
    ]);
  });
});
