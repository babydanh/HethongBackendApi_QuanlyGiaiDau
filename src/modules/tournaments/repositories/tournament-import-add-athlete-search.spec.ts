import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { and, sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import * as schema from '../../../database/schema';
import { TournamentImportRepository } from './tournament-import.repository';
import { TournamentImportService } from '../services/tournament-import.service';
import { TournamentParticipantRepository } from './tournament-participant.repository';

const dialect = new PgDialect();

type CapturedQuery = {
  projection?: Record<string, unknown>;
  predicates: SQL[];
  limit?: number;
  orderBy?: SQL[];
};

type QueryResult = {
  items: Array<Record<string, unknown>>;
};

type SearchRepositoryContract = {
  searchAddAthleteCandidates(
    tournamentId: string,
    organizerId: string,
    query: { name?: string; email?: string; participantId?: string },
  ): Promise<QueryResult>;
};

function createReadRepository(
  rows: Array<Record<string, unknown>>,
  footballTargets: Array<Record<string, unknown>> = [],
) {
  const captures: CapturedQuery[] = [];
  const db = {
    select: (projection?: Record<string, unknown>) => {
      const capture: CapturedQuery = { projection, predicates: [] };
      captures.push(capture);
      const query: Record<string, unknown> = {};
      query.getSQL = () =>
        sql`select 1 ${
          capture.predicates.length
            ? sql`where ${and(...capture.predicates)}`
            : sql``
        }`;
      query.from = () => query;
      query.innerJoin = () => query;
      query.where = (predicate: SQL) => {
        capture.predicates.push(predicate);
        return query;
      };
      query.orderBy = (...orderBy: SQL[]) => {
        capture.orderBy = orderBy;
        return query;
      };
      query.groupBy = () => query;
      query.limit = (limit: number) => {
        capture.limit = limit;
        return query;
      };
      query.then = (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => {
        const resultRows = capture.projection?.teamId
          ? footballTargets
          : rows;
        return Promise.resolve(resultRows.slice(0, capture.limit))
          .then(resolve, reject);
      };
      return query;
    },
  };
  const repository = new TournamentImportRepository(
    db as never,
    null as never,
  ) as unknown as SearchRepositoryContract;
  return { repository, captures };
}

function compiledPredicates(capture: CapturedQuery): string[] {
  return capture.predicates.map((predicate) => {
    const query = dialect.sqlToQuery(predicate);
    return `${query.sql} ${JSON.stringify(query.params)}`;
  });
}
function candidateQuery(captures: CapturedQuery[]): CapturedQuery {
  const capture = captures.find(
    ({ projection }) => projection?.email === schema.users.email,
  );
  if (!capture) throw new Error('Candidate query projection was not captured');
  return capture;
}
describe('TournamentImportRepository.searchAddAthleteCandidates', () => {
  it('matches a case-insensitive partial email literally, caps at ten, and returns only the allowlisted fields', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      userId: `user-${index}`,
      fullName: `Athlete ${index}`,
      email: `jo%hn_${index}\\@example.test`,
      avatarUrl: `https://cdn.example.test/${index}.png`,
      phoneNumber: '+84900000000',
    }));
    const { repository, captures } = createReadRepository(rows);

    const result = await repository.searchAddAthleteCandidates(
      'tournament-1',
      'organizer-1',
      { email: 'JO%hn_\\@example.test' },
    );

    const query = candidateQuery(captures);
    expect(result.items).toHaveLength(10);
    expect(query.limit).toBe(10);
    const predicates = compiledPredicates(query).join(' ');
    expect(predicates).toMatch(/ILIKE/i);
    expect(
      query.predicates.flatMap((predicate) =>
        dialect.sqlToQuery(predicate).params,
      ),
    ).toContain('%JO\\%hn\\_\\\\@example.test%');
    expect(predicates).toContain('is_email_verified');
    expect(predicates).toContain('deleted_at');
    expect(predicates).toContain('is_mock');
    expect(query.projection).toEqual(
      expect.objectContaining({
        userId: schema.users.id,
        email: schema.users.email,
        avatarUrl: schema.profiles.avatarUrl,
      }),
    );
    expect(
      dialect.sqlToQuery(query.projection?.fullName as SQL).sql,
    ).toContain('btrim');
    expect(query.projection).not.toHaveProperty('phoneNumber');
    expect(result.items[0]).toMatchObject({
      userId: 'user-0',
      fullName: 'Athlete 0',
      email: 'jo%hn_0\\@example.test',
      sources: ['EMAIL'],
    });
    expect(result.items[0]).not.toHaveProperty('phoneNumber');
  });

  it('searches accepted friends and joined candidates across active communities, deduplicating by user ID', async () => {
    const rows = [
      {
        userId: 'shared-user',
        fullName: 'Alex Athlete',
        email: 'alex@example.test',
        isFriend: true,
        isClub: false,
      },
      {
        userId: 'shared-user',
        fullName: 'Alex Athlete',
        email: 'alex@example.test',
        avatarUrl: null,
        isFriend: false,
        isClub: true,
      },
    ];
    const { repository, captures } = createReadRepository(rows);
    const result = await repository.searchAddAthleteCandidates(
      'tournament-1',
      'organizer-1',
      { name: 'Alex' },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      userId: 'shared-user',
      sources: ['FRIENDS', 'CLUB'],
    });
    const predicates = compiledPredicates(candidateQuery(captures)).join(' ');
    expect(predicates).toMatch(/ILIKE/i);
    expect(predicates).toContain('ACCEPTED');
    expect(predicates).toContain('JOINED');
    expect(predicates).toContain('ACTIVE');
    expect(predicates).toContain('deleted_at');
  });
  it('prefers email when both search terms are present', async () => {
    const { repository, captures } = createReadRepository([
      {
        userId: 'email-user',
        fullName: 'Name Result',
        email: 'athlete@example.test',
        avatarUrl: null,
      },
    ]);

    const result = await repository.searchAddAthleteCandidates(
      'tournament-1',
      'organizer-1',
      { name: 'Name Result', email: 'athlete' },
    );
    const query = candidateQuery(captures);
    const predicates = compiledPredicates(query).join(' ');

    expect(predicates).toContain('"users"."email"');
    expect(predicates).not.toContain('Name Result');
    expect(result.items[0]).toMatchObject({ sources: ['EMAIL'] });
    expect(query.orderBy).toHaveLength(2);
  });

  it('limits football search to active members of the selected team', async () => {
    const { repository, captures } = createReadRepository(
      [
        {
          userId: 'team-member',
          fullName: 'Alex Athlete',
          email: 'alex@example.test',
          avatarUrl: null,
          isFriend: true,
          isClub: false,
        },
      ],
      [
        {
          teamId: 'team-1',
          teamStatus: 'APPROVED',
          rosterLockedAt: null,
          entryStatus: 'CONFIRMED',
        },
      ],
    );

    const result = await repository.searchAddAthleteCandidates(
      'tournament-1',
      'organizer-1',
      { name: 'Alex', participantId: 'participant-1' },
    );
    const predicates = compiledPredicates(candidateQuery(captures)).join(' ');

    expect(predicates).toContain('football_team_members');
    expect(predicates).toContain('team-1');
    expect(predicates).toContain('ACTIVE');
    expect(result.items).toHaveLength(1);
  });

  it('rejects football search without an editable selected team', async () => {
    const { repository } = createReadRepository([], []);

    await expect(
      repository.searchAddAthleteCandidates(
        'tournament-1',
        'organizer-1',
        { name: 'Alex', participantId: 'participant-1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TournamentImportService.searchAddAthleteCandidates authorization', () => {
  it('denies a non-manager before querying candidate data', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue({
        id: 'tournament-1',
        communityId: 'community-1',
        status: 'REGISTRATION_OPEN',
      }),
      searchAddAthleteCandidates: jest.fn(),
    };
    const access = { isManager: jest.fn().mockResolvedValue(false) };
    const service = new TournamentImportService(
      repository as never,
      access as never,
      null as never,
      { sendConfirmationRequest: jest.fn() } as never,
    ) as unknown as {
      searchAddAthleteCandidates: (
        tournamentId: string,
        userId: string,
        systemRoles: string[],
        query: { name?: string; email?: string },
      ) => Promise<unknown>;
    };

    await expect(
      service.searchAddAthleteCandidates(
        'tournament-1',
        'not-manager',
        [],
        { email: 'athlete@example.test' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.searchAddAthleteCandidates).not.toHaveBeenCalled();
  });
  it('rejects an empty trimmed query before reading candidate data', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue({
        id: 'tournament-1',
        communityId: 'community-1',
        status: 'REGISTRATION_OPEN',
      }),
      searchAddAthleteCandidates: jest.fn(),
    };
    const access = { isManager: jest.fn().mockResolvedValue(true) };
    const service = new TournamentImportService(
      repository as never,
      access as never,
      null as never,
      { sendConfirmationRequest: jest.fn() } as never,
    ) as unknown as {
      searchAddAthleteCandidates: (
        tournamentId: string,
        userId: string,
        systemRoles: string[],
        query: { name?: string; email?: string },
      ) => Promise<unknown>;
    };

    await expect(
      service.searchAddAthleteCandidates(
        'tournament-1',
        'manager-1',
        [],
        { name: '  ', email: ' ' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.searchAddAthleteCandidates).not.toHaveBeenCalled();
  });
  it('returns only organizer search fields and normalized HTTPS avatars', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue({
        id: 'tournament-1',
        communityId: 'community-1',
        status: 'REGISTRATION_OPEN',
        tournamentConfig: null,
      }),
      searchAddAthleteCandidates: jest.fn().mockResolvedValue({
        items: [
          {
            userId: 'athlete-1',
            fullName: 'Alex Athlete',
            email: 'alex@example.test',
            avatarUrl: 'http://cdn.example.test/avatar.png',
            sources: ['EMAIL'],
            phoneNumber: '+84900000000',
            communityId: 'private-community',
          },
        ],
      }),
    };
    const access = { isManager: jest.fn().mockResolvedValue(true) };
    const service = new TournamentImportService(
      repository as never,
      access as never,
      null as never,
      { sendConfirmationRequest: jest.fn() } as never,
    ) as unknown as {
      searchAddAthleteCandidates: (
        tournamentId: string,
        userId: string,
        systemRoles: string[],
        query: { name?: string; email?: string },
      ) => Promise<unknown>;
    };

    const result = await service.searchAddAthleteCandidates(
      'tournament-1',
      'manager-1',
      [],
      { email: 'alex' },
    );

    expect(result).toEqual({
      items: [
        {
          userId: 'athlete-1',
          fullName: 'Alex Athlete',
          email: 'alex@example.test',
          avatarUrl: null,
          sources: ['EMAIL'],
        },
      ],
    });
  });
});
function createEmailRelationshipTransaction(rows: Array<{ id: string }>) {
  let accountPredicate: SQL | undefined;
  const tx = {
    select: () => {
      let table: unknown;
      let predicate: SQL | undefined;
      const query: Record<string, unknown> = {};
      query.getSQL = () =>
        sql`select 1 ${predicate ? sql`where ${predicate}` : sql``}`;
      query.from = (value: unknown) => {
        table = value;
        return query;
      };
      query.where = (value: SQL) => {
        predicate = value;
        if (table === schema.users) accountPredicate = value;
        return query;
      };
      query.for = () => query;
      query.limit = () => query;
      query.then = (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) =>
        Promise.resolve(
          table === schema.users ? rows.map(({ id }) => ({ id })) : [],
        ).then(resolve, reject);
      return query;
    },
  };
  return { tx, accountPredicate: () => accountPredicate };
}

describe('TournamentParticipantRepository EMAIL source validation', () => {
  const repository = new TournamentParticipantRepository(
    null as never,
    null as never,
    null as never,
  ) as unknown as {
    assertAddAthleteRelationship(
      tx: unknown,
      communityId: string | null,
      organizerId: string,
      source: 'EMAIL',
      candidateId: string,
    ): Promise<void>;
  };

  it('requires a currently eligible verified account without a community relation', async () => {
    const { tx, accountPredicate } = createEmailRelationshipTransaction([
      { id: 'athlete-1' },
    ]);

    await expect(
      repository.assertAddAthleteRelationship(
        tx,
        null,
        'organizer-1',
        'EMAIL',
        'athlete-1',
      ),
    ).resolves.toBeUndefined();

    expect(accountPredicate()).toBeDefined();
    const predicate = dialect.sqlToQuery(accountPredicate()!).sql;
    expect(predicate).toContain('is_email_verified');
    expect(predicate).toContain('deleted_at');
    expect(predicate).toContain('is_mock');
  });

  it('rejects an email account that is no longer eligible', async () => {
    const { tx } = createEmailRelationshipTransaction([]);

    await expect(
      repository.assertAddAthleteRelationship(
        tx,
        null,
        'organizer-1',
        'EMAIL',
        'athlete-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
