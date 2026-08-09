const SPORT_RULE_KEYS = [
  'kind',
  'format',
  'scoringModel',
  'scoring_model',
  'scoring',
  'bestOf',
  'best_of',
  'setsToWin',
  'sets_to_win',
  'pointsPerSet',
  'points_per_set',
  'mustWinByTwo',
  'must_win_by_two',
  'winByTwo',
  'win_by_two',
  'deuceEnabled',
  'deuce_enabled',
  'maxPoints',
  'max_points',
  'maxPointsPerSet',
  'tiebreakAt',
  'tiebreak_at',
  'tiebreakPoints',
  'tiebreak_points',
  'rounds',
  'roundConfigs',
] as const;

export interface ConfiguredRoundRobinGroup {
  name?: string;
  participantIds: string[];
  roundConfig: Record<string, unknown>;
}

export interface RoundRobinScheduledMatch {
  participant1Id: string;
  participant2Id: string;
  roundNumber: number;
  leg: number;
}

export function asConfigRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function extractSportRuleOverrides(value: unknown): Record<string, unknown> {
  const source = asConfigRecord(value);
  if (!source) return {};

  const overrides: Record<string, unknown> = {};
  for (const key of SPORT_RULE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] != null) {
      overrides[key] = source[key];
    }
  }

  for (const nestedKey of ['sportRules', 'roundConfig', 'matchRules', 'rules']) {
    const nested = asConfigRecord(source[nestedKey]);
    if (nested) Object.assign(overrides, extractSportRuleOverrides(nested));
  }

  return overrides;
}

