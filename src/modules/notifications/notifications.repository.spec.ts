import { Column, Param, SQL, getTableColumns, is, type Table } from 'drizzle-orm';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { NOTIFICATION_TYPES } from './notification-types';
import { NotificationsRepository } from './notifications.repository';
import type { QueryNotificationsDto } from './dto/query-notifications.dto';

type Row = Record<string, unknown>;

const EMAIL_SHAPED = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The inviting manager is a co-organizer, not the tournament owner, so an
// attribution that silently falls back to the creator cannot pass by accident.
const MANAGER_ID = 'co-organizer-1';
const REFEREE_ID = 'referee-user-1';
const MANAGER_EMAIL = 'mai.hoang@example.test';
const REFEREE_EMAIL = 'minhduc@example.test';
const MANAGER_AVATAR = 'https://cdn.example.test/avatars/inviter-mai-lan-huong.png';

const users: Row[] = [
  { id: MANAGER_ID, email: MANAGER_EMAIL },
  { id: REFEREE_ID, email: REFEREE_EMAIL },
];

const profiles: Row[] = [
  { userId: MANAGER_ID, fullName: 'Mai Lan Huong', avatarUrl: MANAGER_AVATAR },
  { userId: REFEREE_ID, fullName: 'Tran Minh Duc', avatarUrl: null },
];

const notifications: Row[] = [
  {
    id: 'notification-invite',
    receiverId: REFEREE_ID,
    senderId: MANAGER_ID,
    type: NOTIFICATION_TYPES.REFEREE_INVITED,
    title: 'Ban co loi moi lam trong tai',
    content: 'Ban to chuc vua moi ban tham gia dieu hanh gia Synthetic Inviter Tournament.',
    redirectUrl: '/notifications?action=referee-invite',
    isRead: false,
    createdAt: new Date('2026-10-02T00:00:00.000Z'),
  },
  {
    id: 'notification-revoked',
    receiverId: REFEREE_ID,
    senderId: MANAGER_ID,
    type: NOTIFICATION_TYPES.REFEREE_INVITE_REVOKED,
    title: 'Loi moi da bi thu hoi',
    content: 'Ban to chuc da thu hoi loi moi cua ban.',
    redirectUrl: null,
    isRead: true,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
  },
  {
    id: 'notification-without-sender',
    receiverId: REFEREE_ID,
    senderId: null,
    type: NOTIFICATION_TYPES.REFEREE_INVITED,
    title: 'Loi moi lam trong tai',
    content: 'Ban co loi moi lam trong tai cho mot giai khac.',
    redirectUrl: null,
    isRead: true,
    createdAt: new Date('2026-09-30T00:00:00.000Z'),
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

const collectBoundValues = (node: unknown, found: unknown[] = []): unknown[] => {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const item of node) collectBoundValues(item, found);
    return found;
  }
  if (node instanceof Param) {
    found.push(node.value);
    return found;
  }
  if (node instanceof SQL) {
    for (const chunk of node.queryChunks) collectBoundValues(chunk, found);
  }
  return found;
};

/**
 * Minimal stand-in for the Drizzle query chain.
 *
 * The receiver read is one select over `notifications` plus the sender profile
 * join. Joined columns are read out of the stored account the join resolves to,
 * so a projection that pulls the sender's `users.email` really does surface it
 * here instead of passing by accident. The sender profile only resolves when
 * the join is restricted to the referee invitation type.
 */
function createRepository() {
  const valueByColumn = new Map<Column, (row: Row) => unknown>();
  const joinedBoundValues: unknown[] = [];
  const registerColumns = (
    table: Table,
    resolve: (row: Row, key: string) => unknown,
  ) => {
    for (const [key, column] of Object.entries(getTableColumns(table))) {
      valueByColumn.set(column, (row) => resolve(row, key));
    }
  };
  registerColumns(schema.notifications, (row, key) => row[key] ?? null);
  // Joined sender-side columns resolve against the stored sender account.
  registerColumns(
    schema.profiles,
    (row, key) =>
      row.type === NOTIFICATION_TYPES.REFEREE_INVITED &&
      joinedBoundValues.includes(NOTIFICATION_TYPES.REFEREE_INVITED)
        ? profiles.find((item) => item.userId === row.senderId)?.[key] ?? null
        : null,
  );
  registerColumns(
    schema.users,
    (row, key) => users.find((item) => item.id === row.senderId)?.[key] ?? null,
  );

  const query: Record<string, unknown> = {};
  let selected: Record<string, unknown> = {};

  query.from = () => query;
  query.leftJoin = (_table: Table, condition: unknown) => {
    joinedBoundValues.push(...collectBoundValues(condition));
    return query;
  };
  query.where = () => query;
  query.orderBy = () => query;
  query.limit = () => query;
  query.$dynamic = () => query;
  query.then = (
    resolveRows: (rows: Row[]) => unknown,
    reject: (error: unknown) => unknown,
  ) => {
    const rows =
      'count' in selected
        ? [{ count: notifications.length }]
        : notifications.map((row) => {
            const projected: Row = {};
            for (const [key, field] of Object.entries(selected)) {
              const resolve = is(field, Column)
                ? valueByColumn.get(field)
                : undefined;
              projected[key] = resolve ? resolve(row) : field;
            }
            return projected;
          });
    return Promise.resolve(rows).then(resolveRows, reject);
  };

  const db = {
    select: (fields?: Record<string, unknown>) => {
      selected = fields ?? {};
      return query;
    },
  } as unknown as AppDb;

  return new NotificationsRepository(db);
}

describe('NotificationsRepository recipient read sender attribution', () => {
  it('carries the inviter display name and avatar on a referee invitation', async () => {
    const { data } = await createRepository().getNotificationsByUser(
      REFEREE_ID,
      { scope: 'player' } as QueryNotificationsDto,
    );
    const invitation = data.find((item) => item.id === 'notification-invite');

    expect(invitation).toMatchObject({
      receiverId: REFEREE_ID,
      senderId: MANAGER_ID,
      senderName: 'Mai Lan Huong',
      senderAvatarUrl: MANAGER_AVATAR,
    });

    const published = stringValues(invitation);
    expect(published).not.toContain(MANAGER_EMAIL);
    expect(published).not.toContain(REFEREE_EMAIL);
    expect(published.filter((value) => EMAIL_SHAPED.test(value))).toEqual([]);
  });

  it('keeps attribution null when the stored sender has no identity to show', async () => {
    const { data } = await createRepository().getNotificationsByUser(
      REFEREE_ID,
      { scope: 'player' } as QueryNotificationsDto,
    );
    const withoutSender = data.find(
      (item) => item.id === 'notification-without-sender',
    );

    expect(withoutSender).toMatchObject({
      senderId: null,
      senderName: null,
      senderAvatarUrl: null,
    });
  });

  it('does not publish a sender identity on notification types outside the referee invitation', async () => {
    const { data } = await createRepository().getNotificationsByUser(
      REFEREE_ID,
      { scope: 'player' } as QueryNotificationsDto,
    );
    const revoked = data.find((item) => item.id === 'notification-revoked');

    expect(revoked).toMatchObject({
      senderId: MANAGER_ID,
      senderName: null,
      senderAvatarUrl: null,
    });
  });
});
