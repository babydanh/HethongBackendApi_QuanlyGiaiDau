import { BadRequestException } from '@nestjs/common';
import * as schema from '../../../database/schema';
import {
  assertDivisionHasRoom,
  lockCapacityOwner,
  readEffectiveCapacity,
  readCapacitiesForDivisions,
  TournamentCapacityService,
} from './tournament-capacity.service';

type DivisionRow = {
  id: string;
  matchType: string;
  maxParticipants: number | null;
  tournamentConfig?: unknown;
  tournamentId?: string;
};

type TournamentRow = {
  id: string;
  matchType: string;
  maxParticipants: number | null;
  tournamentConfig?: unknown;
};

type ParticipantRow = {
  scopeId?: string;
  divisionId?: string | null;
  teamStatus: string;
  rosterMemberCount: number | string;
  customResponses: unknown;
  division?: { matchType?: string | null } | null;
};

/**
 * The fake db never evaluates WHERE, so an occupancy row is projected onto the
 * columns the capacity query actually asked for. A participant therefore reads
 * under its division for a division read and under its tournament for a
 * tournament read, and carries its division format only when the query joins
 * the division — the same shape a real join would return.
 */
function projectOccupancyRow(
  fields: Record<string, unknown>,
  row: ParticipantRow,
): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(fields)) {
    if (key === 'rosterMemberCount') projected[key] = row.rosterMemberCount;
    else if (column === schema.tournamentParticipants.tournamentDivisionId)
      projected[key] =
        row.divisionId !== undefined ? row.divisionId : row.scopeId;
    else if (column === schema.tournamentParticipants.tournamentId)
      projected[key] = row.scopeId ?? null;
    else if (column === schema.tournamentDivisions.matchType)
      projected[key] = row.division?.matchType ?? null;
    else projected[key] = row[key as keyof ParticipantRow];
  }
  return projected;
}

function chainable(result: () => Promise<unknown>) {
  const query = {
    from: () => query,
    innerJoin: () => query,
    leftJoin: () => query,
    where: () => query,
    groupBy: () => query,
    for: () => query,
    limit: () => query,
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve().then(result).then(resolve, reject),
  };
  return query;
}

function createDb(options: {
  divisions?: DivisionRow[];
  tournaments?: TournamentRow[];
  participants?: ParticipantRow[];
}) {
  const divisionRows = options.divisions ?? [];
  const tournamentRows = options.tournaments ?? [];
  const participantRows = options.participants ?? [];

  const select = jest.fn((fields: Record<string, unknown>) => {
    if ('rosterMemberCount' in fields) {
      return chainable(async () =>
        participantRows.map((row) => projectOccupancyRow(fields, row)),
      );
    }
    if (fields.id === schema.tournaments.id) {
      return chainable(async () => tournamentRows);
    }
    return chainable(async () => divisionRows);
  });

  return { select } as never;
}

function service(db: unknown) {
  return new TournamentCapacityService(db as never);
}

const IMPORTED_PAIR = {
  importedFrom: 'GOOGLE_FORM',
  player2Name: 'Nguyen Van B',
};

