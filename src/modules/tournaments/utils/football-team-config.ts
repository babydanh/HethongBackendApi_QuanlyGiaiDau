import { BadRequestException } from '@nestjs/common';

export const FOOTBALL_TEAM_SIZES = [5, 7, 11] as const;
export type FootballTeamSize = (typeof FOOTBALL_TEAM_SIZES)[number];

export interface FootballTeamConfigResolution {
  isTeamSport: boolean;
  mainSize: number;
  maxReserve: number;
  maxTotalSize: number;
}

export interface FootballTeamConfigValidationOptions {
  requireTeamSize?: boolean;
}

/**
 * Validate the persisted tournamentConfig boundary before registration starts.
 * The DTO intentionally keeps tournamentConfig extensible for other sports,
 * so football-specific invariants belong here instead of being trusted only
 * by the web/app selectors.
 */
export function assertValidFootballTeamConfig(
  input: unknown,
  options: FootballTeamConfigValidationOptions = {},
): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('Cấu hình bóng đá không hợp lệ.');
  }

  const record = input as Record<string, unknown>;
  const rawTeamSize = record.teamSize;
  const rawMinTeamSize = record.minTeamSize;
  const teamSize = rawTeamSize === undefined ? undefined : Number(rawTeamSize);
  const minTeamSize = rawMinTeamSize === undefined ? undefined : Number(rawMinTeamSize);
  const isAllowedSize = (value: number | undefined): value is FootballTeamSize =>
    value !== undefined && Number.isInteger(value) && FOOTBALL_TEAM_SIZES.includes(value as FootballTeamSize);

  if (options.requireTeamSize && !isAllowedSize(teamSize)) {
    throw new BadRequestException('Bóng đá phải chọn sân 5, 7 hoặc 11 người.');
  }
  if (teamSize !== undefined && !isAllowedSize(teamSize)) {
    throw new BadRequestException('teamSize bóng đá chỉ nhận 5, 7 hoặc 11.');
  }
  if (minTeamSize !== undefined && !isAllowedSize(minTeamSize)) {
    throw new BadRequestException('minTeamSize bóng đá chỉ nhận 5, 7 hoặc 11.');
  }
  if (teamSize !== undefined && minTeamSize !== undefined && teamSize !== minTeamSize) {
    throw new BadRequestException('teamSize và minTeamSize phải cùng một cỡ sân.');
  }

  if (record.teamSizeOptions !== undefined) {
    if (!Array.isArray(record.teamSizeOptions) || record.teamSizeOptions.length === 0) {
      throw new BadRequestException('teamSizeOptions bóng đá không được rỗng.');
    }
    const optionsAreValid = record.teamSizeOptions.every((value) => isAllowedSize(Number(value)));
    if (!optionsAreValid || (teamSize !== undefined && !record.teamSizeOptions.some((value) => Number(value) === teamSize))) {
      throw new BadRequestException('teamSizeOptions bóng đá không khớp cỡ sân đã chọn.');
    }
  }

  const maxReserve = record.maxReserve === undefined ? 0 : Number(record.maxReserve);
  if (!Number.isInteger(maxReserve) || maxReserve < 0 || maxReserve > 20) {
    throw new BadRequestException('Số cầu thủ dự bị phải từ 0 đến 20.');
  }
  if (record.allowReserve === false && maxReserve > 0) {
    throw new BadRequestException('Không cho phép dự bị thì maxReserve phải bằng 0.');
  }

  const mainSize = teamSize ?? minTeamSize;
  const maxTeamSize = record.maxTeamSize === undefined ? undefined : Number(record.maxTeamSize);
  if (maxTeamSize !== undefined) {
    if (!Number.isInteger(maxTeamSize) || maxTeamSize < 0 || (mainSize !== undefined && maxTeamSize < mainSize)) {
      throw new BadRequestException('maxTeamSize phải đủ số cầu thủ chính của sân.');
    }
    if (mainSize !== undefined && maxTeamSize - mainSize < maxReserve) {
      throw new BadRequestException('maxTeamSize không đủ chỗ cho số cầu thủ dự bị.');
    }
  }

  for (const key of ['twoLegged', 'awayGoalsRule', 'penaltyShootout', 'allowDraw']) {
    if (record[key] !== undefined && typeof record[key] !== 'boolean') {
      throw new BadRequestException(`${key} bóng đá phải là boolean.`);
    }
  }
}

/**
 * Resolve all football roster limits from the legacy and current config shapes.
 * `teamSize` remains the selected format; `teamSizeOptions` is only a legacy
 * fallback for records created before the selector stored that value.
 */
export function resolveFootballTeamConfig(input: unknown): FootballTeamConfigResolution {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { isTeamSport: false, mainSize: 0, maxReserve: 0, maxTotalSize: Number.MAX_SAFE_INTEGER };
  }

  const record = input as Record<string, unknown>;
  const explicitSize = Number(record.teamSize);
  const minSize = Number(record.minTeamSize);
  const option = Array.isArray(record.teamSizeOptions)
    ? record.teamSizeOptions.map(Number).find((size) => FOOTBALL_TEAM_SIZES.includes(size as FootballTeamSize))
    : undefined;
  const mainSize = [explicitSize, minSize, option ?? 0].find(
    (size) => Number.isInteger(size) && FOOTBALL_TEAM_SIZES.includes(size as FootballTeamSize),
  ) ?? 0;
  const isTeamSport = mainSize > 0 || record.teamSize !== undefined || record.minTeamSize !== undefined || option !== undefined;
  if (!isTeamSport) {
    return { isTeamSport: false, mainSize: 0, maxReserve: 0, maxTotalSize: Number.MAX_SAFE_INTEGER };
  }

  const configuredReserve = Number(record.maxReserve ?? 0);
  const maxReserve = record.allowReserve === false
    ? 0
    : Number.isFinite(configuredReserve) && configuredReserve > 0
      ? Math.floor(configuredReserve)
      : 0;
  const configuredMax = Number(record.maxTeamSize);
  const maxTotalSize = Number.isInteger(configuredMax) && configuredMax >= mainSize
    ? configuredMax
    : mainSize + maxReserve;

  return { isTeamSport: true, mainSize, maxReserve, maxTotalSize };
}
