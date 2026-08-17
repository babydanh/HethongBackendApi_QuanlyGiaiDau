"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateFootballScoreDetails = validateFootballScoreDetails;
const common_1 = require("@nestjs/common");
function validateFootballScoreDetails(context) {
    const { resolvedConfig } = context;
    const football = context.scoreDetails.football;
    const normalizedEntries = football && typeof football === 'object' && !Array.isArray(football)
        ? (() => {
            const value = football;
            const team1Goals = value.team1Goals;
            const team2Goals = value.team2Goals;
            if (typeof team1Goals !== 'number' ||
                typeof team2Goals !== 'number' ||
                !Number.isInteger(team1Goals) ||
                !Number.isInteger(team2Goals) ||
                team1Goals < 0 ||
                team2Goals < 0) {
                throw new common_1.BadRequestException('football.team1Goals và football.team2Goals phải là số nguyên không âm.');
            }
            const phase = typeof value.phase === 'string' ? value.phase : 'FIRST_HALF';
            const phases = new Set([
                'FIRST_HALF',
                'HALFTIME',
                'SECOND_HALF',
                'STOPPAGE_TIME',
                'FULL_TIME',
                'EXTRA_TIME_FIRST_HALF',
                'EXTRA_TIME_BREAK',
                'EXTRA_TIME_SECOND_HALF',
                'PENALTY_SHOOTOUT',
                'COMPLETED',
            ]);
            if (!phases.has(phase)) {
                throw new common_1.BadRequestException('football.phase không hợp lệ.');
            }
            if (value.minute !== undefined &&
                (!Number.isInteger(value.minute) ||
                    Number(value.minute) < 0 ||
                    Number(value.minute) > 150)) {
                throw new common_1.BadRequestException('football.minute không hợp lệ (0-150).');
            }
            if (value.addedMinute !== undefined &&
                (!Number.isInteger(value.addedMinute) ||
                    Number(value.addedMinute) < 0 ||
                    Number(value.addedMinute) > 30)) {
                throw new common_1.BadRequestException('football.addedMinute không hợp lệ (0-30).');
            }
            if (value.events !== undefined) {
                if (!Array.isArray(value.events) || value.events.length > 500) {
                    throw new common_1.BadRequestException('football.events phải là danh sách tối đa 500 sự kiện.');
                }
                for (const event of value.events) {
                    if (!event || typeof event !== 'object' || Array.isArray(event)) {
                        throw new common_1.BadRequestException('football.events chứa phần tử không hợp lệ.');
                    }
                    const item = event;
                    if (![
                        'GOAL',
                        'OWN_GOAL',
                        'PENALTY_GOAL',
                        'YELLOW_CARD',
                        'RED_CARD',
                        'FOUL',
                        'SUBSTITUTION',
                        'VAR',
                        'NOTE',
                    ].includes(String(item.type))) {
                        throw new common_1.BadRequestException('football.events.type không hợp lệ.');
                    }
                    if (item.team !== 1 && item.team !== 2) {
                        throw new common_1.BadRequestException('football.events.team phải là 1 hoặc 2.');
                    }
                    if (item.minute !== undefined &&
                        (!Number.isInteger(item.minute) ||
                            Number(item.minute) < 0 ||
                            Number(item.minute) > 150)) {
                        throw new common_1.BadRequestException('football.events.minute không hợp lệ.');
                    }
                    if (item.addedMinute !== undefined &&
                        (!Number.isInteger(item.addedMinute) ||
                            Number(item.addedMinute) < 0 ||
                            Number(item.addedMinute) > 30)) {
                        throw new common_1.BadRequestException('football.events.addedMinute không hợp lệ.');
                    }
                }
            }
            const isFinished = phase === 'FULL_TIME' ||
                phase === 'COMPLETED' ||
                phase === 'PENALTY_SHOOTOUT';
            return [
                {
                    key: 'football',
                    p1: team1Goals,
                    p2: team2Goals,
                    scoreStr: `${team1Goals}-${team2Goals}`,
                    isFinished,
                    isOverridden: false,
                },
            ];
        })()
        : context.normalizedEntries;
    const setsToWin = 1;
    let p1SetsWon = 0;
    let p2SetsWon = 0;
    let winnerReachedAtSetIndex = null;
    const lastEntryIndex = normalizedEntries.length - 1;
    for (const [index, entry] of normalizedEntries.entries()) {
        const isLiveFinalSet = index === lastEntryIndex && entry.isFinished === false;
        if (!entry.isFinished && !isLiveFinalSet) {
            throw new common_1.BadRequestException(`Trận ${entry.key}: Chỉ trận đang diễn ra cuối cùng mới được để trạng thái chưa kết thúc.`);
        }
        if (isLiveFinalSet) {
            continue;
        }
        const p1 = entry.p1;
        const p2 = entry.p2;
        if (p1 < 0 || p2 < 0) {
            throw new common_1.BadRequestException(`Trận ${entry.key}: Tỷ số bàn thắng không được âm.`);
        }
        if (p1 === 0 && p2 === 0) {
            p1SetsWon += 0;
            p2SetsWon += 0;
            continue;
        }
        const winner = p1 > p2 ? 'P1' : p2 > p1 ? 'P2' : null;
        if (winner === 'P1') {
            p1SetsWon += 1;
        }
        else if (winner === 'P2') {
            p2SetsWon += 1;
        }
        if (winnerReachedAtSetIndex === null &&
            (p1SetsWon >= setsToWin || p2SetsWon >= setsToWin)) {
            winnerReachedAtSetIndex = index;
        }
        else if (winnerReachedAtSetIndex !== null &&
            resolvedConfig.mode !== 'LITE') {
            throw new common_1.BadRequestException(`Không được nhập thêm ${entry.key} sau khi trận đã chốt người thắng từ trước.`);
        }
    }
    return {
        p1SetsWon,
        p2SetsWon,
        setsToWin,
        totalSets: normalizedEntries.length,
    };
}
//# sourceMappingURL=validate-football-score.js.map