function findConfiguredGroupArray(source: Record<string, unknown>): unknown[] | null {
  const groupsConfig = asConfigRecord(source.groupsConfig);
  for (const candidate of [
    groupsConfig?.groups,
    groupsConfig?.configuredGroups,
    groupsConfig?.groupConfigs,
    source.configuredGroups,
    source.groupConfigs,
  ]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return null;
}

/** Sources are ordered from most specific to least specific. */
export function resolveConfiguredGroups(
  ...sources: Array<Record<string, unknown> | null | undefined>
): ConfiguredRoundRobinGroup[] {
  for (const source of sources) {
    if (!source) continue;
    const definitions = findConfiguredGroupArray(source);
    if (!definitions) continue;

    return definitions.map((definition) => {
      const group = asConfigRecord(definition) || {};
      const participantIds = [group.participantIds, group.teamIds]
        .find((value): value is unknown[] => Array.isArray(value))
        ?.filter((value): value is string => typeof value === 'string') || [];

      return {
        name: typeof group.name === 'string' && group.name.trim() ? group.name.trim() : undefined,
        participantIds,
        roundConfig: extractSportRuleOverrides(group),
      };
    });
  }

  return [];
}

/** `roundsToPlay` is the number of complete round-robin legs. */
export function resolveRoundsToPlay(
  ...sources: Array<Record<string, unknown> | null | undefined>
): number {
  for (const source of sources) {
    if (!source) continue;
    const groupsConfig = asConfigRecord(source.groupsConfig);
    const candidates = [
      groupsConfig?.roundsToPlay,
      groupsConfig?.rounds_to_play,
      source.roundsToPlay,
      source.rounds_to_play,
      source.roundRobinLegs,
    ];
    const value = candidates.find((candidate) =>
      (typeof candidate === 'number' || typeof candidate === 'string') &&
      Number.isFinite(Number(candidate)),
    );
    if (value !== undefined) return Number(value);
  }
  return 1;
}

/** Explicit group count wins over optional per-group assignment metadata. */
export function resolveRoundRobinGroupCount(
  groupsConfig: Record<string, unknown>,
  configuredGroups: ConfiguredRoundRobinGroup[],
  participantCount: number,
  maxPerGroup: number,
): number {
  const configuredCount = [groupsConfig.numGroups, groupsConfig.num_groups]
    .map((value) => typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN)
    .find((value) => Number.isFinite(value));

  if (configuredCount !== undefined) return Math.trunc(configuredCount);
  if (configuredGroups.length > 0) return configuredGroups.length;
  return Math.max(1, Math.ceil(participantCount / maxPerGroup));
}

/** Build one independent circle-method schedule per group and leg. */
export function buildRoundRobinSchedule(
  participantIds: string[],
  legs: number,
): RoundRobinScheduledMatch[] {
  if (!Number.isInteger(legs) || legs < 1 || legs > 5) {
    throw new Error('Số lượt vòng tròn phải nằm trong khoảng 1-5.');
  }

  const teamList: (string | null)[] = [...participantIds];
  if (teamList.length < 2) return [];
  if (teamList.length % 2 !== 0) teamList.push(null);

  const teamCount = teamList.length;
  const roundsPerLeg = teamCount - 1;
  const matchesPerRound = teamCount / 2;
  const schedule: RoundRobinScheduledMatch[] = [];

  for (let leg = 0; leg < legs; leg++) {
    const teams = [...teamList];
    for (let round = 1; round <= roundsPerLeg; round++) {
      for (let i = 0; i < matchesPerRound; i++) {
        const home = teams[i];
        const away = teams[teamCount - 1 - i];
        if (home && away) {
          schedule.push({
            participant1Id: leg % 2 === 0 ? home : away,
            participant2Id: leg % 2 === 0 ? away : home,
            roundNumber: leg * roundsPerLeg + round,
            leg: leg + 1,
          });
        }
      }

      const last = teams.pop()!;
      teams.splice(1, 0, last);
    }
  }

  return schedule;
}

export function allocateRoundRobinGroups<T extends { id: string }>(
  participants: T[],
  groupCount: number,
  configuredGroups: ConfiguredRoundRobinGroup[],
  maxPerGroup: number,
): T[][] {
  if (!Number.isInteger(groupCount) || groupCount < 1) {
    throw new Error('Số bảng phải là số nguyên dương.');
  }
  if (groupCount * maxPerGroup < participants.length) {
    throw new Error('Cấu hình bảng không đủ chỗ cho tất cả đội tham gia.');
  }

  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const assignedIds = new Set<string>();
  const groups: T[][] = Array.from({ length: groupCount }, () => []);

  configuredGroups.forEach((group, groupIndex) => {
    if (groupIndex >= groupCount) {
      throw new Error('Số cấu hình bảng vượt quá số bảng đã khai báo.');
    }
    for (const participantId of group.participantIds) {
      const participant = participantById.get(participantId);
      if (!participant) throw new Error(`Đội ${participantId} không thuộc danh sách đủ điều kiện.`);
      if (assignedIds.has(participantId)) throw new Error(`Đội ${participantId} được cấu hình ở nhiều bảng.`);
      if (groups[groupIndex].length >= maxPerGroup) {
        throw new Error('Cấu hình bảng không đủ chỗ cho tất cả đội tham gia.');
      }
      groups[groupIndex].push(participant);
      assignedIds.add(participantId);
    }
  });

  const remaining = participants.filter((participant) => !assignedIds.has(participant.id));
  let direction = 1;
  let cursor = 0;
  for (const participant of remaining) {
    let attempts = 0;
    while (groups[cursor].length >= maxPerGroup && attempts < groupCount) {
      cursor = (cursor + direction + groupCount) % groupCount;
      attempts++;
    }
    if (attempts === groupCount) throw new Error('Cấu hình bảng không đủ chỗ cho tất cả đội tham gia.');
    groups[cursor].push(participant);

    if (direction === 1 && cursor === groupCount - 1) direction = -1;
    else if (direction === -1 && cursor === 0) direction = 1;
    else cursor += direction;
  }

  if (groups.some((group) => group.length < 2)) {
    throw new Error('Mỗi bảng phải có ít nhất 2 đội.');
  }
  return groups;
}
