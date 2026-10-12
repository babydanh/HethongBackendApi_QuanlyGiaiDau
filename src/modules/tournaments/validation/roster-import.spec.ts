import {
  rosterExistingIdentityKeys,
  rosterRowMatchesExistingIdentity,
  validateRosterRows,
} from './roster-import';

/**
 * Roster row validation is the single rule set the organizer's read-only
 * preview and the actual import commit both run, so a row the preview accepts
 * cannot be rejected by the commit for a formatting reason.
 *
 * The break this protects against: preview and commit drifting apart, so an
 * organizer corrects every red row, confirms the import, and the commit still
 * rejects a row they were told was fine.
 */
describe('validateRosterRows', () => {
  const SINGLES = { isDoubles: false, matchType: 'SINGLES' } as const;
  const DOUBLES = { isDoubles: true, matchType: 'DOUBLES' } as const;

  it('accepts a singles row with a name and a valid email', () => {
    const { rows, requestedTeamSlots } = validateRosterRows({
      ...SINGLES,
      items: [
        {
          teamName: 'Nguyen Van A',
          player1Name: 'Nguyen Van A',
          player1Email: 'athlete@example.test',
        },
      ],
    });

    expect(rows).toEqual([
      {
        rowIndex: 0,
        player1Email: 'athlete@example.test',
        player2Email: null,
        status: [],
        isEligible: true,
        capacityDelta: 1,
      },
    ]);
    expect(requestedTeamSlots).toBe(1);
  });

  it('reports a missing player-one email without refusing the row', () => {
    const { rows } = validateRosterRows({
      ...SINGLES,
      items: [{ teamName: 'Không email', player1Name: 'Không email' }],
    });

    // Still surfaced so the organizer can see the athlete has no account yet,
    // but a missing address is no longer a hard refusal.
    expect(rows[0].status).toContain('MISSING_EMAIL');
    expect(rows[0].isEligible).toBe(true);
  });

  it('still refuses two email-less rows that name the same athlete', () => {
    const { rows } = validateRosterRows({
      ...SINGLES,
      items: [
        { teamName: 'CLB A', player1Name: 'Nguyen Van A' },
        { teamName: 'CLB A', player1Name: 'Nguyen Van A' },
      ],
    });

    // With no address to compare on, team plus name is the only identity left.
    for (const row of rows) {
      expect(row.status).toContain('DUPLICATE_IN_FILE');
      expect(row.isEligible).toBe(false);
    }
  });

  it('reports a malformed player-one email', () => {
    const { rows } = validateRosterRows({
      ...SINGLES,
      items: [
        { teamName: 'Sai', player1Name: 'Sai', player1Email: 'khong-phai-email' },
      ],
    });

    expect(rows[0].status).toContain('INVALID_EMAIL');
  });

  it('reports a missing player-one name', () => {
    const { rows } = validateRosterRows({
      ...SINGLES,
      items: [
        { teamName: 'Trống tên', player1Name: '   ', player1Email: 'a@b.test' },
      ],
    });

    expect(rows[0].status).toContain('MISSING_NAME');
  });

  it('flags the same address on two rows as a duplicate in the file, on both rows', () => {
    const { rows, requestedTeamSlots } = validateRosterRows({
      ...SINGLES,
      items: [
        { player1Name: 'A', player1Email: 'same@example.test' },
        { player1Name: 'B', player1Email: '  SAME@example.test ' },
      ],
    });

    expect(rows[0].status).toContain('DUPLICATE_IN_FILE');
    expect(rows[1].status).toContain('DUPLICATE_IN_FILE');
    expect(rows[0].isEligible).toBe(false);
    expect(rows[1].isEligible).toBe(false);
    expect(requestedTeamSlots).toBe(0);
  });

  it('flags an address that already exists in the tournament as a tournament duplicate', () => {
    const { rows } = validateRosterRows({
      ...SINGLES,
      existingEmails: new Set(['already@example.test']),
      items: [
        { player1Name: 'A', player1Email: 'already@example.test' },
      ],
    });

    expect(rows[0].status).toContain('DUPLICATE_IN_TOURNAMENT');
  });

  it('allows a lone athlete in a doubles row while charging half a team', () => {
    const { rows, requestedTeamSlots } = validateRosterRows({
      ...DOUBLES,
      items: [{ player1Name: 'A', player1Email: 'a@example.test' }],
    });

    expect(rows[0].isEligible).toBe(true);
    expect(rows[0].capacityDelta).toBe(0.5);
    expect(requestedTeamSlots).toBe(0.5);
  });

  it('requires a name and email when any second-player detail is present', () => {
    const { rows } = validateRosterRows({
      ...DOUBLES,
      items: [
        {
          player1Name: 'A',
          player1Email: 'a@example.test',
          player2Email: 'b@example.test',
        },
      ],
    });

    expect(rows[0].status).toContain('PLAYER2_REQUIRED');
  });

  it('requires an email for a named second athlete', () => {
    const { rows } = validateRosterRows({
      ...DOUBLES,
      items: [
        {
          player1Name: 'A',
          player1Email: 'a@example.test',
          player2Name: 'B',
        },
      ],
    });

    expect(rows[0].status).toContain('MISSING_EMAIL');
  });


  it('rejects a second athlete on a singles row', () => {
    const { rows } = validateRosterRows({
      ...SINGLES,
      items: [
        {
          player1Name: 'A',
          player1Email: 'a@example.test',
          player2Name: 'B',
          player2Email: 'b@example.test',
        },
      ],
    });

    expect(rows[0].status).toContain('PLAYER2_NOT_ALLOWED');
  });

  it('charges a doubles pair one whole team and a lone athlete half a team', () => {
    const { requestedTeamSlots } = validateRosterRows({
      ...DOUBLES,
      items: [
        {
          player1Name: 'A',
          player1Email: 'a@example.test',
          player2Name: 'B',
          player2Email: 'b@example.test',
        },
        { player1Name: 'C', player1Email: 'c@example.test' },
      ],
    });

    // A pair owns a team; an unpaired athlete takes half of one.
    expect(requestedTeamSlots).toBe(1.5);
  });

  it('charges a singles row one whole team per athlete', () => {
    const { requestedTeamSlots } = validateRosterRows({
      ...SINGLES,
      items: [
        { player1Name: 'A', player1Email: 'a@example.test' },
        { player1Name: 'B', player1Email: 'b@example.test' },
      ],
    });

    expect(requestedTeamSlots).toBe(2);
  });

  it('reports a malformed second-athlete email', () => {
    const { rows } = validateRosterRows({
      ...DOUBLES,
      items: [
        {
          player1Name: 'A',
          player1Email: 'a@example.test',
          player2Name: 'B',
          player2Email: 'sai-dinh-dang',
        },
      ],
    });

    expect(rows[0].status).toContain('INVALID_EMAIL');
  });
  it('flags a division name that is not in the tournament', () => {
    const { rows } = validateRosterRows({
      ...SINGLES,
      divisionNames: ['Open Singles'],
      items: [
        {
          player1Name: 'A',
          player1Email: 'a@example.test',
          divisionName: 'Unknown Division',
        },
      ],
    });

    expect(rows[0].status).toContain('DIVISION_UNKNOWN');
    expect(rows[0].isEligible).toBe(false);
  });

  describe('batch rules (identityFallback)', () => {
    const batch = { identityFallback: true } as const;

    it('lets an account-linked row omit the name, because the commit fills it from the account', () => {
      const { rows } = validateRosterRows({
        ...SINGLES,
        ...batch,
        accountEmails: new Set(['linked@example.test']),
        items: [
          { teamName: 'Đội A', player1Name: '', player1Email: 'linked@example.test' },
        ],
      });

      expect(rows[0].status).not.toContain('MISSING_NAME');
    });

    it('still requires a name when the row has no linked account', () => {
      const { rows } = validateRosterRows({
        ...SINGLES,
        ...batch,
        accountEmails: new Set(['linked@example.test']),
        items: [
          { teamName: 'Đội B', player1Name: '', player1Email: 'unlinked@example.test' },
        ],
      });

      expect(rows[0].status).toContain('MISSING_NAME');
    });

    it('flags a no-address row whose identity already exists in the tournament', () => {
      const existingKeys = rosterExistingIdentityKeys('Đội C', 'Trần Văn C');
      const { rows } = validateRosterRows({
        ...SINGLES,
        ...batch,
        divisionNames: ['Đơn nam'],
        existingIdentityKeys: new Set(existingKeys),
        items: [{ teamName: 'Đội C', divisionName: 'Đơn nam', player1Name: 'Trần Văn C' }],
      });

      expect(rows[0].status).toContain('DUPLICATE_IN_TOURNAMENT');
    });

    it('flags a named row against an entry stored without a name for the same team', () => {
      const existingKeys = rosterExistingIdentityKeys('Đội E', null);
      const { rows } = validateRosterRows({
        ...SINGLES,
        ...batch,
        divisionNames: ['Đơn nam'],
        existingIdentityKeys: new Set(existingKeys),
        items: [{ teamName: 'Đội E', divisionName: 'Đơn nam', player1Name: 'Nguyễn Văn E' }],
      });

      expect(rows[0].status).toContain('DUPLICATE_IN_TOURNAMENT');
    });

    it('does not flag a different athlete from the same team', () => {
      const existingKeys = rosterExistingIdentityKeys('Đội F', 'Lê Văn F');
      const { rows } = validateRosterRows({
        ...SINGLES,
        ...batch,
        divisionNames: ['Đơn nam'],
        existingIdentityKeys: new Set(existingKeys),
        items: [{ teamName: 'Đội F', divisionName: 'Đơn nam', player1Name: 'Phạm Văn F' }],
      });

      expect(rows[0].status).not.toContain('DUPLICATE_IN_TOURNAMENT');
    });

    it('does not apply the identity check without the batch flag', () => {
      const existingKeys = rosterExistingIdentityKeys('Đội C', 'Trần Văn C');
      const { rows } = validateRosterRows({
        ...SINGLES,
        divisionNames: ['Đơn nam'],
        existingIdentityKeys: new Set(existingKeys),
        items: [{ teamName: 'Đội C', divisionName: 'Đơn nam', player1Name: 'Trần Văn C' }],
      });

      expect(rows[0].status).not.toContain('DUPLICATE_IN_TOURNAMENT');
    });

    it('does not require a typed name for player two when player two has an account', () => {
      const { rows } = validateRosterRows({
        ...DOUBLES,
        ...batch,
        accountEmails: new Set(['partner@example.test']),
        items: [
          {
            teamName: 'Đôi D',
            player1Name: 'Lê Văn D',
            player1Email: 'lead@example.test',
            player2Email: 'partner@example.test',
            player2Name: '',
          },
        ],
      });

      expect(rows[0].status).not.toContain('PLAYER2_REQUIRED');
    });

    it('still requires a typed name for player two when player two has no account', () => {
      const { rows } = validateRosterRows({
        ...DOUBLES,
        ...batch,
        accountEmails: new Set(['someone-else@example.test']),
        items: [
          {
            teamName: 'Đôi E',
            player1Name: 'Phạm Văn E',
            player1Email: 'lead2@example.test',
            player2Email: 'unlinked2@example.test',
            player2Name: '',
          },
        ],
      });

      expect(rows[0].status).toContain('PLAYER2_REQUIRED');
    });

    it('counts a player two backed by an account as a second athlete in requested slots', () => {
      const withAccount = validateRosterRows({
        ...DOUBLES,
        ...batch,
        accountEmails: new Set(['partner3@example.test']),
        items: [
          {
            teamName: 'Đôi F',
            player1Name: 'Hoàng Văn F',
            player1Email: 'lead3@example.test',
            player2Email: 'partner3@example.test',
            player2Name: '',
          },
        ],
      });
      const withName = validateRosterRows({
        ...DOUBLES,
        ...batch,
        items: [
          {
            teamName: 'Đôi F',
            player1Name: 'Hoàng Văn F',
            player1Email: 'lead3@example.test',
            player2Email: 'partner3@example.test',
            player2Name: 'Đinh Văn F',
          },
        ],
      });

      expect(withAccount.requestedTeamSlots).toBe(withName.requestedTeamSlots);
    });
  });
});

