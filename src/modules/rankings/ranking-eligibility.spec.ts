import {
  isRosterEligibleForElo,
  isSideEligibleForElo,
} from './ranking-eligibility';

/**
 * The rule the whole ranking board rests on: a roster user's result counts only for matches
 * completed AFTER the player themself gave both confirmations. The two marks mean different things
 * (agreeing to be ranked, confirming the account link) and a match needs both.
 */
describe('ranking eligibility', () => {
  const COMPLETED_AT = new Date('2026-06-01T10:00:00Z').getTime();
  const BEFORE = new Date('2026-05-01T09:00:00Z');
  const AFTER = new Date('2026-06-02T09:00:00Z');
  const AT = new Date('2026-06-01T10:00:00Z');

  const marks = (
    rankingConsentAt: Date | null,
    accountLinkConfirmedAt: Date | null,
  ) => ({ rankingConsentAt, accountLinkConfirmedAt });

  describe('isRosterEligibleForElo', () => {
    it('accepts a user who confirmed both before the match completed', () => {
      expect(isRosterEligibleForElo(marks(BEFORE, BEFORE), COMPLETED_AT)).toBe(
        true,
      );
    });

    it('accepts marks stamped at the very instant the match completed', () => {
      expect(isRosterEligibleForElo(marks(AT, AT), COMPLETED_AT)).toBe(true);
    });

    it('rejects a user who agreed to be ranked but never confirmed the account link', () => {
      expect(isRosterEligibleForElo(marks(BEFORE, null), COMPLETED_AT)).toBe(
        false,
      );
    });

    it('rejects a user who confirmed the link but never agreed to be ranked', () => {
      expect(isRosterEligibleForElo(marks(null, BEFORE), COMPLETED_AT)).toBe(
        false,
      );
    });

    it('rejects a user who has confirmed nothing', () => {
      expect(isRosterEligibleForElo(marks(null, null), COMPLETED_AT)).toBe(
        false,
      );
    });

    it('rejects a match completed before the ranking consent', () => {
      expect(isRosterEligibleForElo(marks(AFTER, BEFORE), COMPLETED_AT)).toBe(
        false,
      );
    });

    it('rejects a match completed before the account link was confirmed', () => {
      expect(isRosterEligibleForElo(marks(BEFORE, AFTER), COMPLETED_AT)).toBe(
        false,
      );
    });

    it('treats a missing mark as not confirmed instead of throwing', () => {
      const incomplete = { rankingConsentAt: BEFORE } as unknown as Parameters<
        typeof isRosterEligibleForElo
      >[0];
      expect(isRosterEligibleForElo(incomplete, COMPLETED_AT)).toBe(false);
    });
  });

  describe('isSideEligibleForElo', () => {
    it('accepts a side where every user confirmed both', () => {
      expect(
        isSideEligibleForElo(
          [marks(BEFORE, BEFORE), marks(BEFORE, BEFORE)],
          COMPLETED_AT,
        ),
      ).toBe(true);
    });

    it('rejects a side where one of two users has not confirmed the link', () => {
      expect(
        isSideEligibleForElo(
          [marks(BEFORE, BEFORE), marks(BEFORE, null)],
          COMPLETED_AT,
        ),
      ).toBe(false);
    });

    it('rejects a side with no roster row: nobody there can have confirmed', () => {
      expect(isSideEligibleForElo([], COMPLETED_AT)).toBe(false);
    });
  });
});
