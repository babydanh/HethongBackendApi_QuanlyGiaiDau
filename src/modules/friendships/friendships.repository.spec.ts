import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { FriendshipsRepository } from './friendships.repository';

const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';

describe('FriendshipsRepository.profilesFor', () => {
  it('binds multiple profile IDs as a valid Drizzle IN query and preserves the map', async () => {
    const rows = [
      { id: firstId, name: 'First Friend', avatar: '/first.png' },
      { id: secondId, name: 'Second Friend', avatar: null },
    ];
    let whereCondition: SQL | undefined;
    const query = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn((condition: SQL) => {
        whereCondition = condition;
        return Promise.resolve(rows);
      }),
    };
    const db = { select: jest.fn().mockReturnValue(query) };
    const repository = new FriendshipsRepository(db as never);

    const profiles = await repository.profilesFor([firstId, secondId]);

    if (!whereCondition) throw new Error('Expected a profile lookup predicate');
    const compiled = new PgDialect().sqlToQuery(whereCondition);
    expect(compiled.sql).toMatch(/\bin\s*\(\$1,\s*\$2\)/i);
    expect(compiled.params).toEqual([firstId, secondId]);
    expect([...profiles.entries()]).toEqual([
      [firstId, { name: 'First Friend', avatar: '/first.png' }],
      [secondId, { name: 'Second Friend', avatar: null }],
    ]);
  });
});