describe('TournamentCapacityService division capacity', () => {
  it('reports one unpaired doubles member as half a team', async () => {
    const db = createDb({
      divisions: [
        { id: 'division-1', matchType: 'DOUBLES', maxParticipants: 4 },
      ],
      participants: [
        {
          scopeId: 'division-1',
          teamStatus: 'PENDING_APPROVAL',
          rosterMemberCount: 1,
          customResponses: null,
        },
      ],
    });

    await expect(service(db).getDivisionCapacity('division-1')).resolves.toEqual({
      occupiedTeamSlots: 0.5,
      occupiedMemberSlots: 1,
      maxTeamSlots: 4,
      isFull: false,
    });
  });

  it('keeps four unpaired doubles members at half capacity', async () => {
    const db = createDb({
      divisions: [
        { id: 'division-1', matchType: 'DOUBLES', maxParticipants: 4 },
      ],
      participants: Array.from({ length: 4 }, () => ({
        scopeId: 'division-1',
        teamStatus: 'PENDING_APPROVAL',
        rosterMemberCount: 1,
        customResponses: null,
      })),
    });

    const capacity = await service(db).getDivisionCapacity('division-1');

    expect(capacity.occupiedTeamSlots).toBe(2);
    expect(capacity.isFull).toBe(false);
  });

  it('reserves seats for both pending approval and pending partner members', async () => {
    const db = createDb({
      divisions: [
        { id: 'division-1', matchType: 'MIXED_DOUBLES', maxParticipants: 4 },
      ],
      participants: [
        {
          scopeId: 'division-1',
          teamStatus: 'PENDING_APPROVAL',
          rosterMemberCount: 1,
          customResponses: null,
        },
        {
          scopeId: 'division-1',
          teamStatus: 'PENDING_PARTNER',
          rosterMemberCount: 1,
          customResponses: null,
        },
      ],
    });

    const capacity = await service(db).getDivisionCapacity('division-1');

    expect(capacity.occupiedTeamSlots).toBe(1);
    expect(capacity.occupiedMemberSlots).toBe(2);
  });

  it.each([
    'WAITLISTED',
    'REJECTED',
    'WITHDRAWN',
    'KICKED',
    'EXPIRED',
    'CANCELLED',
  ])('never lets a %s row reserve capacity', async (teamStatus) => {
    const db = createDb({
      divisions: [
        { id: 'division-1', matchType: 'DOUBLES', maxParticipants: 4 },
      ],
      participants: Array.from({ length: 9 }, () => ({
        scopeId: 'division-1',
        teamStatus,
        rosterMemberCount: 1,
        customResponses: null,
      })),
    });

    const capacity = await service(db).getDivisionCapacity('division-1');

    expect(capacity.occupiedTeamSlots).toBe(0);
    expect(capacity.isFull).toBe(false);
  });

  it('reports eight active doubles members as full', async () => {
    const db = createDb({
      divisions: [
        { id: 'division-1', matchType: 'DOUBLES', maxParticipants: 4 },
      ],
      participants: Array.from({ length: 8 }, () => ({
        scopeId: 'division-1',
        teamStatus: 'PENDING_APPROVAL',
        rosterMemberCount: 1,
        customResponses: null,
      })),
    });

    const capacity = await service(db).getDivisionCapacity('division-1');

    expect(capacity.occupiedTeamSlots).toBe(4);
    expect(capacity.isFull).toBe(true);
  });

  it('counts an import-only doubles pair with no linked accounts as one team', async () => {
    const db = createDb({
      divisions: [
        { id: 'division-1', matchType: 'DOUBLES', maxParticipants: 4 },
      ],
      participants: [
        {
          scopeId: 'division-1',
          teamStatus: 'PENDING_APPROVAL',
          rosterMemberCount: 0,
          customResponses: IMPORTED_PAIR,
        },
      ],
    });

    const capacity = await service(db).getDivisionCapacity('division-1');

    expect(capacity.occupiedTeamSlots).toBe(1);
    expect(capacity.occupiedMemberSlots).toBe(2);
  });

  it('tops an import up to the full pair when only the first account is linked', async () => {
    const db = createDb({
      divisions: [
        { id: 'division-1', matchType: 'DOUBLES', maxParticipants: 4 },
      ],
      participants: [
        {
          scopeId: 'division-1',
          teamStatus: 'PENDING_APPROVAL',
          rosterMemberCount: 1,
          customResponses: IMPORTED_PAIR,
        },
      ],
    });

    const capacity = await service(db).getDivisionCapacity('division-1');

    expect(capacity.occupiedTeamSlots).toBe(1);
  });

  it('still counts the full pair when form answers sit beside the import metadata', async () => {
    // The importer merges validated metadata over the caller's form answers, so
    // a real imported row carries both. Neither contact has a linked account,
    // so the roster is empty and only the metadata can hold the team.
    const db = createDb({
      divisions: [
        { id: 'division-1', matchType: 'DOUBLES', maxParticipants: 4 },
      ],
      participants: [
        {
          scopeId: 'division-1',
          teamStatus: 'PENDING_APPROVAL',
          rosterMemberCount: 0,
          customResponses: {
            shirtSize: 'L',
            note: 'Đăng ký qua Google Form',
            importedFrom: 'GOOGLE_FORM',
            player2Name: 'Nguyen Van B',
          },
        },
      ],
    });

    const capacity = await service(db).getDivisionCapacity('division-1');

    expect(capacity.occupiedTeamSlots).toBe(1);
    expect(capacity.occupiedMemberSlots).toBe(2);
  });

  it('does not let a self-registration form answer inflate a lone leader', async () => {
    const db = createDb({
      divisions: [
        { id: 'division-1', matchType: 'DOUBLES', maxParticipants: 4 },
      ],
      participants: [
        {
          scopeId: 'division-1',
          teamStatus: 'PENDING_PARTNER',
          rosterMemberCount: 1,
          customResponses: { player2Name: 'Nguyen Van B' },
        },
      ],
    });

    const capacity = await service(db).getDivisionCapacity('division-1');

    expect(capacity.occupiedTeamSlots).toBe(0.5);
  });

  it('keeps a football squad on whole-team units even though it is DOUBLES', async () => {
    const db = createDb({
      divisions: [
        {
          id: 'division-1',
          matchType: 'DOUBLES',
          maxParticipants: 4,
          tournamentConfig: { teamSize: 11, minTeamSize: 7 },
        },
      ],
      participants: [
        {
          scopeId: 'division-1',
          teamStatus: 'COMPLETE',
          rosterMemberCount: 11,
          customResponses: null,
        },
      ],
    });

    const capacity = await service(db).getDivisionCapacity('division-1');

    expect(capacity.occupiedTeamSlots).toBe(1);
    expect(capacity.occupiedMemberSlots).toBe(1);
  });

  it('keeps the Lite doubles branch on the same roster-weighted units', async () => {
    const db = createDb({
      divisions: [
        {
          id: 'division-1',
          matchType: 'DOUBLES',
          maxParticipants: 4,
          tournamentConfig: { isLite: true },
        },
      ],
      participants: Array.from({ length: 4 }, () => ({
        scopeId: 'division-1',
        teamStatus: 'PENDING_PARTNER',
        rosterMemberCount: 1,
        customResponses: null,
      })),
    });

    const capacity = await service(db).getDivisionCapacity('division-1');

    // Four unpaired Lite athletes = four distinct roster users, which is the
    // same "half the cap is free" answer Lite's own member counter gives.
    expect(capacity.occupiedTeamSlots).toBe(2);
    expect(capacity.isFull).toBe(false);
  });

  it('keeps singles occupancy in whole team units', async () => {
    const db = createDb({
      divisions: [
        { id: 'division-1', matchType: 'SINGLES', maxParticipants: 4 },
      ],
      participants: [
        {
          scopeId: 'division-1',
          teamStatus: 'PENDING_APPROVAL',
          rosterMemberCount: 1,
          customResponses: null,
        },
        {
          scopeId: 'division-1',
          teamStatus: 'COMPLETE',
          rosterMemberCount: 1,
          customResponses: null,
        },
      ],
    });

    const capacity = await service(db).getDivisionCapacity('division-1');

    expect(capacity.occupiedTeamSlots).toBe(2);
    expect(capacity.occupiedMemberSlots).toBe(2);
  });

  it('does not treat an uncapped division as full', async () => {
    const db = createDb({
      divisions: [
        { id: 'division-1', matchType: 'DOUBLES', maxParticipants: null },
      ],
      participants: Array.from({ length: 20 }, () => ({
        scopeId: 'division-1',
        teamStatus: 'PENDING_APPROVAL',
        rosterMemberCount: 1,
        customResponses: null,
      })),
    });

    const capacity = await service(db).getDivisionCapacity('division-1');

    expect(capacity.maxTeamSlots).toBeNull();
    expect(capacity.isFull).toBe(false);
  });

  it('returns an empty snapshot for a missing division', async () => {
    const capacity = await service(createDb({})).getDivisionCapacity('missing');

    expect(capacity).toEqual({
      occupiedTeamSlots: 0,
      occupiedMemberSlots: 0,
      maxTeamSlots: null,
      isFull: false,
    });
  });

  it('exposes the same occupancy helper as the pure policy', () => {
    expect(typeof service(createDb({})).getTournamentCapacity).toBe(
      'function',
    );
  });
});

