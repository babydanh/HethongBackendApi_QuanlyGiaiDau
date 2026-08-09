import { BadRequestException } from '@nestjs/common';
import { SPORT_RULE_KINDS, type SportRuleKind, type SportScoringModel } from './sport-rule-kind.type';

interface CategoryRuleSource {
  categoryConfig?: Record<string, unknown> | null;
  categoryName?: string | null;
  categorySlug?: string | null;
}

interface ValidateSportRuleConfigOptions {
  expectedKind?: SportRuleKind | null;
  allowedKinds?: SportRuleKind[] | null;
  sourceLabel: string;
  allowRoundStructure?: boolean;
  allowRoundMetadata?: boolean;
}

const COMMON_ROOT_KEYS = new Set([
  'version',
  'kind',
  'scoringModel',
  'scoring_model',
  'format',
  'scoring',
  'setsToWin',
  'sets_to_win',
  'bestOf',
  'best_of',
  'pointsPerSet',
  'points_per_set',
  'pointsPerGame',
  'points_per_game',
  'gamePoint',
  'game_point',
  'winByTwo',
  'win_by_two',
  'mustWinByTwo',
  'must_win_by_two',
  'deuceEnabled',
  'deuce_enabled',
  'tiebreakAt',
  'tiebreak_at',
  'tiebreakPoints',
  'tiebreak_points',
  'maxPoints',
  'max_points',
  'maxPointsPerSet',
  'max_points_per_set',
  'maxDeucePoints',
  'max_deuce_points',
  'roundsToPlay',
  'rounds_to_play',
  'tiebreakerMode',
  'tiebreaker_mode',
  'superTiebreakEnabled',
  'super_tiebreak_enabled',
  'superTiebreakSetIndex',
  'super_tiebreak_set_index',
  'superTiebreakPoints',
  'super_tiebreak_points',
  'serveSwitchEvery',
  'serve_switch_every',
  'switchSidesBetweenSets',
  'switch_sides_between_sets',
  'switchSidesAtTiebreakPoints',
  'switch_sides_at_tiebreak_points',
  'winPoints',
  'win_points',
  'drawPoints',
  'draw_points',
  'lossPoints',
  'loss_points',
]);

const ROUND_STRUCTURE_KEYS = new Set([
  'rounds',
  'roundConfigs',
  'defaultOverride',
  'default_override',
  'groupsConfig',
  'advancementConfig',
  'playoffConfig',
  'tiebreakerRules',
  'configuredGroups',
  'groupConfigs',
]);

const ROUND_METADATA_KEYS = new Set([
  'max_sets',
  'deuce_gap',
  'scoring_type',
  'advance_count',
  'allow_player_choice_court',
  'time_limit_minutes',
  'custom_notes',
  'venue_id',
  'scheduled_date',
]);

const FORMAT_KEYS: Record<SportRuleKind, Set<string>> = {
  BADMINTON: new Set(['bestOf', 'pointsPerGame', 'winByTwo', 'capAt']),
  TABLE_TENNIS: new Set(['bestOf', 'pointsPerGame', 'winByTwo', 'capAt']),
  PICKLEBALL_RALLY: new Set(['bestOf', 'pointsPerGame', 'winByTwo', 'capAt']),
  PICKLEBALL_SIDE_OUT: new Set(['gamePoint', 'winByTwo', 'firstServerRule', 'doublesServeFlow']),
  TENNIS: new Set([
    'bestOfSets',
    'gamesPerSet',
    'winByTwoGames',
    'tiebreakAtGames',
    'tiebreakPoints',
    'finalSetMode',
    'tiebreakMode',
    'noAd',
  ]),
};

