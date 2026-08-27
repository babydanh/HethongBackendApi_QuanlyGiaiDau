import { SPORT_RULE_KINDS, type SportRuleKind, type SportScoringModel } from './sport-rule-kind.type';
import type { ResolvedSportRulesConfig, SportRuleResolutionInput } from './sport-rules.types';

interface SportDefaults {
  kind: SportRuleKind;
  scoringModel: SportScoringModel;
  setsToWin: number;
  pointsPerSet: number;
  mustWinByTwo: boolean;
  maxPoints: number;
  tiebreakAt: number;
  tiebreakPoints: number | null;
}

const SPORT_DEFAULTS: Record<SportRuleKind, SportDefaults> = {
  BADMINTON: {
    kind: 'BADMINTON',
    scoringModel: 'RALLY_POINT_SET',
    setsToWin: 2,
    pointsPerSet: 21,
    mustWinByTwo: true,
    maxPoints: 30,
    tiebreakAt: 20,
    tiebreakPoints: null,
  },
  TABLE_TENNIS: {
    kind: 'TABLE_TENNIS',
    scoringModel: 'RALLY_POINT_SET',
    setsToWin: 3,
    pointsPerSet: 11,
    mustWinByTwo: true,
    maxPoints: 99,
    tiebreakAt: 10,
    tiebreakPoints: null,
  },
  PICKLEBALL_RALLY: {
    kind: 'PICKLEBALL_RALLY',
    scoringModel: 'RALLY_POINT_SET',
    setsToWin: 2,
    pointsPerSet: 11,
    mustWinByTwo: true,
    maxPoints: 15,
    tiebreakAt: 10,
    tiebreakPoints: null,
  },
  PICKLEBALL_SIDE_OUT: {
    kind: 'PICKLEBALL_SIDE_OUT',
    scoringModel: 'PICKLEBALL_SIDE_OUT',
    setsToWin: 1,
    pointsPerSet: 11,
    mustWinByTwo: true,
    maxPoints: 15,
    tiebreakAt: 10,
    tiebreakPoints: 11,
  },
  TENNIS: {
    kind: 'TENNIS',
    scoringModel: 'TENNIS_SET',
    setsToWin: 2,
    pointsPerSet: 6,
    mustWinByTwo: true,
    maxPoints: 7,
    tiebreakAt: 6,
    tiebreakPoints: 7,
  },
  FOOTBALL: {
    kind: 'FOOTBALL',
    scoringModel: 'FOOTBALL_MATCH',
    setsToWin: 1,
    pointsPerSet: 1,
    mustWinByTwo: false,
    maxPoints: 99,
    tiebreakAt: 0,
    tiebreakPoints: null,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function normalizeKind(raw: unknown): SportRuleKind | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const normalized = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (normalized === 'PICKLEBALL') {
    return 'PICKLEBALL_RALLY';
  }
  return SPORT_RULE_KINDS.includes(normalized as SportRuleKind)
    ? (normalized as SportRuleKind)
    : null;
}

function inferKindFromCategoryName(categorySlug?: string | null, categoryName?: string | null): SportRuleKind | null {
  const normalizeCategoryText = (value?: string | null) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .trim();
  const slug = normalizeCategoryText(categorySlug);
  const name = normalizeCategoryText(categoryName);
  const combined = `${slug} ${name}`;

  if (combined.includes('badminton') || combined.includes('cau long')) {
    return 'BADMINTON';
  }
  if (combined.includes('table tennis') || combined.includes('bong ban') || combined.includes('ping pong')) {
    return 'TABLE_TENNIS';
  }
  if (combined.includes('pickleball')) {
    return 'PICKLEBALL_RALLY';
  }
  if (combined.includes('tennis') || combined.includes('quan vot')) {
    return 'TENNIS';
  }
  if (combined.includes('football') || combined.includes('bong da') || combined.includes('soccer')) {
    return 'FOOTBALL';
  }

  return null;
}

function getNestedRecord(source: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  if (!source) {
    return null;
  }
  return asRecord(source[key]);
}

function getRoundOverride(
  config: Record<string, unknown> | null | undefined,
  roundNumber: number | null | undefined,
): Record<string, unknown> | null {
  const source = asRecord(config);
  const rounds = getNestedRecord(source, 'rounds') || getNestedRecord(source, 'roundConfigs');
  if (!rounds || roundNumber == null) {
    return null;
  }

  return asRecord(rounds[String(roundNumber)]);
}

function getScoringView(source: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!source) {
    return null;
  }

  // Keep direct overrides while allowing the more specific nested block to win.
  // Some older configs store `bestOf` beside `scoring`, so returning only the
  // nested object would silently discard the direct value.
  return {
    ...source,
    ...(getNestedRecord(source, 'format') || {}),
    ...(getNestedRecord(source, 'matchRules') || {}),
    ...(getNestedRecord(source, 'rules') || {}),
    ...(getNestedRecord(source, 'scoring') || {}),
  };
}