describe('batched capacity reads', () => {
  it('reads every division in one aggregate pass', async () => {
    const db = createDb({
      divisions: [
        { id: 'division-1', matchType: 'DOUBLES', maxParticipants: 4 },
        { id: 'division-2', matchType: 'SINGLES', maxParticipants: 8 },
      ],
      participants: [
        {
          scopeId: 'division-1',
          teamStatus: 'PENDING_APPROVAL',
          rosterMemberCount: 1,
          customResponses: null,
        },
        {
          scopeId: 'division-2',
          teamStatus: 'COMPLETE',
          rosterMemberCount: 1,
          customResponses: null,
        },
      ],
    });
    const dbSelect = (db as unknown as { select: jest.Mock }).select;

    const snapshots = await service(db).getDivisionCapacities('tournament-1');

    expect(snapshots['division-1'].occupiedTeamSlots).toBe(0.5);
    expect(snapshots['division-2'].occupiedTeamSlots).toBe(1);
    // Two owner queries + one aggregate, never one per division.
    expect(dbSelect).toHaveBeenCalledTimes(2);
  });

  it('reads a page of tournaments in one aggregate pass', async () => {
    const db = createDb({
      tournaments: [
        {
          id: 'tournament-1',
          matchType: 'DOUBLES',
          maxParticipants: 4,
        },
        { id: 'tournament-2', matchType: 'DOUBLES', maxParticipants: 2 },
      ],
      participants: [
        {
          scopeId: 'tournament-1',
          teamStatus: 'PENDING_APPROVAL',
          rosterMemberCount: 1,
          customResponses: null,
        },
        ...Array.from({ length: 4 }, () => ({
          scopeId: 'tournament-2',
          teamStatus: 'COMPLETE',
          rosterMemberCount: 1,
          customResponses: null,
        })),
      ],
    });
    const dbSelect = (db as unknown as { select: jest.Mock }).select;

    const snapshots = await service(db).getTournamentCapacities([
      'tournament-1',
      'tournament-2',
    ]);

    expect(snapshots['tournament-1'].isFull).toBe(false);
    expect(snapshots['tournament-2'].isFull).toBe(true);
    expect(dbSelect).toHaveBeenCalledTimes(2);
  });
});

