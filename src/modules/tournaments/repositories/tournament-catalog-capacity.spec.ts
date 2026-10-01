import type { AppDb } from '../../../database/db.types';
import type { AuditService } from '../../audit/audit.service';
import type { SeriesService } from '../../series/series.service';
import * as capacityService from '../services/tournament-capacity.service';
import { TournamentCatalogRepository } from './tournament-catalog.repository';

type QueryResult = unknown[];
type QueryBuilder = {
  from: jest.Mock;
  leftJoin: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  $dynamic: jest.Mock;
  then: (
    resolve: (value: QueryResult) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

function queryBuilder(result: QueryResult): QueryBuilder {
  const query = {} as QueryBuilder;
  const chain = () => query;
  query.from = jest.fn(chain);
  query.leftJoin = jest.fn(chain);
  query.where = jest.fn(chain);
  query.orderBy = jest.fn(chain);
  query.limit = jest.fn(chain);
  query.$dynamic = jest.fn(chain);
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function repositoryFor(results: QueryResult[]): TournamentCatalogRepository {
  const db = {
    select: jest.fn(() => queryBuilder(results.shift() ?? [])),
  } as unknown as AppDb;
  return new TournamentCatalogRepository(
    db,
    {} as AuditService,
    {} as SeriesService,
    {} as never,
  );
}

const doublesCapacity = {
  occupiedTeamSlots: 1,
  occupiedMemberSlots: 2,
  maxTeamSlots: 4,
  isFull: false,
};

const tournamentRow = {
  tournament: {
    id: 'tournament-1',
    name: 'Open Doubles',
    matchType: 'DOUBLES',
    maxParticipants: 4,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    categoryId: 'category-1',
    entryFee: '0.00',
  },
  category: null,
  venue: null,
};

const divisionRow = {
  id: 'division-1',
  name: 'Doubles A',
  matchType: 'DOUBLES',
  genderRestriction: 'MIXED',
  status: 'REGISTRATION_OPEN',
  maxParticipants: 4,
  entryFee: null,
  entryFeeOverrideEnabled: false,
};

function listQueryResults(divisions: QueryResult): QueryResult[] {
  return [
    [{ count: 1 }],
    [tournamentRow],
    [{ count: 2 }],
    divisions,
    ...(divisions.length > 0 ? [[{ count: 2 }]] : []),
  ];
}

describe('TournamentCatalogRepository public capacity projection', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns team-equivalent capacity on tournament divisions without changing row counts', async () => {
    jest
      .spyOn(capacityService, 'readCapacitiesForDivisions')
      .mockResolvedValue({ 'division-1': doublesCapacity });
    jest
      .spyOn(capacityService, 'readTournamentCapacities')
      .mockResolvedValue({ 'tournament-1': doublesCapacity });

    const result = await repositoryFor(
      listQueryResults([divisionRow]),
    ).findAll({ page: 1, limit: 10 });

    expect(result.data[0].capacity).toEqual(doublesCapacity);
    expect(result.data[0].divisions?.[0].capacity).toEqual(doublesCapacity);
    expect(result.data[0]._count.participants).toBe(2);
    expect(result.data[0].divisions?.[0]._count.participants).toBe(2);
  });

  it('returns tournament capacity for a standalone listing without divisions', async () => {
    jest
      .spyOn(capacityService, 'readCapacitiesForDivisions')
      .mockResolvedValue({});
    jest
      .spyOn(capacityService, 'readTournamentCapacities')
      .mockResolvedValue({ 'tournament-1': doublesCapacity });

    const result = await repositoryFor(listQueryResults([])).findAll({
      page: 1,
      limit: 10,
    });

    expect(result.data[0].capacity).toEqual(doublesCapacity);
    expect(result.data[0].divisions).toBeNull();
    expect(result.data[0]._count.participants).toBe(2);
  });
});