function readNumber(
  sources: Array<Record<string, unknown> | null>,
  keys: string[],
): number | undefined {
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
    }
  }
  return undefined;
}

function readBoolean(
  sources: Array<Record<string, unknown> | null>,
  keys: string[],
): boolean | undefined {
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'boolean') {
        return value;
      }
    }
  }
  return undefined;
}

function readExplicitKind(source: Record<string, unknown> | null): SportRuleKind | undefined {
  if (!source) {
    return undefined;
  }

  return normalizeKind(source.kind) || normalizeKind(getScoringView(source)?.kind) || undefined;
}

function areKindsCompatible(categoryKind: SportRuleKind | undefined, configuredKind: SportRuleKind | undefined) {
  if (!categoryKind || !configuredKind) return true;
  if (categoryKind === configuredKind) return true;
  return categoryKind.startsWith('PICKLEBALL_') && configuredKind.startsWith('PICKLEBALL_');
}

function resolveRuleKind(
  input: SportRuleResolutionInput,
  overrides: {
    stageConfig: Record<string, unknown> | null;
    groupConfig: Record<string, unknown> | null;
    stageRoundOverride: Record<string, unknown> | null;
    groupRoundOverride: Record<string, unknown> | null;
    matchOverride: Record<string, unknown> | null;
  },
): SportRuleKind {
  const tournamentRules = asRecord(input.tournamentSportRules);
  const categoryConfig = asRecord(input.categoryConfig);
  const categoryDefaults = getNestedRecord(categoryConfig, 'defaultSportRules');
  const categoryKind = normalizeKind(categoryConfig?.ruleKind) ||
    readExplicitKind(categoryDefaults) ||
    inferKindFromCategoryName(input.categorySlug, input.categoryName) ||
    undefined;
  const tournamentKind = readExplicitKind(tournamentRules);
  const compatibleTournamentKind = areKindsCompatible(categoryKind, tournamentKind)
    ? tournamentKind
    : undefined;

  return (
    readExplicitKind(overrides.matchOverride) ||
    readExplicitKind(overrides.groupRoundOverride) ||
    readExplicitKind(overrides.stageRoundOverride) ||
    readExplicitKind(overrides.groupConfig) ||
    readExplicitKind(overrides.stageConfig) ||
    compatibleTournamentKind ||
    categoryKind ||
    'BADMINTON'
  );
}