const SCORING_MODEL_BY_KIND: Record<SportRuleKind, SportScoringModel> = {
  BADMINTON: 'RALLY_POINT_SET',
  TABLE_TENNIS: 'RALLY_POINT_SET',
  PICKLEBALL_RALLY: 'RALLY_POINT_SET',
  PICKLEBALL_SIDE_OUT: 'PICKLEBALL_SIDE_OUT',
  TENNIS: 'TENNIS_SET',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function normalizeSportRuleKind(raw: unknown): SportRuleKind | null {
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

function readNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function readBoolean(source: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }

  return null;
}

function assertPositiveInteger(
  source: Record<string, unknown>,
  keys: string[],
  sourceLabel: string,
  fieldLabel: string,
) {
  const value = readNumber(source, keys);
  if (value == null) {
    return;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new BadRequestException(`${sourceLabel}: ${fieldLabel} phải là số nguyên dương.`);
  }
}

function inferSportRuleKindFromCategory(source: CategoryRuleSource): SportRuleKind {
  const categoryConfig = asRecord(source.categoryConfig);
  const directKind = normalizeSportRuleKind(categoryConfig?.ruleKind);
  if (directKind) {
    return directKind;
  }

  const defaultRules = asRecord(categoryConfig?.defaultSportRules);
  const defaultKind = normalizeSportRuleKind(defaultRules?.kind);
  if (defaultKind) {
    return defaultKind;
  }

  const slug = (source.categorySlug ?? '').trim().toLowerCase();
  const name = (source.categoryName ?? '').trim().toLowerCase();
  const combined = `${slug} ${name}`;

  if (combined.includes('badminton') || combined.includes('cầu lông')) {
    return 'BADMINTON';
  }
  if (combined.includes('table-tennis') || combined.includes('bóng bàn') || combined.includes('ping pong')) {
    return 'TABLE_TENNIS';
  }
  if (combined.includes('pickleball')) {
    return 'PICKLEBALL_RALLY';
  }
  if (combined.includes('tennis') || combined.includes('quần vợt')) {
    return 'TENNIS';
  }

  return 'BADMINTON';
}

function resolveAllowedKindsFromCategory(source: CategoryRuleSource): SportRuleKind[] {
  const categoryConfig = asRecord(source.categoryConfig);
  const rawAllowedKinds = categoryConfig?.allowedRuleKinds;
  if (Array.isArray(rawAllowedKinds)) {
    const normalizedKinds = rawAllowedKinds
      .map((item) => normalizeSportRuleKind(item))
      .filter((item): item is SportRuleKind => item !== null);

    if (normalizedKinds.length > 0) {
      return normalizedKinds;
    }
  }

  return [inferSportRuleKindFromCategory(source)];
}

function validateFormatBlock(
  kind: SportRuleKind,
  format: Record<string, unknown>,
  sourceLabel: string,
) {
  const allowedKeys = FORMAT_KEYS[kind];
  for (const key of Object.keys(format)) {
    if (!allowedKeys.has(key)) {
      throw new BadRequestException(`${sourceLabel}: field format.${key} không hợp lệ cho luật ${kind}.`);
    }
  }

  switch (kind) {
    case 'TENNIS': {
      const gamesPerSet = readNumber(format, ['gamesPerSet']);
      if (gamesPerSet != null && ![4, 6].includes(gamesPerSet)) {
        throw new BadRequestException(`${sourceLabel}: tennis chỉ hỗ trợ gamesPerSet là 4 hoặc 6.`);
      }

      const tiebreakAtGames = readNumber(format, ['tiebreakAtGames']);
      if (tiebreakAtGames != null && ![4, 6].includes(tiebreakAtGames)) {
        throw new BadRequestException(`${sourceLabel}: tennis chỉ hỗ trợ tiebreakAtGames là 4 hoặc 6.`);
      }

      const tiebreakPoints = readNumber(format, ['tiebreakPoints']);
      if (tiebreakPoints != null && ![7, 10].includes(tiebreakPoints)) {
        throw new BadRequestException(`${sourceLabel}: tennis chỉ hỗ trợ tie-break 7 hoặc 10 điểm.`);
      }

      const finalSetMode = format.finalSetMode;
      if (
        finalSetMode !== undefined &&
        finalSetMode !== 'STANDARD' &&
        finalSetMode !== 'SUPER_TIEBREAK' &&
        finalSetMode !== 'NO_TIEBREAK'
      ) {
        throw new BadRequestException(`${sourceLabel}: finalSetMode của tennis không hợp lệ.`);
      }

      const tiebreakMode = format.tiebreakMode;
      if (
        tiebreakMode !== undefined &&
        tiebreakMode !== 'STANDARD_7' &&
        tiebreakMode !== 'SUPER_10' &&
        tiebreakMode !== 'NONE'
      ) {
        throw new BadRequestException(`${sourceLabel}: tiebreakMode của tennis không hợp lệ.`);
      }
      break;
    }
    case 'PICKLEBALL_SIDE_OUT': {
      const gamePoint = readNumber(format, ['gamePoint']);
      if (gamePoint != null && ![11, 15, 21].includes(gamePoint)) {
        throw new BadRequestException(`${sourceLabel}: pickleball side-out chỉ hỗ trợ gamePoint 11, 15 hoặc 21.`);
      }

      const firstServerRule = format.firstServerRule;
      if (firstServerRule !== undefined && firstServerRule !== 'STANDARD') {
        throw new BadRequestException(`${sourceLabel}: firstServerRule của side-out hiện chỉ hỗ trợ STANDARD.`);
      }

      const doublesServeFlow = format.doublesServeFlow;
      if (doublesServeFlow !== undefined && doublesServeFlow !== 'TWO_SERVER') {
        throw new BadRequestException(`${sourceLabel}: doublesServeFlow của side-out hiện chỉ hỗ trợ TWO_SERVER.`);
      }
      break;
    }
    default: {
      const pointsPerGame = readNumber(format, ['pointsPerGame']);
      if (pointsPerGame != null && pointsPerGame < 1) {
        throw new BadRequestException(`${sourceLabel}: pointsPerGame phải là số nguyên dương.`);
      }

      const capAt = readNumber(format, ['capAt']);
      if (capAt != null && pointsPerGame != null && capAt < pointsPerGame) {
        throw new BadRequestException(`${sourceLabel}: capAt không được nhỏ hơn pointsPerGame.`);
      }
      break;
    }
  }
}

function validateScoringSemantics(
  kind: SportRuleKind,
  source: Record<string, unknown>,
  sourceLabel: string,
) {
  assertPositiveInteger(source, ['setsToWin', 'sets_to_win', 'bestOf', 'best_of'], sourceLabel, 'số set/game thắng');
  assertPositiveInteger(
    source,
    ['pointsPerSet', 'points_per_set', 'pointsPerGame', 'points_per_game', 'gamePoint', 'game_point'],
    sourceLabel,
    'mốc điểm',
  );
  assertPositiveInteger(
    source,
    ['tiebreakAt', 'tiebreak_at', 'tiebreakPoints', 'tiebreak_points', 'maxPoints', 'max_points', 'maxPointsPerSet'],
    sourceLabel,
    'ngưỡng tie-break / điểm trần',
  );

  const pointsPerSet = readNumber(source, ['pointsPerSet', 'points_per_set']);
  const maxPoints = readNumber(source, ['maxPoints', 'max_points', 'maxPointsPerSet']);
  const tiebreakAt = readNumber(source, ['tiebreakAt', 'tiebreak_at']);
  const tiebreakPoints = readNumber(source, ['tiebreakPoints', 'tiebreak_points']);
  const winByTwo = readBoolean(source, ['winByTwo', 'win_by_two', 'mustWinByTwo', 'must_win_by_two', 'deuceEnabled', 'deuce_enabled']);

  if (pointsPerSet != null && maxPoints != null && maxPoints < pointsPerSet) {
    throw new BadRequestException(`${sourceLabel}: maxPoints không được nhỏ hơn pointsPerSet.`);
  }

  if (tiebreakAt != null && maxPoints != null && maxPoints > 0 && tiebreakAt >= maxPoints) {
    throw new BadRequestException(`${sourceLabel}: tiebreakAt phải nhỏ hơn maxPoints.`);
  }

  switch (kind) {
    case 'BADMINTON':
      if (pointsPerSet != null && pointsPerSet > 30) {
        throw new BadRequestException(`${sourceLabel}: cầu lông không hợp lệ nếu pointsPerSet vượt quá 30.`);
      }
      break;
    case 'TABLE_TENNIS':
      if (pointsPerSet != null && pointsPerSet > 99) {
        throw new BadRequestException(`${sourceLabel}: bóng bàn không hợp lệ nếu pointsPerSet vượt quá 99.`);
      }
      break;
    case 'PICKLEBALL_RALLY':
      if (pointsPerSet != null && ![11, 15, 21].includes(pointsPerSet)) {
        throw new BadRequestException(`${sourceLabel}: pickleball rally chỉ hỗ trợ pointsPerSet 11, 15 hoặc 21.`);
      }
      break;
    case 'PICKLEBALL_SIDE_OUT':
      if (pointsPerSet != null && ![11, 15, 21].includes(pointsPerSet)) {
        throw new BadRequestException(`${sourceLabel}: pickleball side-out chỉ hỗ trợ pointsPerSet 11, 15 hoặc 21.`);
      }
      if (winByTwo === false) {
        throw new BadRequestException(`${sourceLabel}: pickleball side-out phải giữ luật thắng cách 2.`);
      }
      break;
    case 'TENNIS':
      if (pointsPerSet != null && ![4, 6].includes(pointsPerSet)) {
        throw new BadRequestException(`${sourceLabel}: tennis chỉ hỗ trợ pointsPerSet/gamesPerSet là 4 hoặc 6.`);
      }
      if (maxPoints != null && pointsPerSet != null && ![pointsPerSet + 1, pointsPerSet + 2].includes(maxPoints)) {
        throw new BadRequestException(`${sourceLabel}: tennis chỉ cho phép maxPoints theo logic 1-2 game vượt chuẩn.`);
      }
      if (tiebreakPoints != null && ![7, 10].includes(tiebreakPoints)) {
        throw new BadRequestException(`${sourceLabel}: tennis chỉ hỗ trợ tie-break 7 hoặc 10 điểm.`);
      }
      break;
  }
}

function validateScoringBlock(
  block: Record<string, unknown>,
  kind: SportRuleKind,
  sourceLabel: string,
) {
  for (const key of Object.keys(block)) {
    if (!COMMON_ROOT_KEYS.has(key)) {
      throw new BadRequestException(`${sourceLabel}: field scoring.${key} không hợp lệ cho luật ${kind}.`);
    }
  }

  validateScoringSemantics(kind, block, sourceLabel);
}

function validateGroupStageStructure(payload: Record<string, unknown>, sourceLabel: string) {
  const groupsConfig = asRecord(payload.groupsConfig);
  if (payload.groupsConfig !== undefined && !groupsConfig) {
    throw new BadRequestException(`${sourceLabel}: groupsConfig phải là object.`);
  }
  if (groupsConfig) {
    assertPositiveInteger(groupsConfig, ['numGroups', 'num_groups'], sourceLabel, 'số bảng');
    assertPositiveInteger(groupsConfig, ['teamsPerGroup', 'teams_per_group'], sourceLabel, 'số đội mỗi bảng');
    assertPositiveInteger(groupsConfig, ['roundsToPlay', 'rounds_to_play'], sourceLabel, 'số lượt vòng bảng');
    const numGroups = readNumber(groupsConfig, ['numGroups', 'num_groups']);
    const teamsPerGroup = readNumber(groupsConfig, ['teamsPerGroup', 'teams_per_group']);
    if (numGroups != null && numGroups < 2) {
      throw new BadRequestException(`${sourceLabel}: vòng bảng + loại trực tiếp phải có ít nhất 2 bảng.`);
    }
    if (teamsPerGroup != null && teamsPerGroup < 2) {
      throw new BadRequestException(`${sourceLabel}: mỗi bảng phải có ít nhất 2 đội.`);
    }

    const configuredGroups = groupsConfig.groups ?? groupsConfig.configuredGroups ?? groupsConfig.groupConfigs;
    if (configuredGroups !== undefined && !Array.isArray(configuredGroups)) {
      throw new BadRequestException(`${sourceLabel}: danh sách cấu hình bảng phải là array.`);
    }
    if (Array.isArray(configuredGroups)) {
      if (numGroups != null && configuredGroups.length !== numGroups) {
        throw new BadRequestException(`${sourceLabel}: số cấu hình bảng phải khớp numGroups.`);
      }
      for (const [index, configuredGroup] of configuredGroups.entries()) {
        if (!isRecord(configuredGroup)) {
          throw new BadRequestException(`${sourceLabel}.groupsConfig.groups.${index}: cấu hình bảng phải là object.`);
        }
      }
    }
  }

  const advancementConfig = asRecord(payload.advancementConfig);
  if (payload.advancementConfig !== undefined && !advancementConfig) {
    throw new BadRequestException(`${sourceLabel}: advancementConfig phải là object.`);
  }
  if (advancementConfig) {
    assertPositiveInteger(advancementConfig, ['teamsAdvancing'], sourceLabel, 'số đội đi tiếp mỗi bảng');
    const allowWildcard = advancementConfig.allowWildcardThird;
    if (allowWildcard !== undefined && typeof allowWildcard !== 'boolean') {
      throw new BadRequestException(`${sourceLabel}: allowWildcardThird phải là boolean.`);
    }
  }

  const playoffConfig = asRecord(payload.playoffConfig);
  if (payload.playoffConfig !== undefined && !playoffConfig) {
    throw new BadRequestException(`${sourceLabel}: playoffConfig phải là object.`);
  }
  if (playoffConfig) {
    if (playoffConfig.type !== undefined && !['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION'].includes(String(playoffConfig.type))) {
      throw new BadRequestException(`${sourceLabel}: thể thức playoff không hợp lệ.`);
    }
    if (playoffConfig.seedingType !== undefined && !['SEEDED', 'RANDOM'].includes(String(playoffConfig.seedingType))) {
      throw new BadRequestException(`${sourceLabel}: cách xếp hạt giống playoff không hợp lệ.`);
    }
  }

  const tiebreakerRules = asRecord(payload.tiebreakerRules);
  if (payload.tiebreakerRules !== undefined && !tiebreakerRules) {
    throw new BadRequestException(`${sourceLabel}: tiebreakerRules phải là object.`);
  }
  if (tiebreakerRules) {
    const allowedRules = ['SET_DIFF', 'H2H_POINTS', 'POINT_DIFF'];
    if (tiebreakerRules.primary !== undefined && !allowedRules.includes(String(tiebreakerRules.primary))) {
      throw new BadRequestException(`${sourceLabel}: tiêu chí phân hạng chính không hợp lệ.`);
    }
    if (tiebreakerRules.secondary !== undefined && (
      !Array.isArray(tiebreakerRules.secondary) ||
      tiebreakerRules.secondary.some((rule) => !allowedRules.includes(String(rule)))
    )) {
      throw new BadRequestException(`${sourceLabel}: danh sách tiêu chí phân hạng phụ không hợp lệ.`);
    }
  }
}

export function validateSportRuleConfig(
  payload: Record<string, unknown> | null | undefined,
  options: ValidateSportRuleConfigOptions,
) {
  if (payload == null) {
    return;
  }

  if (!isRecord(payload)) {
    throw new BadRequestException(`${options.sourceLabel}: cấu hình luật phải là object.`);
  }

  const payloadKind = normalizeSportRuleKind(payload.kind);
  const kind = payloadKind ?? options.expectedKind ?? null;
  if (!kind) {
    throw new BadRequestException(`${options.sourceLabel}: không xác định được kind của luật thi đấu.`);
  }

  const allowedKinds = options.allowedKinds && options.allowedKinds.length > 0
    ? options.allowedKinds
    : (options.expectedKind ? [options.expectedKind] : []);
  if (allowedKinds.length > 0 && !allowedKinds.includes(kind)) {
    throw new BadRequestException(
      `${options.sourceLabel}: kind ${kind} không nằm trong nhóm luật được phép (${allowedKinds.join(', ')}).`,
    );
  }

  const allowedKeys = new Set(COMMON_ROOT_KEYS);
  if (options.allowRoundStructure) {
    for (const key of ROUND_STRUCTURE_KEYS) {
      allowedKeys.add(key);
    }
  }
  if (options.allowRoundMetadata) {
    for (const key of ROUND_METADATA_KEYS) {
      allowedKeys.add(key);
    }
  }

  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      throw new BadRequestException(`${options.sourceLabel}: field ${key} không hợp lệ cho luật ${kind}.`);
    }
  }

  const scoringModel = payload.scoringModel ?? payload.scoring_model;
  if (scoringModel !== undefined && scoringModel !== SCORING_MODEL_BY_KIND[kind]) {
    throw new BadRequestException(
      `${options.sourceLabel}: scoringModel ${String(scoringModel)} không khớp với kind ${kind}.`,
    );
  }

  validateScoringSemantics(kind, payload, options.sourceLabel);

  const format = asRecord(payload.format);
  if (format) {
    validateFormatBlock(kind, format, `${options.sourceLabel}.format`);
  }

  const scoring = asRecord(payload.scoring);
  if (scoring) {
    validateScoringBlock(scoring, kind, `${options.sourceLabel}.scoring`);
  }

  if (options.allowRoundStructure) {
    validateGroupStageStructure(payload, options.sourceLabel);
    const defaultOverride = asRecord(payload.defaultOverride ?? payload.default_override);
    if (defaultOverride) {
      validateSportRuleConfig(defaultOverride, {
        expectedKind: kind,
        sourceLabel: `${options.sourceLabel}.defaultOverride`,
        allowRoundMetadata: true,
      });
    }

    const rounds = asRecord(payload.rounds ?? payload.roundConfigs);
    if (rounds) {
      for (const [roundKey, roundValue] of Object.entries(rounds)) {
        if (!isRecord(roundValue)) {
          throw new BadRequestException(`${options.sourceLabel}.rounds.${roundKey}: cấu hình vòng phải là object.`);
        }

        validateSportRuleConfig(roundValue, {
          expectedKind: kind,
          sourceLabel: `${options.sourceLabel}.rounds.${roundKey}`,
          allowRoundMetadata: true,
        });
      }
    }
  }
}

export function inferExpectedSportRuleKind(source: CategoryRuleSource): SportRuleKind {
  return inferSportRuleKindFromCategory(source);
}

export function inferAllowedSportRuleKinds(source: CategoryRuleSource): SportRuleKind[] {
  return resolveAllowedKindsFromCategory(source);
}
