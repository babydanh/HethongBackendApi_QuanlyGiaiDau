import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  assertRosterBatchCapacityHasRoom,
  fingerprintRosterImportBatch,
  groupRosterBatchCapacityClaims,
  markRosterBatchDuplicateEmails,
  resolveConfirmedRosterUserId,
  validateRosterImportBatchGroups,
  validateRosterImportCustomResponses,
  validateRosterImportIdempotencyKey,
  type ValidatedRosterImportBatchGroup,
} from './roster-import-batch';

const makeGroup = (
  divisionId: string | null,
  participants: Array<Record<string, unknown>>,
): ValidatedRosterImportBatchGroup => ({
  divisionId,
  participants,
  rows: participants.map((_, rowIndex) => ({
    rowIndex,
    player1Email: '',
    player2Email: null,
    status: [],
    isEligible: true,
    capacityDelta: 1,
  })),
  requestedTeamSlots: participants.length,
});

describe('roster import batch limits', () => {
  it('counts both members of a doubles row toward the workbook limit', () => {
    const groups = [
      makeGroup(
        'division-1',
        Array.from({ length: 250 }, () => ({
          player1Email: 'one@example.test',
          player2Name: 'Partner',
          player2Email: 'two@example.test',
        })),
      ),
    ];

    expect(validateRosterImportBatchGroups(groups)).toBe(500);
  });

  it('rejects a workbook with more than 500 people before any write', () => {
    const groups = [
      makeGroup(
        'division-1',
        Array.from({ length: 251 }, () => ({
          player1Email: 'one@example.test',
          player2Name: 'Partner',
        })),
      ),
    ];

    expect(() => validateRosterImportBatchGroups(groups)).toThrow(
      BadRequestException,
    );
  });

  it('rejects duplicate division groups and empty groups', () => {
    expect(() =>
      validateRosterImportBatchGroups([
        makeGroup('division-1', [{ player1Email: 'a@example.test' }]),
        makeGroup('division-1', [{ player1Email: 'b@example.test' }]),
      ]),
    ).toThrow(BadRequestException);

    expect(() =>
      validateRosterImportBatchGroups([makeGroup(null, [])]),
    ).toThrow(BadRequestException);
  });
});

describe('roster import batch duplicate detection', () => {
  it('blocks duplicate email identities across different divisions', () => {
    const first = makeGroup('division-1', [
      { player1Email: 'shared@example.test' },
    ]);
    const second = makeGroup('division-2', [
      { player2Email: 'SHARED@example.test' },
    ]);

    const result = markRosterBatchDuplicateEmails([first, second]);

    expect(result.map((group) => group.rows[0].status)).toEqual([
      ['DUPLICATE_IN_FILE'],
      ['DUPLICATE_IN_FILE'],
    ]);
    expect(result.every((group) => group.rows[0].isEligible === false)).toBe(
      true,
    );
    expect(result.map((group) => group.requestedTeamSlots)).toEqual([0, 0]);
  });
});

describe('explicit roster account confirmation', () => {
  const candidates = new Map([
    ['player@example.test', { id: 'user-exact', email: 'player@example.test' }],
  ]);

  it('does not link a discovered account until the organizer selects it', () => {
    expect(
      resolveConfirmedRosterUserId(
        'PLAYER@example.test',
        undefined,
        candidates,
      ),
    ).toBeNull();
  });

  it('accepts only the selected candidate for the exact normalized email', () => {
    expect(
      resolveConfirmedRosterUserId(
        'PLAYER@example.test',
        'user-exact',
        candidates,
      ),
    ).toBe('user-exact');
  });

  it('rejects a selected account that does not match the row email', () => {
    expect(() =>
      resolveConfirmedRosterUserId(
        'player@example.test',
        'user-with-same-name',
        candidates,
      ),
    ).toThrow(ConflictException);
  });
});

describe('roster import batch request fingerprint', () => {
  it('is stable across object key order but changes with row data', () => {
    const first = {
      groups: [{ divisionId: 'division-1', participants: [{ player1Name: 'A', player1Email: 'a@example.test' }] }],
    };
    const sameRequest = {
      groups: [{ divisionId: 'division-1', participants: [{ player1Email: 'a@example.test', player1Name: 'A' }] }],
    };
    const changedRequest = {
      groups: [{ divisionId: 'division-1', participants: [{ player1Name: 'A', player1Email: 'b@example.test' }] }],
    };

    expect(fingerprintRosterImportBatch(first)).toBe(
      fingerprintRosterImportBatch(sameRequest),
    );
    expect(fingerprintRosterImportBatch(first)).not.toBe(
      fingerprintRosterImportBatch(changedRequest),
    );
  });
});

