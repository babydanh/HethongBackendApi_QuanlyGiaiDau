import {
  isLiteTournamentProduct,
  isSuperLiteTournamentProduct,
  normalizeTournamentProductConfig,
} from './tournament-product';

describe('tournament product classification', () => {
  it('recognizes the compact Super Lite product', () => {
    const config = {
      isLite: true,
      mode: 'LITE',
      hideAdvancedSettings: true,
    };

    expect(isLiteTournamentProduct(config)).toBe(true);
    expect(isSuperLiteTournamentProduct(config)).toBe(true);
  });

  it('keeps configured Lite/Quick in the Lite family without compact access', () => {
    const config = {
      isLite: true,
      mode: 'LITE',
      hideAdvancedSettings: false,
    };

    expect(isLiteTournamentProduct(config)).toBe(true);
    expect(isSuperLiteTournamentProduct(config)).toBe(false);
  });

  it('does not infer a product from scoring mode alone', () => {
    const config = { isLite: false, mode: 'LITE' };

    expect(isLiteTournamentProduct(config)).toBe(false);
    expect(isSuperLiteTournamentProduct(config)).toBe(false);
  });

  it('fails closed when an explicit false flag conflicts with the legacy marker', () => {
    const config = {
      isLite: false,
      mode: 'LITE',
      hideAdvancedSettings: true,
    };

    expect(isLiteTournamentProduct(config)).toBe(false);
    expect(isSuperLiteTournamentProduct(config)).toBe(false);
  });

  it('normalizes legacy serialized JSON safely', () => {
    expect(
      normalizeTournamentProductConfig(
        '{"isLite":true,"hideAdvancedSettings":true}',
      ),
    ).toEqual({ isLite: true, hideAdvancedSettings: true });
    expect(normalizeTournamentProductConfig('not-json')).toEqual({});
  });
});
