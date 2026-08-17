"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FOOTBALL_TEAM_SIZES = void 0;
exports.assertValidFootballTeamConfig = assertValidFootballTeamConfig;
exports.resolveFootballTeamConfig = resolveFootballTeamConfig;
const common_1 = require("@nestjs/common");
exports.FOOTBALL_TEAM_SIZES = [5, 7, 11];
function assertValidFootballTeamConfig(input, options = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new common_1.BadRequestException('Cấu hình bóng đá không hợp lệ.');
    }
    const record = input;
    const rawTeamSize = record.teamSize;
    const rawMinTeamSize = record.minTeamSize;
    const teamSize = rawTeamSize === undefined ? undefined : Number(rawTeamSize);
    const minTeamSize = rawMinTeamSize === undefined ? undefined : Number(rawMinTeamSize);
    const isAllowedSize = (value) => value !== undefined && Number.isInteger(value) && exports.FOOTBALL_TEAM_SIZES.includes(value);
    if (options.requireTeamSize && !isAllowedSize(teamSize)) {
        throw new common_1.BadRequestException('Bóng đá phải chọn sân 5, 7 hoặc 11 người.');
    }
    if (teamSize !== undefined && !isAllowedSize(teamSize)) {
        throw new common_1.BadRequestException('teamSize bóng đá chỉ nhận 5, 7 hoặc 11.');
    }
    if (minTeamSize !== undefined && !isAllowedSize(minTeamSize)) {
        throw new common_1.BadRequestException('minTeamSize bóng đá chỉ nhận 5, 7 hoặc 11.');
    }
    if (teamSize !== undefined && minTeamSize !== undefined && teamSize !== minTeamSize) {
        throw new common_1.BadRequestException('teamSize và minTeamSize phải cùng một cỡ sân.');
    }
    if (record.teamSizeOptions !== undefined) {
        if (!Array.isArray(record.teamSizeOptions) || record.teamSizeOptions.length === 0) {
            throw new common_1.BadRequestException('teamSizeOptions bóng đá không được rỗng.');
        }
        const optionsAreValid = record.teamSizeOptions.every((value) => isAllowedSize(Number(value)));
        if (!optionsAreValid || (teamSize !== undefined && !record.teamSizeOptions.some((value) => Number(value) === teamSize))) {
            throw new common_1.BadRequestException('teamSizeOptions bóng đá không khớp cỡ sân đã chọn.');
        }
    }
    const maxReserve = record.maxReserve === undefined ? 0 : Number(record.maxReserve);
    if (!Number.isInteger(maxReserve) || maxReserve < 0 || maxReserve > 20) {
        throw new common_1.BadRequestException('Số cầu thủ dự bị phải từ 0 đến 20.');
    }
    if (record.allowReserve === false && maxReserve > 0) {
        throw new common_1.BadRequestException('Không cho phép dự bị thì maxReserve phải bằng 0.');
    }
    const mainSize = teamSize ?? minTeamSize;
    const maxTeamSize = record.maxTeamSize === undefined ? undefined : Number(record.maxTeamSize);
    if (maxTeamSize !== undefined) {
        if (!Number.isInteger(maxTeamSize) || maxTeamSize < 0 || (mainSize !== undefined && maxTeamSize < mainSize)) {
            throw new common_1.BadRequestException('maxTeamSize phải đủ số cầu thủ chính của sân.');
        }
        if (mainSize !== undefined && maxTeamSize - mainSize < maxReserve) {
            throw new common_1.BadRequestException('maxTeamSize không đủ chỗ cho số cầu thủ dự bị.');
        }
    }
    for (const key of ['twoLegged', 'awayGoalsRule', 'penaltyShootout', 'allowDraw']) {
        if (record[key] !== undefined && typeof record[key] !== 'boolean') {
            throw new common_1.BadRequestException(`${key} bóng đá phải là boolean.`);
        }
    }
}
function resolveFootballTeamConfig(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { isTeamSport: false, mainSize: 0, maxReserve: 0, maxTotalSize: Number.MAX_SAFE_INTEGER };
    }
    const record = input;
    const explicitSize = Number(record.teamSize);
    const minSize = Number(record.minTeamSize);
    const option = Array.isArray(record.teamSizeOptions)
        ? record.teamSizeOptions.map(Number).find((size) => exports.FOOTBALL_TEAM_SIZES.includes(size))
        : undefined;
    const mainSize = [explicitSize, minSize, option ?? 0].find((size) => Number.isInteger(size) && exports.FOOTBALL_TEAM_SIZES.includes(size)) ?? 0;
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
//# sourceMappingURL=football-team-config.js.map