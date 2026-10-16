import {
  hasDeferredDivisionSetup,
  resolveLiteCreateStatus,
} from './tournament-lite.service';

describe('Lite tournament deferred division contract', () => {
  it('treats an explicit empty array as deferred setup and an omitted field as legacy', () => {
    expect(hasDeferredDivisionSetup([])).toBe(true);
    expect(hasDeferredDivisionSetup(undefined)).toBe(false);
    expect(hasDeferredDivisionSetup([{ name: 'Singles' }])).toBe(false);
  });

  it('keeps deferred setup in DRAFT without changing existing create statuses', () => {
    expect(resolveLiteCreateStatus(true, true, false, false)).toBe('DRAFT');
    expect(resolveLiteCreateStatus(false, true, false, false)).toBe('PENDING_APPROVAL');
    expect(resolveLiteCreateStatus(false, false, false, true)).toBe('UPCOMING');
    expect(resolveLiteCreateStatus(false, false, false, false)).toBe('REGISTRATION_OPEN');
  });
});