describe('effective division capacity projections', () => {
  it('inherits the parent limit and parent-wide occupancy when local cap is absent', async () => {
    const db = createDb({
      divisions: [
        {
          id: 'division-1',
          tournamentId: 'tournament-1',
          matchType: 'DOUBLES',
          maxParticipants: null,
        },
      ],
      tournaments: [
        {
          id: 'tournament-1',
          matchType: 'DOUBLES',
          maxParticipants: 2,
          tournamentConfig: null,
        },
      ],
      participants: [
        {
          scopeId: 'tournament-1',
          divisionId: 'division-1',
          teamStatus: 'PENDING_PARTNER',
          rosterMemberCount: 1,
          customResponses: null,
          division: { matchType: 'DOUBLES' },
        },
        {
          scopeId: 'tournament-1',
          divisionId: 'division-2',
          teamStatus: 'COMPLETE',
          rosterMemberCount: 1,
          customResponses: null,
          division: { matchType: 'SINGLES' },
        },
      ],
    });

    const tournamentProjection =
      await service(db).getDivisionCapacities('tournament-1');
    const catalogProjection = await readCapacitiesForDivisions(
      db,
      ['division-1'],
    );
    const singleProjection = await service(db).getDivisionCapacity(
      'division-1',
    );
    expect(singleProjection).toEqual(tournamentProjection['division-1']);

    expect(tournamentProjection['division-1']).toMatchObject({
      occupiedTeamSlots: 1.5,
      maxTeamSlots: 2,
      isFull: false,
    });
    expect(catalogProjection['division-1']).toEqual(
      tournamentProjection['division-1'],
    );
  });
});

describe('lockCapacityOwner', () => {
  it('locks the tournament row before the division row', async () => {
    const lockedScopes: string[] = [];
    const db = createDb({});
    const rawSelect = (db as unknown as { select: jest.Mock }).select;
    const dbSelect = rawSelect.mockImplementation(
      (fields: Record<string, unknown>) => {
        const query = chainable(async () => []);
        const originalFor = query.for;
        query.for = () => {
          lockedScopes.push(
            fields.id === schema.tournaments.id ? 'tournament' : 'division',
          );
          return originalFor();
        };
        return query;
      },
    );

    await lockCapacityOwner(db, {
      tournamentId: 'tournament-1',
      divisionId: 'division-1',
    });

    expect(lockedScopes).toEqual(['tournament', 'division']);
    expect(dbSelect).toHaveBeenCalledTimes(2);
  });

  it('locks only the tournament row when no division owns the limit', async () => {
    const lockedScopes: string[] = [];
    const db = createDb({});
    (db as unknown as { select: jest.Mock }).select.mockImplementation(
      (fields: Record<string, unknown>) => {
        const query = chainable(async () => []);
        query.for = () => {
          lockedScopes.push(
            fields.id === schema.tournaments.id ? 'tournament' : 'division',
          );
          return query;
        };
        return query;
      },
    );

    await lockCapacityOwner(db, { tournamentId: 'tournament-1' });

    expect(lockedScopes).toEqual(['tournament']);
  });
});

