import {
  overlayVisibilityPatch,
  toOverlayVisibilityState,
  type OverlayKind,
  type OverlayVisibilityState,
} from './overlay-visibility';

const OFF: OverlayVisibilityState = {
  h2hOverlayVisible: false,
  bracketOverlayVisible: false,
};

// Trạng thái sau khi áp một lệnh lên trạng thái trước đó (một UPDATE duy nhất).
const applyOverlay = (
  prior: OverlayVisibilityState,
  kind: OverlayKind,
  visible: boolean,
): OverlayVisibilityState => ({
  ...prior,
  ...overlayVisibilityPatch(kind, visible),
});

describe('overlay visibility exclusion', () => {
  it('turning H2H on from nothing shows only H2H', () => {
    expect(applyOverlay(OFF, 'H2H', true)).toEqual({
      h2hOverlayVisible: true,
      bracketOverlayVisible: false,
    });
  });

  it('turning BRACKET on while H2H is shown hides H2H', () => {
    expect(
      applyOverlay(
        { h2hOverlayVisible: true, bracketOverlayVisible: false },
        'BRACKET',
        true,
      ),
    ).toEqual({ h2hOverlayVisible: false, bracketOverlayVisible: true });
  });

  it('turning H2H on while BRACKET is shown hides BRACKET', () => {
    expect(
      applyOverlay(
        { h2hOverlayVisible: false, bracketOverlayVisible: true },
        'H2H',
        true,
      ),
    ).toEqual({ h2hOverlayVisible: true, bracketOverlayVisible: false });
  });

  it('turning H2H off leaves a shown BRACKET untouched', () => {
    expect(
      applyOverlay(
        { h2hOverlayVisible: false, bracketOverlayVisible: true },
        'H2H',
        false,
      ),
    ).toEqual({ h2hOverlayVisible: false, bracketOverlayVisible: true });
  });

  it('turning BRACKET off leaves a shown H2H untouched', () => {
    expect(
      applyOverlay(
        { h2hOverlayVisible: true, bracketOverlayVisible: false },
        'BRACKET',
        false,
      ),
    ).toEqual({ h2hOverlayVisible: true, bracketOverlayVisible: false });
  });

  it('repeating the same command leaves the state unchanged', () => {
    const once = applyOverlay(OFF, 'BRACKET', true);
    expect(applyOverlay(once, 'BRACKET', true)).toEqual(once);
    expect(applyOverlay(OFF, 'H2H', false)).toEqual(OFF);
  });
});

describe('toOverlayVisibilityState', () => {
  it('returns both flags with the match id under id and matchId', () => {
    expect(
      toOverlayVisibilityState('match-1', {
        h2hOverlayVisible: true,
        bracketOverlayVisible: false,
      }),
    ).toEqual({
      id: 'match-1',
      matchId: 'match-1',
      h2hOverlayVisible: true,
      bracketOverlayVisible: false,
    });
  });
});
