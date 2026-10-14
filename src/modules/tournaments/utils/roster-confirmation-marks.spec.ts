import { carryRosterConfirmationMarks } from './roster-confirmation-marks';

/**
 * `updateFootballRoster` deletes a participant's roster rows and inserts them again. Whatever the
 * helper does not carry across is lost for the players who stayed in the team: losing
 * `rankingConsentAt` stops their ELO, losing `accountLinkConfirmedAt` hides their matches, and
 * losing the counters restarts the reminder mails.
 */
describe('carryRosterConfirmationMarks', () => {
  const CONSENTED = new Date('2026-05-15T00:00:00.000Z');
  const LINKED = new Date('2026-06-01T00:00:00.000Z');
  const NOTIFIED = new Date('2026-05-16T00:00:00.000Z');

  const confirmed = {
    userId: 'confirmed',
    rankingConsentAt: CONSENTED,
    accountLinkConfirmedAt: LINKED,
    consentNotifiedAt: NOTIFIED,
    consentNotifiedCount: 2,
  };

  it('carries every confirmation mark and the reminder counter of a player who stayed', () => {
    const marksFor = carryRosterConfirmationMarks([confirmed]);

    expect(marksFor('confirmed')).toEqual({
      rankingConsentAt: CONSENTED,
      accountLinkConfirmedAt: LINKED,
      consentNotifiedAt: NOTIFIED,
      consentNotifiedCount: 2,
    });
  });

  it('gives a newly added player nothing confirmed and no mail sent', () => {
    const marksFor = carryRosterConfirmationMarks([confirmed]);

    expect(marksFor('newcomer')).toEqual({
      rankingConsentAt: null,
      accountLinkConfirmedAt: null,
      consentNotifiedAt: null,
      consentNotifiedCount: 0,
    });
  });

  it('keeps a half-confirmed player half-confirmed instead of filling the gap', () => {
    const marksFor = carryRosterConfirmationMarks([
      {
        userId: 'consent-only',
        rankingConsentAt: CONSENTED,
        accountLinkConfirmedAt: null,
        consentNotifiedAt: null,
        consentNotifiedCount: 0,
      },
    ]);

    expect(marksFor('consent-only')).toMatchObject({
      rankingConsentAt: CONSENTED,
      accountLinkConfirmedAt: null,
    });
  });

  it('does not let one player inherit the marks of another', () => {
    const marksFor = carryRosterConfirmationMarks([
      confirmed,
      {
        userId: 'unconfirmed',
        rankingConsentAt: null,
        accountLinkConfirmedAt: null,
        consentNotifiedAt: null,
        consentNotifiedCount: 1,
      },
    ]);

    expect(marksFor('unconfirmed').accountLinkConfirmedAt).toBeNull();
    expect(marksFor('unconfirmed').consentNotifiedCount).toBe(1);
  });
});
