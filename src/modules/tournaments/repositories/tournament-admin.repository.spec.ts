import { Column, SQL, getTableColumns, is, type Table } from 'drizzle-orm';
import type { AppDb } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import { TournamentAdminRepository } from './tournament-admin.repository';

type Row = Record<string, unknown>;

const REFEREE_USER_ID = 'referee-user-1';
const INVITER_USER_ID = 'co-organizer-1';
const TOURNAMENT_OWNER_ID = 'tournament-owner-1';
const REFEREE_EMAIL = 'minhduc@example.test';
const INVITER_EMAIL = 'mai.hoang@example.test';
const TOURNAMENT_OWNER_EMAIL = 'owner@example.test';
const INVITER_AVATAR = 'https://cdn.example.test/avatars/inviter-mai-lan-huong.png';

const users: Row[] = [
  { id: REFEREE_USER_ID, email: REFEREE_EMAIL },
  { id: INVITER_USER_ID, email: INVITER_EMAIL },
  { id: TOURNAMENT_OWNER_ID, email: TOURNAMENT_OWNER_EMAIL },
];

const profiles: Row[] = [
  {
    userId: REFEREE_USER_ID,
    fullName: 'Tran Minh Duc',
    avatarUrl: 'https://cdn.example.test/avatars/referee-tran-minh-duc.png',
  },
  { userId: INVITER_USER_ID, fullName: 'Mai Lan Huong', avatarUrl: INVITER_AVATAR },
  {
    userId: TOURNAMENT_OWNER_ID,
    fullName: 'Owner Test',
    avatarUrl: 'https://cdn.example.test/avatars/owner.png',
  },
];

const refereeInvites: Row[] = [
  {
    id: 'referee-invite-1',
    tournamentId: 'tournament-1',
    userId: REFEREE_USER_ID,
    assignedBy: INVITER_USER_ID,
    status: 'INVITED',
  },
];

const stringValues = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(stringValues);
  }
  return [];
};

/**
 * Minimal stand-in for the Drizzle query chain.
 *
 * The referee list is one select over `tournament_referees` plus whatever
 * `users`/`profiles` joins the projection declares. `columnOwner` records which
 * stored account each joined column resolves to, derived from the join condition
 * the repository actually writes — `tournamentReferees.userId` binds the referee,
 * `tournamentReferees.assignedBy` binds the inviter. Selected columns are then
 * read out of that account, so a projection that pulls the inviter's
 * `users.email` really does surface the inviter's address here instead of
 * passing by accident.
 *
 * Fixtures and projections are keyed the way the schema objects are, so a column
 * is resolved through its table property key (`userId`), never its SQL column
 * name (`user_id`).
 */
function createRepository() {
  const columnOwner = new Map<Column, string>();
  const columnKey = new Map<Column, string>();
  const query: Record<string, unknown> = {};
  let selected: Record<string, unknown> = {};

  const registerColumns = (table: Table) => {
    for (const [key, column] of Object.entries(getTableColumns(table))) {
      if (!columnKey.has(column)) {
        columnKey.set(column, key);
      }
    }
  };
  registerColumns(schema.tournamentReferees);

  const joinedAccountOf = (condition: unknown): string | undefined => {
    if (!(condition instanceof SQL)) return undefined;
    const columns = condition.queryChunks.filter((chunk): chunk is Column =>
      is(chunk, Column),
    );
    for (const column of columns) {
      if (column === schema.tournamentReferees.userId) return REFEREE_USER_ID;
      if (column === schema.tournamentReferees.assignedBy) return INVITER_USER_ID;
    }
    for (const column of columns) {
      const owner = columnOwner.get(column);
      if (owner) return owner;
    }
    return undefined;
  };

  const join = (table: Table, condition: unknown) => {
    registerColumns(table);
    const account = joinedAccountOf(condition);
    if (account) {
      for (const column of Object.values(getTableColumns(table))) {
        if (!columnOwner.has(column)) {
          columnOwner.set(column, account);
        }
      }
    }
    return query;
  };

  const readColumn = (invite: Row, column: Column): unknown => {
    const key = columnKey.get(column);
    if (!key) return undefined;
    const account = columnOwner.get(column);
    if (!account) return invite[key];
    const user = users.find((item) => item.id === account);
    if (user && key in user) return user[key];
    return profiles.find((item) => item.userId === account)?.[key];
  };

  query.from = () => query;
  query.innerJoin = join;
  query.leftJoin = join;
  query.where = () => query;
  query.orderBy = () => query;
  query.limit = () => query;
  query.then = (resolveRows: (rows: Row[]) => unknown, reject: (error: unknown) => unknown) => {
    const rows = refereeInvites.map((invite) => {
      const row: Row = {};
      for (const [key, field] of Object.entries(selected)) {
        row[key] = is(field, Column) ? readColumn(invite, field) : field;
      }
      return row;
    });
    return Promise.resolve(rows).then(resolveRows, reject);
  };

  const db = {
    select: (fields?: Record<string, unknown>) => {
      selected = fields ?? {};
      return query;
    },
  } as unknown as AppDb;

  return new TournamentAdminRepository(db);
}

describe('TournamentAdminRepository referee inviter projection', () => {
  it('resolves the inviter from assignedBy and never projects the inviter email', async () => {
    const repository = createRepository();

    const [row] = await repository.findReferees('tournament-1');

    expect(row).toMatchObject({
      id: 'referee-invite-1',
      userId: REFEREE_USER_ID,
      status: 'INVITED',
    });

    const published = stringValues(row);
    expect(published).toContain('Mai Lan Huong');
    expect(published).toContain(INVITER_AVATAR);
    // The invited referee's own contact stays; the inviter's does not.
    expect(published).toContain(REFEREE_EMAIL);
    expect(published).not.toContain(INVITER_EMAIL);
    expect(published).not.toContain(TOURNAMENT_OWNER_EMAIL);
  });
});
