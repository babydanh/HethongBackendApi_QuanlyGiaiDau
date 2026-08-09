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

  return null;
}

function getNestedRecord(source: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  if (!source) {
    return null;
  }
  return asRecord(source[key]);
}

function getRoundOverride(
  stageRoundConfig: Record<string, unknown> | null | undefined,
  roundNumber: number | null | undefined,
): Record<string, unknown> | null {
  const stageConfig = asRecord(stageRoundConfig);
  const rounds = getNestedRecord(stageConfig, 'rounds');
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

function resolveRuleKind(
  input: SportRuleResolutionInput,
  overrides: {
    stageConfig: Record<string, unknown> | null;
    roundOverride: Record<string, unknown> | null;
    matchOverride: Record<string, unknown> | null;
  },
): SportRuleKind {
  const tournamentRules = asRecord(input.tournamentSportRules);
  const categoryConfig = asRecord(input.categoryConfig);
  const categoryDefaults = getNestedRecord(categoryConfig, 'defaultSportRules');

  return (
    readExplicitKind(overrides.matchOverride) ||
    readExplicitKind(overrides.roundOverride) ||
    readExplicitKind(overrides.stageConfig) ||
    readExplicitKind(tournamentRules) ||
    normalizeKind(categoryConfig?.ruleKind) ||
    readExplicitKind(categoryDefaults) ||
    inferKindFromCategoryName(input.categorySlug, input.categoryName) ||
    'BADMINTON'
  );
}

export function resolveEffectiveSportRules(input: SportRuleResolutionInput): ResolvedSportRulesConfig {
  const tournamentRules = asRecord(input.tournamentSportRules);
  const categoryConfig = asRecord(input.categoryConfig);
  const categoryDefaults = getNestedRecord(categoryConfig, 'defaultSportRules');
  const stageConfig = asRecord(input.stageRoundConfig);
  const roundOverride = getRoundOverride(stageConfig, input.roundNumber);
  const matchOverride = asRecord(input.matchConfig);
  const kind = resolveRuleKind(input, { stageConfig, roundOverride, matchOverride });
  const defaults = SPORT_DEFAULTS[kind];

  const scoringSources = [
    getScoringView(matchOverride),
    getScoringView(roundOverride),
    getScoringView(stageConfig),
    getScoringView(tournamentRules),
    getScoringView(categoryDefaults),
  ];

  const setsToWin = Math.max(
    1,
    Math.trunc(
      readNumber(scoringSources, ['setsToWin', 'sets_to_win']) ?? defaults.setsToWin,
    ),
  );

  const bestOf = Math.max(
    1,
    Math.trunc(
      readNumber(scoringSources, ['bestOf', 'best_of']) ?? (setsToWin * 2 - 1),
    ),
  );

  const pointsPerSet = Math.max(
    1,
    Math.trunc(
      readNumber(scoringSources, ['pointsPerSet', 'points_per_set']) ?? defaults.pointsPerSet,
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
      readNumber(scoringSources, ['maxPoints', 'max_points', 'maxPointsPerSet']) ?? defaults.maxPoints,
    ),
  );

  const tiebreakAt = Math.max(
    0,
    Math.trunc(
      readNumber(scoringSources, ['tiebreakAt', 'tiebreak_at']) ?? defaults.tiebreakAt,
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
    Math.trunc(readNumber([tournamentRules], ['version']) ?? 1),
  );

  return {
    version,
    kind,
    scoringModel: defaults.scoringModel,
    format: getNestedRecord(tournamentRules, 'format') || {},
    bestOf,
    setsToWin,
    pointsPerSet,
    deuceEnabled: mustWinByTwo,
    mustWinByTwo,
    tiebreakAt,
    maxPoints,
    tiebreakPoints,
  };
}