describe('assertDivisionHasRoom capacity-unit awareness', () => {
  it('charges nothing when a claim adds no athlete to the division', () => {
    expect(() =>
      assertDivisionHasRoom(
        { occupiedTeamSlots: 4, maxTeamSlots: 4, isFull: true },
        'DOUBLES',
        0,
        { tournamentConfig: { teamSize: 11 } },
      ),
    ).not.toThrow();
  });

  it('still charges a new football registration one whole team', () => {
    expect(() =>
      assertDivisionHasRoom(
        { occupiedTeamSlots: 4, maxTeamSlots: 4, isFull: true },
        'DOUBLES',
        11,
        { tournamentConfig: { teamSize: 11 } },
      ),
    ).toThrow(BadRequestException);
  });
});

describe('tournament-wide occupancy across mixed division formats', () => {
  const DOUBLES_TOURNAMENT: TournamentRow = {
    id: 'tournament-1',
    matchType: 'DOUBLES',
    maxParticipants: 2,
    tournamentConfig: null,
  };

  it('weighs every tournament participant by the format of its own division', async () => {
    const db = createDb({
      tournaments: [DOUBLES_TOURNAMENT],
      divisions: [
        { id: 'division-singles', matchType: 'SINGLES', maxParticipants: null },
        { id: 'division-doubles', matchType: 'DOUBLES', maxParticipants: null },
      ],
      participants: [
        {
          scopeId: 'tournament-1',
          divisionId: 'division-singles',
          teamStatus: 'COMPLETE',
          rosterMemberCount: 1,
          customResponses: null,
          division: { matchType: 'SINGLES' },
        },
        {
          scopeId: 'tournament-1',
          divisionId: 'division-doubles',
          teamStatus: 'COMPLETE',
          rosterMemberCount: 2,
          customResponses: null,
          division: { matchType: 'DOUBLES' },
        },
      ],
    });

    const capacity = await service(db).getTournamentCapacity('tournament-1');

    // The singles athlete owns a whole team even though the parent is doubles;
    // the doubles pair owns a whole team too. Two teams of two.
    expect(capacity.occupiedTeamSlots).toBe(2);
    expect(capacity.maxTeamSlots).toBe(2);
    expect(capacity.isFull).toBe(true);
  });

  it('weighs a participant with no division by the tournament format', async () => {
    const db = createDb({
      tournaments: [{ ...DOUBLES_TOURNAMENT, maxParticipants: 4 }],
      divisions: [
        { id: 'division-singles', matchType: 'SINGLES', maxParticipants: null },
      ],
      participants: [
        {
          scopeId: 'tournament-1',
          divisionId: null,
          teamStatus: 'PENDING_PARTNER',
          rosterMemberCount: 1,
          customResponses: null,
        },
        {
          scopeId: 'tournament-1',
          divisionId: 'division-singles',
          teamStatus: 'COMPLETE',
          rosterMemberCount: 1,
          customResponses: null,
          division: { matchType: 'SINGLES' },
        },
      ],
    });

    const capacity = await service(db).getTournamentCapacity('tournament-1');

    // Only the unassigned participant falls back to the parent format.
    expect(capacity.occupiedTeamSlots).toBe(1.5);
  });

  it('charges a new claim by the division format the claimer picked', async () => {
    const db = createDb({
      tournaments: [DOUBLES_TOURNAMENT],
      divisions: [
        { id: 'division-singles', matchType: 'SINGLES', maxParticipants: null },
        { id: 'division-doubles', matchType: 'DOUBLES', maxParticipants: null },
      ],
      participants: [
        {
          scopeId: 'tournament-1',
          divisionId: 'division-singles',
          teamStatus: 'COMPLETE',
          rosterMemberCount: 1,
          customResponses: null,
          division: { matchType: 'SINGLES' },
        },
        {
          scopeId: 'tournament-1',
          divisionId: 'division-doubles',
          teamStatus: 'PENDING_PARTNER',
          rosterMemberCount: 1,
          customResponses: null,
          division: { matchType: 'DOUBLES' },
        },
      ],
    });

    const capacity = await service(db).getTournamentCapacity('tournament-1');
    expect(capacity.occupiedTeamSlots).toBe(1.5);

    // One more singles athlete owns a whole team, which no longer fits.
    expect(() => assertDivisionHasRoom(capacity, 'SINGLES', 1)).toThrow(
      BadRequestException,
    );
  });
});

