import {
  isDoublesParticipantPairable,
  resolveDoublesParticipantStatus,
} from './tournament-participant-status';

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

  it('preserves the dedicated Lite pairing path', () => {
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
    ).toBe('PENDING_PARTNER');
    expect(
      resolveDoublesParticipantStatus({
        event: 'APPROVE',
        registrationMode: 'APPROVAL',
        isLite: true,
        isDoubles: true,
        rosterCount: 1,
      }),
    ).toBe('COMPLETE');
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