describe('roster import idempotency key validation', () => {
  it('accepts opaque non-whitespace keys up to 128 characters', () => {
    expect(validateRosterImportIdempotencyKey('k'.repeat(128))).toBe(
      'k'.repeat(128),
    );
  });

  it.each(['', ' with-space', 'with space', 'x'.repeat(129), undefined])(
    'rejects invalid key %s',
    (key) => {
      expect(() => validateRosterImportIdempotencyKey(key)).toThrow(
        BadRequestException,
      );
    },
  );
});

describe('allowlisted roster custom responses', () => {
  const form = {
    status: 'PUBLISHED',
    divisionIds: ['division-1'],
    fields: [
      {
        id: 'custom_age',
        type: 'NUMBER',
        label: 'Age',
        required: true,
        min: 1,
        max: 99,
      },
      { id: 'custom_size', type: 'SELECT', options: ['S', 'M', 'L'] },
    ],
  };

  it('normalizes allowed values and retains bounded notes', () => {
    expect(
      validateRosterImportCustomResponses(
        {
          custom_age: '21',
          custom_size: 'M',
          notes: '  keep private  ',
          sourceFileName: 'roster.xlsx',
          sourceRowIndex: 7,
          sourceSheetName: 'Singles',
        },
        form,
        'division-1',
      ),
    ).toEqual({
      custom_age: 21,
      custom_size: 'M',
      notes: 'keep private',
      sourceFileName: 'roster.xlsx',
      sourceRowIndex: 7,
      sourceSheetName: 'Singles',
    });
  });

  it('retains exact file and row provenance alongside notes', () => {
    expect(
      validateRosterImportCustomResponses(
        { sourceRowIndex: 2, sourceFileName: 'f.xlsx', notes: 'x' },
        {
          status: 'PUBLISHED',
          divisionIds: ['division-1'],
          fields: [],
        },
        'division-1',
      ),
    ).toEqual({
      sourceRowIndex: 2,
      sourceFileName: 'f.xlsx',
      notes: 'x',
    });
  });
  it.each([
    { sourceFileName: '' },
    { sourceFileName: 'f'.repeat(32) },
    { sourceRowIndex: 0 },
    { sourceRowIndex: 1.5 },
    { sourceSheetName: 'S'.repeat(32) },
  ])('rejects malformed provenance fields: %j', (provenance) => {
    expect(() =>
      validateRosterImportCustomResponses(
        { custom_age: '21', ...provenance },
        form,
        'division-1',
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects keys not present in the published form', () => {
    expect(() =>
      validateRosterImportCustomResponses(
        { arbitrary_column: 'secret' },
        form,
        'division-1',
      ),
    ).toThrow(BadRequestException);
  });

  it('requires all applicable required form fields', () => {
    expect(() =>
      validateRosterImportCustomResponses({}, form, 'division-1'),
    ).toThrow(BadRequestException);
  });

  it('rejects booleans as numeric form answers', () => {
    expect(() =>
      validateRosterImportCustomResponses(
        { custom_age: true },
        form,
        'division-1',
      ),
    ).toThrow(BadRequestException);
  });

  it('does not accept custom fields when the published form excludes the division', () => {
    expect(() =>
      validateRosterImportCustomResponses(
        { custom_age: '21' },
        form,
        'division-2',
      ),
    ).toThrow(BadRequestException);
  });
});

describe('roster batch capacity claims', () => {
  it('aggregates divisions sharing a tournament-owned cap before checking room', () => {
    const claims = groupRosterBatchCapacityClaims([
      {
        ownerKey: 'tournament:tournament-1',
        occupiedTeamSlots: 3,
        maxTeamSlots: 4,
        requestedTeamSlots: 1,
      },
      {
        ownerKey: 'tournament:tournament-1',
        occupiedTeamSlots: 3,
        maxTeamSlots: 4,
        requestedTeamSlots: 1,
      },
    ]);

    expect(claims).toEqual([
      {
        ownerKey: 'tournament:tournament-1',
        occupiedTeamSlots: 3,
        maxTeamSlots: 4,
        requestedTeamSlots: 2,
      },
    ]);
    expect(() => assertRosterBatchCapacityHasRoom(claims)).toThrow(
      BadRequestException,
    );
  });

  it('keeps independently capped divisions separate', () => {
    const claims = groupRosterBatchCapacityClaims([
      {
        ownerKey: 'division:division-1',
        occupiedTeamSlots: 1,
        maxTeamSlots: 2,
        requestedTeamSlots: 1,
      },
      {
        ownerKey: 'division:division-2',
        occupiedTeamSlots: 1,
        maxTeamSlots: 2,
        requestedTeamSlots: 1,
      },
    ]);

    expect(claims).toHaveLength(2);
    expect(() => assertRosterBatchCapacityHasRoom(claims)).not.toThrow();
  });
});
