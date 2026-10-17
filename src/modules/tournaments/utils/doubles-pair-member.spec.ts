import {
  countParticipantMembers,
  readPairSlots,
  resolveSingleMember,
  singleMemberResponses,
  writePairSlots,
} from './doubles-pair-member';

const guest = {
  teamName: 'Khách A',
  customResponses: {
    importedFrom: 'ORGANIZER_DIRECT',
    player1Email: 'a@example.test',
  },
};

describe('doubles pair members', () => {
  it('counts a direct guest with no roster as one athlete', () => {
    expect(countParticipantMembers(guest.customResponses, 0)).toBe(1);
    expect(countParticipantMembers({ importedFrom: 'ROSTER_IMPORT' }, 0)).toBe(
      0,
    );
    expect(countParticipantMembers(null, 2)).toBe(2);
  });

  it('counts an organizer import by the athletes it names, whatever its rosters', () => {
    expect(countParticipantMembers({ importedFrom: 'EXCEL', player1Name: 'A' }, 0)).toBe(1);
    expect(
      countParticipantMembers({ importedFrom: 'AI_EXCEL', player2Name: 'B' }, 0),
    ).toBe(2);
    expect(
      countParticipantMembers({ importedFrom: 'GOOGLE_FORM', player2Email: 'b@x.test' }, 1),
    ).toBe(2);
    expect(countParticipantMembers({ importedFrom: 'MANUAL_EMAIL' }, 1)).toBe(1);
    expect(countParticipantMembers({ importedFrom: 'EXCEL' }, 2)).toBe(2);
  });

  it('resolves an imported entry with an account but a named athlete 2 as no single athlete', () => {
    expect(
      resolveSingleMember(
        { teamName: 'A / B', customResponses: { importedFrom: 'EXCEL', player2Name: 'B' } },
        [{ userId: 'u1' }],
      ),
    ).toBeNull();
  });

  it('resolves exactly one athlete: one roster, or a direct guest', () => {
    expect(
      resolveSingleMember(
        { teamName: 'x', customResponses: null },
        [{ userId: 'u1' }],
        () => 'An',
      ),
    ).toEqual({
      kind: 'ACCOUNT',
      userId: 'u1',
      name: 'An',
    });
    expect(resolveSingleMember(guest, [])).toEqual({
      kind: 'GUEST',
      name: 'Khách A',
      email: 'a@example.test',
      phone: null,
    });
  });

  it('rejects a side that is not a single athlete', () => {
    expect(
      resolveSingleMember({ teamName: 'x', customResponses: null }, []),
    ).toBeNull();
    expect(
      resolveSingleMember(guest, [{ userId: 'u1' }, { userId: 'u2' }]),
    ).toBeNull();
    const paired = writePairSlots(
      guest.customResponses,
      { kind: 'GUEST', name: 'Khách A', email: null, phone: null },
      { kind: 'GUEST', name: 'Khách B', email: null, phone: null },
    );
    expect(
      resolveSingleMember(
        { teamName: 'Khách A / Khách B', customResponses: paired },
        [],
      ),
    ).toBeNull();
  });

  it('round-trips both athletes through the pair slots and back to a single guest', () => {
    const account = { kind: 'ACCOUNT' as const, userId: 'u1', name: 'An' };
    const visitor = {
      kind: 'GUEST' as const,
      name: 'Khách A',
      email: 'a@example.test',
      phone: null,
    };
    const pair = writePairSlots({ note: 'giữ' }, account, visitor);

    expect(pair).toMatchObject({
      note: 'giữ',
      player1Name: 'An',
      player1UserId: 'u1',
      player2Name: 'Khách A',
      player2UserId: null,
    });
    expect(readPairSlots(pair)).toEqual([account, visitor]);

    expect(singleMemberResponses(pair, visitor)).toEqual({
      note: 'giữ',
      importedFrom: 'ORGANIZER_DIRECT',
      player1Email: 'a@example.test',
    });
    expect(singleMemberResponses(pair, account)).toEqual({ note: 'giữ' });
  });

  it('does not read slots from an ordinary import row', () => {
    expect(readPairSlots({ player1Name: 'A', player2Name: 'B' })).toBeNull();
  });

  it('TC-BTCPAIR-08 marks a pair holding a guest as an organizer import, so capacity counts one full team', () => {
    const account = { kind: 'ACCOUNT' as const, userId: 'u1', name: 'An' };
    const visitor = {
      kind: 'GUEST' as const,
      name: 'Khách A',
      email: null,
      phone: null,
    };

    const accountFirst = writePairSlots({}, account, visitor);
    expect(accountFirst).toMatchObject({ importedFrom: 'ORGANIZER_DIRECT' });
    expect(countParticipantMembers(accountFirst, 1)).toBe(2);

    const guestFirst = writePairSlots({}, visitor, account);
    expect(guestFirst).toMatchObject({ importedFrom: 'ORGANIZER_DIRECT' });

    expect(
      writePairSlots({ importedFrom: 'EXCEL' }, account, visitor),
    ).toMatchObject({ importedFrom: 'EXCEL' });
  });

  it('TC-BTCPAIR-08 leaves an account-only pair without an organizer marker', () => {
    const first = { kind: 'ACCOUNT' as const, userId: 'u1', name: 'An' };
    const second = { kind: 'ACCOUNT' as const, userId: 'u2', name: 'Bình' };

    expect(writePairSlots({}, first, second)).not.toHaveProperty(
      'importedFrom',
    );
  });
});
