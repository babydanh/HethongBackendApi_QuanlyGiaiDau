import {
  calculateOccupiedTeamSlots,
  calculateRequestedTeamSlots,
  isDoublesParticipantPairable,
  resolveCapacityUnit,
  resolveDoublesParticipantStatus,
  resolveNonDoublesParticipantStatus,
} from './tournament-participant-status';

describe('non-doubles participant registration status', () => {
  it('holds quick-created approval-mode registrations for organizer review', () => {
    expect(
      resolveNonDoublesParticipantStatus({
        registrationMode: 'APPROVAL',
        waitlisted: false,
        incompleteRoster: false,
      }),
    ).toBe('PENDING_APPROVAL');
  });

  it('keeps explicitly open registrations immediately complete', () => {
    expect(
      resolveNonDoublesParticipantStatus({
        registrationMode: 'OPEN',
        waitlisted: false,
        incompleteRoster: false,
      }),
    ).toBe('COMPLETE');
  });

  it('preserves waitlist precedence over approval', () => {
    expect(
      resolveNonDoublesParticipantStatus({
        registrationMode: 'APPROVAL',
        waitlisted: true,
        incompleteRoster: false,
      }),
    ).toBe('WAITLISTED');
  });

  it('keeps an incomplete football roster pending roster completion', () => {
    expect(
      resolveNonDoublesParticipantStatus({
        registrationMode: 'APPROVAL',
        waitlisted: false,
        incompleteRoster: true,
      }),
    ).toBe('PENDING');
  });
});

describe('doubles participant approval transitions', () => {
  it('holds an approval-mode individual registration until BTC review', () => {
    expect(
      resolveDoublesParticipantStatus({
        event: 'REGISTER',
        registrationMode: 'APPROVAL',
        waitlisted: false,
      }),
    ).toBe('PENDING_APPROVAL');
  });

  it.each(['OPEN', 'INVITE_ONLY', undefined])(
    'keeps immediate pairing when registrationMode is %s',
    (registrationMode) => {
      expect(
        resolveDoublesParticipantStatus({
          event: 'REGISTER',
          registrationMode,
          waitlisted: false,
        }),
      ).toBe('PENDING_PARTNER');
    },
  );

  it('holds registration for review in approval mode even for Lite tournaments', () => {
    expect(
      resolveDoublesParticipantStatus({
        event: 'REGISTER',
        registrationMode: 'APPROVAL',
        waitlisted: false,
        isLite: true,
        pairingMode: 'ORGANIZER',
        rosterCount: 1,
        hasPartnerInvite: false,
      }),
    ).toBe('PENDING_APPROVAL');
    expect(
      resolveDoublesParticipantStatus({
        event: 'APPROVE',
        registrationMode: 'APPROVAL',
        isLite: true,
        isDoubles: true,
        rosterCount: 1,
      }),
    ).toBe('PENDING_PARTNER');
  });

  it('keeps a self-invite available until its partner joins in approval mode', () => {
    expect(
      resolveDoublesParticipantStatus({
        event: 'REGISTER',
        registrationMode: 'APPROVAL',
        waitlisted: false,
        pairingMode: 'SELF',
        rosterCount: 1,
        hasPartnerInvite: true,
      }),
    ).toBe('PENDING_PARTNER');
  });
  it('does not expose a self-pairing choice without its invite token', () => {
    expect(
      resolveDoublesParticipantStatus({
        event: 'REGISTER',
        registrationMode: 'APPROVAL',
        waitlisted: false,
        pairingMode: 'SELF',
        rosterCount: 1,
        hasPartnerInvite: false,
      }),
    ).toBe('PENDING_APPROVAL');
  });

  it('promotes a complete OPEN waitlist pair directly to complete', () => {
    expect(
      resolveDoublesParticipantStatus({
        event: 'REGISTER',
        registrationMode: 'OPEN',
        waitlisted: false,
        pairingMode: 'SELF',
        rosterCount: 2,
        hasPartnerInvite: false,
      }),
    ).toBe('COMPLETE');
  });

  it('preserves waitlist precedence over approval', () => {
    expect(
      resolveDoublesParticipantStatus({
        event: 'REGISTER',
        registrationMode: 'APPROVAL',
        waitlisted: true,
      }),
    ).toBe('WAITLISTED');
  });

  it('moves an approved one-player doubles entry into the pairing queue', () => {
    expect(
      resolveDoublesParticipantStatus({
        event: 'APPROVE',
        registrationMode: 'APPROVAL',
        isDoubles: true,
        rosterCount: 1,
      }),
    ).toBe('PENDING_PARTNER');
  });

  it('completes an already paired registration when BTC approves it', () => {
    expect(
      resolveDoublesParticipantStatus({
        event: 'APPROVE',
        registrationMode: 'APPROVAL',
        isDoubles: true,
        rosterCount: 2,
      }),
    ).toBe('COMPLETE');
  });

  it('keeps non-approval participant approval behavior unchanged', () => {
    expect(
      resolveDoublesParticipantStatus({
        event: 'APPROVE',
        registrationMode: 'OPEN',
        isDoubles: true,
        rosterCount: 1,
      }),
    ).toBe('COMPLETE');
  });

  it('does not require a second approval after pairing', () => {
    expect(resolveDoublesParticipantStatus({ event: 'PAIR' })).toBe('COMPLETE');
  });
  it.each(['PENDING_APPROVAL', 'COMPLETE', 'WAITLISTED', 'REJECTED', undefined])(
    'does not allow %s to enter the pair operation',
    (teamStatus) => {
      expect(
        isDoublesParticipantPairable(teamStatus as string | undefined),
      ).toBe(false);
    },
  );

  it('allows only the approved/open partner-pending state into pairing', () => {
    expect(isDoublesParticipantPairable('PENDING_PARTNER')).toBe(true);
  });

  it('keeps self-invited participants out of BTC pairing', () => {
    expect(isDoublesParticipantPairable('PENDING_PARTNER', 'invite-token')).toBe(
      false,
    );
  });
});

