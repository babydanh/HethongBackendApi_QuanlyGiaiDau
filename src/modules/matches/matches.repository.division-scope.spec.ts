import { MatchesRepository } from './matches.repository';
import { QueryMatchDto } from './dto/query-match.dto';
import type { AppDb } from '../../database/db.types';

type QueryBuilder = {
  from: (...args: unknown[]) => QueryBuilder;
  where: (...args: unknown[]) => QueryBuilder;
  orderBy: (...args: unknown[]) => QueryBuilder;
  limit: (...args: unknown[]) => QueryBuilder;
  leftJoin: (...args: unknown[]) => QueryBuilder;
  $dynamic: () => QueryBuilder;
  then: (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

type ScopeFixture = {
  divisionStages: { id: string; tournamentId: string }[];
  assignedDivisionStages: { id: string }[];
  matches: Record<string, unknown>[];
  total: number;
};

function createRepository(fixture: ScopeFixture): MatchesRepository {
  const resultsByProjection: Record<string, unknown[]> = {
    'id,tournamentId': fixture.divisionStages,
    id: fixture.assignedDivisionStages,
    count: [{ count: fixture.total }],
    '': fixture.matches,
    'tournamentId,tournamentName,venueAddress,venueName': [
      {
        tournamentId: 'tournament-1',
        tournamentName: 'Divisionless Cup',
        venueName: null,
        venueAddress: null,
      },
    ],
  };
  const db = {
    select: (projection?: Record<string, unknown>) => {
      const key = Object.keys(projection ?? {}).sort().join(',');
      const result = resultsByProjection[key] ?? [];
      const builder: QueryBuilder = {
        from: () => builder,
        where: () => builder,
        orderBy: () => builder,
        limit: () => builder,
        leftJoin: () => builder,
        $dynamic: () => builder,
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  };

  return new MatchesRepository(db as unknown as AppDb, {} as never);
}

const legacyMatch = {
  id: 'match-legacy',
  tournamentId: 'tournament-1',
  participant1Id: null,
  participant2Id: null,
  groupId: null,
  stageId: null,
  status: 'SCHEDULED',
  updatedAt: new Date('2026-09-27T00:00:00.000Z'),
};

describe('MatchesRepository strict division scope', () => {
  it('returns empty for an unmatched division when another active stage is division-mapped', async () => {
    const repository = createRepository({
      divisionStages: [],
      assignedDivisionStages: [{ id: 'stage-other-division' }],
      matches: [legacyMatch],
      total: 1,
    });
    const query = {
      tournamentId: 'tournament-1',
      divisionId: 'division-selected',
      strictDivisionScope: true,
      limit: 10,
    } as QueryMatchDto;

    const page = await repository.findAll(query);

    expect(page.data).toEqual([]);
    expect(page.meta.total).toBe(0);
  });

  it('keeps the tournament fallback when every active stage is divisionless', async () => {
    const repository = createRepository({
      divisionStages: [],
      assignedDivisionStages: [],
      matches: [legacyMatch],
      total: 1,
    });
    const query = {
      tournamentId: 'tournament-1',
      divisionId: 'division-selected',
      strictDivisionScope: true,
      limit: 10,
    } as QueryMatchDto;

    const page = await repository.findAll(query);

    expect(page.data).toHaveLength(1);
    expect(page.data[0].id).toBe('match-legacy');
    expect(page.data[0].tournament.name).toBe('Divisionless Cup');
  });

  it('keeps the legacy fallback when strict scope is omitted', async () => {
    const repository = createRepository({
      divisionStages: [],
      assignedDivisionStages: [{ id: 'stage-other-division' }],
      matches: [legacyMatch],
      total: 1,
    });

    const page = await repository.findAll({
      tournamentId: 'tournament-1',
      divisionId: 'division-selected',
      limit: 10,
    });

    expect(page.data).toHaveLength(1);
    expect(page.data[0].id).toBe('match-legacy');
  });
});