describe('readEffectiveCapacity', () => {
  it('keeps the division limit when the division sets one', async () => {
    // The division caps itself below the tournament, so its own limit decides
    // and the tournament row is never even read.
    const db = createDb({
      divisions: [
        {
          id: 'division-1',
          tournamentId: 'tournament-1',
          matchType: 'DOUBLES',
          maxParticipants: 4,
        },
      ],
      tournaments: [
        {
          id: 'tournament-1',
          matchType: 'DOUBLES',
          maxParticipants: 2,
          tournamentConfig: null,
        },
      ],
      participants: [
        {
          scopeId: 'division-1',
          teamStatus: 'COMPLETE',
          rosterMemberCount: 2,
          customResponses: null,
        },
      ],
    });
    const dbSelect = (db as unknown as { select: jest.Mock }).select;

    const capacity = await readEffectiveCapacity(db, {
      tournamentId: 'tournament-1',
      divisionId: 'division-1',
    });

    expect(capacity.maxTeamSlots).toBe(4);
    expect(capacity.occupiedTeamSlots).toBe(1);
    expect(dbSelect).toHaveBeenCalledTimes(2);
  });

  it('falls back to the tournament limit with tournament-wide occupancy', async () => {
    const db = createDb({
      divisions: [
        {
          id: 'division-1',
          tournamentId: 'tournament-1',
          matchType: 'DOUBLES',
          maxParticipants: null,
        },
      ],
      tournaments: [
        {
          id: 'tournament-1',
          matchType: 'DOUBLES',
          maxParticipants: 2,
          tournamentConfig: null,
        },
      ],
      participants: [
        {
          scopeId: 'tournament-1',
          divisionId: 'division-1',
          teamStatus: 'COMPLETE',
          rosterMemberCount: 2,
          customResponses: null,
          division: { matchType: 'DOUBLES' },
        },
        {
          scopeId: 'tournament-1',
          divisionId: 'division-1',
          teamStatus: 'COMPLETE',
          rosterMemberCount: 2,
          customResponses: null,
          division: { matchType: 'DOUBLES' },
        },
      ],
    });

    const capacity = await readEffectiveCapacity(db, {
      tournamentId: 'tournament-1',
      divisionId: 'division-1',
    });

    expect(capacity.maxTeamSlots).toBe(2);
    expect(capacity.occupiedTeamSlots).toBe(2);
    expect(capacity.isFull).toBe(true);
  });

  it('leaves the division uncapped when neither scope sets a limit', async () => {
    const db = createDb({
      divisions: [
        {
          id: 'division-1',
          tournamentId: 'tournament-1',
          matchType: 'DOUBLES',
          maxParticipants: null,
        },
      ],
      tournaments: [
        {
          id: 'tournament-1',
          matchType: 'DOUBLES',
          maxParticipants: null,
          tournamentConfig: null,
        },
      ],
      participants: [
        {
          scopeId: 'division-1',
          teamStatus: 'COMPLETE',
          rosterMemberCount: 2,
          customResponses: null,
        },
      ],
    });
    const dbSelect = (db as unknown as { select: jest.Mock }).select;

    const capacity = await readEffectiveCapacity(db, {
      tournamentId: 'tournament-1',
      divisionId: 'division-1',
    });

    expect(capacity.maxTeamSlots).toBeNull();
    expect(capacity.occupiedTeamSlots).toBe(1);
    // The division owner, its parent (which sets no limit either), then the
    // division's own occupancy — still no per-division fan-out.
    expect(dbSelect).toHaveBeenCalledTimes(3);
  });
});