describe('doubles team-slot capacity', () => {
  it('counts one pending partner as half a team', () => {
    expect(
      calculateOccupiedTeamSlots('DOUBLES', [
        { teamStatus: 'PENDING_PARTNER', rosterMemberCount: 1 },
      ]),
    ).toBe(0.5);
  });

  it('counts a complete pair as one team', () => {
    expect(
      calculateOccupiedTeamSlots('DOUBLES', [
        { teamStatus: 'PENDING_APPROVAL', rosterMemberCount: 2 },
      ]),
    ).toBe(1);
  });

  it('counts pending and approved members but excludes waitlisted and terminal rows', () => {
    expect(
      calculateOccupiedTeamSlots('MIXED_DOUBLES', [
        { teamStatus: 'PENDING_APPROVAL', rosterMemberCount: 1 },
        { teamStatus: 'PENDING_PARTNER', rosterMemberCount: 1 },
        { teamStatus: 'COMPLETE', rosterMemberCount: 2 },
        { teamStatus: 'WAITLISTED', rosterMemberCount: 2 },
        { teamStatus: 'WITHDRAWN', rosterMemberCount: 2 },
      ]),
    ).toBe(2);
  });

  it('counts an organizer-paired row with one invited member as half a team', () => {
    expect(
      calculateOccupiedTeamSlots('DOUBLES', [
        { teamStatus: 'PENDING_APPROVAL', rosterMemberCount: 1 },
      ]),
    ).toBe(0.5);
  });

  it('counts imported paired doubles names when accounts are not linked', () => {
    expect(
      calculateOccupiedTeamSlots('DOUBLES', [
        {
          teamStatus: 'PENDING_APPROVAL',
          rosterMemberCount: 0,
          importedMemberCount: 2,
        },
      ]),
    ).toBe(1);
  });

  it('keeps singles and team-sport capacity in whole team units', () => {
    expect(
      calculateOccupiedTeamSlots('SINGLES', [
        { teamStatus: 'COMPLETE', rosterMemberCount: 1 },
        { teamStatus: 'PENDING', rosterMemberCount: 7 },
        { teamStatus: 'WAITLISTED', rosterMemberCount: 1 },
      ]),
    ).toBe(2);
  });

  it('reports eight active doubles members as a full four-team division', () => {
    const entries = Array.from({ length: 8 }, () => ({
      teamStatus: 'PENDING_APPROVAL',
      rosterMemberCount: 1,
    }));

    expect(calculateOccupiedTeamSlots('DOUBLES', entries)).toBe(4);
    expect(calculateOccupiedTeamSlots('DOUBLES', entries) >= 4).toBe(true);
  });

  it('keeps the division open while only half the member slots are used', () => {
    const entries = Array.from({ length: 4 }, () => ({
      teamStatus: 'PENDING_APPROVAL',
      rosterMemberCount: 1,
    }));

    expect(calculateOccupiedTeamSlots('DOUBLES', entries)).toBe(2);
    expect(calculateOccupiedTeamSlots('DOUBLES', entries) >= 4).toBe(false);
  });
});

describe('capacity unit selection', () => {
  it('uses roster-weighted members for a doubles pairing division', () => {
    expect(resolveCapacityUnit('DOUBLES')).toBe('MEMBER');
    expect(resolveCapacityUnit('MIXED_DOUBLES')).toBe('MEMBER');
  });

  it('keeps a football doubles division on whole team units', () => {
    expect(resolveCapacityUnit('DOUBLES', { teamSize: 11 })).toBe('TEAM');
    expect(resolveCapacityUnit('DOUBLES', { minTeamSize: 7 })).toBe('TEAM');
  });

  it('keeps a Lite doubles division roster-weighted', () => {
    expect(resolveCapacityUnit('DOUBLES', { isLite: true })).toBe('MEMBER');
  });

  it('keeps singles on whole team units', () => {
    expect(resolveCapacityUnit('SINGLES')).toBe('TEAM');
  });
});

describe('requested team slots for a single claim', () => {
  it('charges half a team for one unpaired doubles member', () => {
    expect(calculateRequestedTeamSlots('DOUBLES', 1)).toBe(0.5);
  });

  it('charges a whole team for a doubles pair', () => {
    expect(calculateRequestedTeamSlots('DOUBLES', 2)).toBe(1);
  });

  it('charges one whole team per new row for singles', () => {
    expect(calculateRequestedTeamSlots('SINGLES', 1)).toBe(1);
  });

  it('charges nothing when the claim adds no athlete', () => {
    expect(calculateRequestedTeamSlots('DOUBLES', 0)).toBe(0);
  });
});