describe('existing identity matching', () => {
  it('never matches a row against an entry that has no team name', () => {
    const keys = new Set(rosterExistingIdentityKeys('   ', 'Trần Văn C'));

    expect(rosterRowMatchesExistingIdentity(keys, 'Đội C', 'Trần Văn C')).toBe(false);
  });

  it('matches a row without a name against any entry of the same team', () => {
    const keys = new Set(rosterExistingIdentityKeys('Đội G', 'Trần Văn G'));

    expect(rosterRowMatchesExistingIdentity(keys, 'Đội G', '')).toBe(true);
    expect(rosterRowMatchesExistingIdentity(keys, 'Đội khác', '')).toBe(false);
  });

  it('matches a named row against an entry stored without a name for the same team', () => {
    const keys = new Set(rosterExistingIdentityKeys('Đội I', null));

    expect(rosterRowMatchesExistingIdentity(keys, 'Đội I', 'Ai đó')).toBe(true);
    expect(rosterRowMatchesExistingIdentity(keys, 'Đội khác', 'Ai đó')).toBe(false);
  });

  it('compares team and name case-insensitively', () => {
    const keys = new Set(rosterExistingIdentityKeys('Đội H', 'Trần Văn H'));

    expect(rosterRowMatchesExistingIdentity(keys, 'ĐỘI H', 'trần văn h')).toBe(true);
  });
});