export function resolveEffectiveSportRules(input: SportRuleResolutionInput): ResolvedSportRulesConfig {
  const tournamentRules = asRecord(input.tournamentSportRules);
  const categoryConfig = asRecord(input.categoryConfig);
  const categoryDefaults = getNestedRecord(categoryConfig, 'defaultSportRules');
  const stageConfig = asRecord(input.stageConfig) || asRecord(input.stageRoundConfig);
  const groupConfig = asRecord(input.groupConfig);
  const stageRoundOverride = getRoundOverride(stageConfig, input.roundNumber);
  const groupRoundOverride = getRoundOverride(groupConfig, input.roundNumber);
  const matchOverride = asRecord(input.matchConfig);
  const kind = resolveRuleKind(input, {
    stageConfig,
    groupConfig,
    stageRoundOverride,
    groupRoundOverride,
    matchOverride,
  });
  const categoryKind = normalizeKind(categoryConfig?.ruleKind) ||
    readExplicitKind(categoryDefaults) ||
    inferKindFromCategoryName(input.categorySlug, input.categoryName) ||
    undefined;
  const tournamentKind = readExplicitKind(tournamentRules);
  const tournamentRulesMatchCategory = areKindsCompatible(categoryKind, tournamentKind);
  const effectiveTournamentRules = tournamentRulesMatchCategory ? tournamentRules : null;
  const defaults = SPORT_DEFAULTS[kind];

  const scoringSources = [
    getScoringView(matchOverride),
    getScoringView(groupRoundOverride),
    getScoringView(stageRoundOverride),
    getScoringView(groupConfig),
    getScoringView(stageConfig),
    getScoringView(effectiveTournamentRules),
    getScoringView(categoryDefaults),
  ];

  // BO and sets-to-win describe the same setting. Resolve both from the most
  // specific layer that defines either value so a group BO1 can override a
  // tournament BO3 without inheriting tournament setsToWin=2.
  let bestOf = defaults.setsToWin * 2 - 1;
  let setsToWin = defaults.setsToWin;
  for (const source of scoringSources) {
    const sourceBestOf = readNumber([source], ['bestOf', 'best_of', 'bestOfSets', 'max_sets']);
    const sourceSetsToWin = readNumber([source], ['setsToWin', 'sets_to_win']);
    if (sourceBestOf != null || sourceSetsToWin != null) {
      bestOf = Math.max(1, Math.trunc(sourceBestOf ?? (Math.max(1, Math.trunc(sourceSetsToWin!)) * 2 - 1)));
      setsToWin = Math.ceil(bestOf / 2);
      break;
    }
  }

  const pointsPerSet = Math.max(
    1,
    Math.trunc(
      readNumber(scoringSources, [
        'pointsPerSet',
        'points_per_set',
        'pointsPerGame',
        'points_per_game',
        'gamePoint',
        'game_point',
        'gamesPerSet',
      ]) ?? defaults.pointsPerSet,
    ),
  );

  const mustWinByTwo = readBoolean(scoringSources, [
    'mustWinByTwo',
    'must_win_by_two',
    'winByTwo',
    'win_by_two',
    'deuceEnabled',
    'deuce_enabled',
  ]) ?? defaults.mustWinByTwo;

  const maxPoints = Math.max(
    pointsPerSet,
    Math.trunc(
      readNumber(scoringSources, ['maxPoints', 'max_points', 'maxPointsPerSet', 'capAt']) ?? defaults.maxPoints,
    ),
  );

  const tiebreakAt = Math.min(
    pointsPerSet - 1,
    Math.max(
      0,
      Math.trunc(
        readNumber(scoringSources, ['tiebreakAt', 'tiebreak_at']) ?? defaults.tiebreakAt,
      ),
    ),
  );

  const tiebreakPointsValue = readNumber(scoringSources, [
    'tiebreakPoints',
    'tiebreak_points',
  ]);
  const tiebreakPoints = tiebreakPointsValue == null
    ? defaults.tiebreakPoints
    : Math.max(1, Math.trunc(tiebreakPointsValue));

  const version = Math.max(
    1,
    Math.trunc(readNumber([effectiveTournamentRules], ['version']) ?? 1),
  );

  const tournamentConfigObj = asRecord(input.tournamentConfig);
  const mode = tournamentConfigObj?.mode === 'LITE'
    ? 'LITE'
    : scoringSources.some((s) => s?.mode === 'LITE' || s?.rulesPreset === 'LITE')
      ? 'LITE'
      : 'STRICT';

  return {
    version,
    kind,
    scoringModel: defaults.scoringModel,
    format: scoringSources
      .map((source) => getNestedRecord(source, 'format'))
      .find((format): format is Record<string, unknown> => format !== null) || {},
    bestOf,
    setsToWin,
    pointsPerSet,
    deuceEnabled: mustWinByTwo,
    mustWinByTwo,
    tiebreakAt,
    maxPoints,
    tiebreakPoints,
    mode,
  };
}
