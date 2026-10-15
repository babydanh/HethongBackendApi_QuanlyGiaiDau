import { BadRequestException } from '@nestjs/common';

/** Phiên bản schema CourtState (spec pickleball mục 3). */
export const COURT_STATE_VERSION = 1;
/** Server giữ tối đa N snapshot lịch sử mới nhất; phần cũ hơn bị cắt. */
export const COURT_STATE_HISTORY_LIMIT = 20;

export type CourtTeam = 1 | 2;
export type CourtPlayerIndex = 0 | 1;
export type CourtServerNumber = 1 | 2;

export interface CourtServerOverride {
  team: CourtTeam;
  playerIndex: CourtPlayerIndex;
}

export interface CourtTurnStart {
  team: CourtTeam;
  serverNumber: CourtServerNumber;
  teamScoreAtStart: number;
  serverPlayerIndex: CourtPlayerIndex;
}

/** Cài đặt sân không kèm lịch sử; là phần tử của `history`. */
export interface CourtStateSnapshot {
  version: typeof COURT_STATE_VERSION;
  startingRight: { team1: CourtPlayerIndex; team2: CourtPlayerIndex };
  endsOverride: boolean | null;
  autoSwitchEnds: boolean;
  midSetSwitchDone: boolean;
  serverOverride: CourtServerOverride | null;
  turnStart: CourtTurnStart | null;
}

export interface CourtState extends CourtStateSnapshot {
  history: CourtStateSnapshot[];
  /** Server gán; client không được tự đặt. */
  updatedAt: string;
  /** Server gán; client không được tự đặt. */
  updatedBy: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseOneOf<T extends number>(
  value: unknown,
  allowed: readonly T[],
  message: string,
): T {
  if (typeof value !== 'number' || !allowed.includes(value as T)) {
    throw new BadRequestException(message);
  }
  return value as T;
}

function parseBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new BadRequestException(`${path} phải là boolean.`);
  }
  return value;
}

function parseNullableBoolean(value: unknown, path: string): boolean | null {
  if (value === null || typeof value === 'boolean') {
    return value;
  }
  throw new BadRequestException(`${path} phải là boolean hoặc null.`);
}

function parseNonNegativeInt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new BadRequestException(`${path} phải là số nguyên không âm.`);
  }
  return value;
}

function parseStartingRight(
  value: unknown,
  path: string,
): CourtStateSnapshot['startingRight'] {
  if (!isRecord(value)) {
    throw new BadRequestException(`${path} phải là object { team1, team2 }.`);
  }
  return {
    team1: parseOneOf<CourtPlayerIndex>(
      value.team1,
      [0, 1],
      `${path}.team1 chỉ được là 0 hoặc 1.`,
    ),
    team2: parseOneOf<CourtPlayerIndex>(
      value.team2,
      [0, 1],
      `${path}.team2 chỉ được là 0 hoặc 1.`,
    ),
  };
}

function parseServerOverride(
  value: unknown,
  path: string,
): CourtServerOverride | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new BadRequestException(
      `${path} phải là null hoặc object { team, playerIndex }.`,
    );
  }
  return {
    team: parseOneOf<CourtTeam>(
      value.team,
      [1, 2],
      `${path}.team chỉ được là 1 hoặc 2.`,
    ),
    playerIndex: parseOneOf<CourtPlayerIndex>(
      value.playerIndex,
      [0, 1],
      `${path}.playerIndex chỉ được là 0 hoặc 1.`,
    ),
  };
}

function parseTurnStart(value: unknown, path: string): CourtTurnStart | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new BadRequestException(
      `${path} phải là null hoặc object { team, serverNumber, teamScoreAtStart, serverPlayerIndex }.`,
    );
  }
  return {
    team: parseOneOf<CourtTeam>(
      value.team,
      [1, 2],
      `${path}.team chỉ được là 1 hoặc 2.`,
    ),
    serverNumber: parseOneOf<CourtServerNumber>(
      value.serverNumber,
      [1, 2],
      `${path}.serverNumber chỉ được là 1 hoặc 2.`,
    ),
    teamScoreAtStart: parseNonNegativeInt(
      value.teamScoreAtStart,
      `${path}.teamScoreAtStart`,
    ),
    serverPlayerIndex: parseOneOf<CourtPlayerIndex>(
      value.serverPlayerIndex,
      [0, 1],
      `${path}.serverPlayerIndex chỉ được là 0 hoặc 1.`,
    ),
  };
}

/**
 * Validate một snapshot theo schema. Chỉ các trường trong schema được giữ lại,
 * nên `history` lồng nhau, `updatedAt`/`updatedBy` và key lạ bị loại bỏ.
 */
function parseSnapshot(value: unknown, path: string): CourtStateSnapshot {
  if (!isRecord(value)) {
    throw new BadRequestException(`${path} phải là object CourtState.`);
  }
  if (value.version !== COURT_STATE_VERSION) {
    throw new BadRequestException(
      `${path}.version phải là ${COURT_STATE_VERSION}.`,
    );
  }
  return {
    version: COURT_STATE_VERSION,
    startingRight: parseStartingRight(
      value.startingRight,
      `${path}.startingRight`,
    ),
    endsOverride: parseNullableBoolean(
      value.endsOverride,
      `${path}.endsOverride`,
    ),
    autoSwitchEnds: parseBoolean(
      value.autoSwitchEnds,
      `${path}.autoSwitchEnds`,
    ),
    midSetSwitchDone: parseBoolean(
      value.midSetSwitchDone,
      `${path}.midSetSwitchDone`,
    ),
    serverOverride: parseServerOverride(
      value.serverOverride,
      `${path}.serverOverride`,
    ),
    turnStart: parseTurnStart(value.turnStart, `${path}.turnStart`),
  };
}

/**
 * Validate CourtState từ client và trả về bản sẵn sàng lưu: server tự gán
 * updatedAt/updatedBy, và chỉ giữ {@link COURT_STATE_HISTORY_LIMIT} snapshot mới nhất.
 * Sai schema → BadRequestException (400).
 */
export function normalizeCourtState(
  input: unknown,
  updatedBy: string,
  now: Date,
): CourtState {
  if (!isRecord(input)) {
    throw new BadRequestException('courtState phải là object CourtState.');
  }
  const current = parseSnapshot(input, 'courtState');
  const rawHistory = input.history;
  if (!Array.isArray(rawHistory)) {
    throw new BadRequestException('courtState.history phải là mảng snapshot.');
  }
  const history = rawHistory.map((item, index) =>
    parseSnapshot(item, `courtState.history[${index}]`),
  );

  return {
    ...current,
    history: history.slice(-COURT_STATE_HISTORY_LIMIT),
    updatedAt: now.toISOString(),
    updatedBy,
  };
}
