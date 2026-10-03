import { validateRosterRows } from './roster-import';

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

  it('reports a missing player-one email instead of silently accepting the row', () => {
    const { rows } = validateRosterRows({
      ...SINGLES,
      items: [{ teamName: 'Không email', player1Name: 'Không email' }],
    });

    expect(rows[0].status).toContain('MISSING_EMAIL');
    expect(rows[0].isEligible).toBe(false);
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
});
