import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddAthletePairsDto } from './add-athlete-pairs.dto';

const DIVISION_ID = '11111111-1111-4111-8111-111111111111';

function userIdsOf(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) =>
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  );
}

function buildDto(overrides: Record<string, unknown> = {}) {
  return plainToInstance(AddAthletePairsDto, {
    source: 'FRIENDS',
    tournamentDivisionId: DIVISION_ID,
    userIds: userIdsOf(4),
    ...overrides,
  });
}

describe('AddAthletePairsDto', () => {
  it.each([2, 25])('accepts %i distinct athletes', async (count) => {
    const errors = await validate(buildDto({ userIds: userIdsOf(count) }));

    expect(errors).toHaveLength(0);
  });

  it.each([
    ['a single athlete', { userIds: userIdsOf(1) }],
    ['26 athletes', { userIds: userIdsOf(26) }],
    [
      'a duplicated athlete',
      { userIds: [userIdsOf(1)[0], userIdsOf(1)[0]] },
    ],
    ['an unknown source', { source: 'DIRECT' }],
    ['a non-UUID division', { tournamentDivisionId: 'division-1' }],
  ])('rejects %s', async (_label, overrides) => {
    const errors = await validate(buildDto(overrides));

    expect(errors.length).toBeGreaterThan(0);
  });
});
