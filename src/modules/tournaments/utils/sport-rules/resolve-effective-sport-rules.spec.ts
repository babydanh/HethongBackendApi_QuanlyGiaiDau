import { resolveEffectiveSportRules } from './resolve-effective-sport-rules';

const categoryConfig = {
  ruleKind: 'BADMINTON',
  defaultSportRules: { bestOf: 3, pointsPerSet: 21 },
};

describe('resolveEffectiveSportRules', () => {
  it.each([1, 3, 5])('supports BO%s for round-robin group overrides', (bestOf) => {
    const resolved = resolveEffectiveSportRules({
      categoryConfig,
      tournamentSportRules: { bestOf: 3 },
      stageConfig: { bestOf: 5 },
      groupConfig: { bestOf },
      roundNumber: 1,
    });

    expect(resolved.bestOf).toBe(bestOf);
    expect(resolved.setsToWin).toBe(Math.ceil(bestOf / 2));
  });

  it('applies preset -> tournament -> stage -> group -> round -> match precedence', () => {
    const base = {
      categoryConfig,
      tournamentSportRules: { bestOf: 1 },
      stageConfig: { bestOf: 3, rounds: { 2: { bestOf: 5 } } },
      groupConfig: { bestOf: 1, rounds: { 2: { bestOf: 3 } } },
      roundNumber: 2,
    };

    expect(resolveEffectiveSportRules(base).bestOf).toBe(3);
    expect(resolveEffectiveSportRules({ ...base, matchConfig: { bestOf: 5 } }).bestOf).toBe(5);
  });

  it('keeps legacy direct values when a nested scoring block is present', () => {
    const resolved = resolveEffectiveSportRules({
      categoryConfig,
      stageRoundConfig: { bestOf: 1, scoring: { winPoints: 3 } },
    });

    expect(resolved.bestOf).toBe(1);
  });

  it('reads BO from a nested sport preset format', () => {
    const resolved = resolveEffectiveSportRules({
      categoryConfig: {
        ruleKind: 'BADMINTON',
        defaultSportRules: { format: { bestOf: 5, pointsPerGame: 15 } },
      },
    });

    expect(resolved.bestOf).toBe(5);
    expect(resolved.pointsPerSet).toBe(15);
  });

  it('falls back to the category sport when legacy tournament rules have another sport', () => {
    const resolved = resolveEffectiveSportRules({
      categoryConfig: { ruleKind: 'PICKLEBALL_RALLY' },
      categorySlug: 'pickleball',
      categoryName: 'Pickleball',
      tournamentSportRules: { kind: 'BADMINTON', pointsPerSet: 21 },
    });

    expect(resolved.kind).toBe('PICKLEBALL_RALLY');
    expect(resolved.pointsPerSet).toBe(11);
  });

  it('does not leak group-stage BO into knockout stage resolution', () => {
    const groupStage = resolveEffectiveSportRules({
      categoryConfig,
      tournamentSportRules: { bestOf: 3 },
      stageConfig: { bestOf: 1 },
    });
    const knockout = resolveEffectiveSportRules({
      categoryConfig,
      tournamentSportRules: { bestOf: 3 },
      stageConfig: { advanceMapping: { numGroups: 2 } },
    });

    expect(groupStage.bestOf).toBe(1);
    expect(knockout.bestOf).toBe(3);
  });
});
