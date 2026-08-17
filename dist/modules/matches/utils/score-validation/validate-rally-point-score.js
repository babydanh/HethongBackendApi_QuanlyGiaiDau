"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRallyPointScoreDetails = validateRallyPointScoreDetails;
const common_1 = require("@nestjs/common");
function validateRallyPointSetScore(key, maxScore, pointsPerSet, minScore, diff, deuceEnabled, tiebreakAt, maxPoints) {
    if (maxScore < pointsPerSet) {
        throw new common_1.BadRequestException(`Hiệp ${key}: Điểm của người thắng set (${maxScore}) phải đạt tối thiểu là ${pointsPerSet}.`);
    }
    if (deuceEnabled) {
        if (minScore >= tiebreakAt) {
            if (maxScore < maxPoints) {
                if (diff !== 2) {
                    throw new common_1.BadRequestException(`Hiệp ${key}: Trận đấu đang deuce, người thắng phải thắng cách đúng 2 điểm.`);
                }
            }
            else if (maxScore === maxPoints) {
                if (diff < 1) {
                    throw new common_1.BadRequestException(`Hiệp ${key}: Khi đạt điểm tối đa ${maxPoints}, phải có người thắng.`);
                }
            }
            else {
                throw new common_1.BadRequestException(`Hiệp ${key}: Điểm số không được vượt quá giới hạn tối đa ${maxPoints}.`);
            }
        }
        else if (maxScore !== pointsPerSet) {
            throw new common_1.BadRequestException(`Hiệp ${key}: Người thắng set phải đạt đúng ${pointsPerSet} điểm.`);
        }
        return;
    }
    if (maxScore !== pointsPerSet) {
        throw new common_1.BadRequestException(`Hiệp ${key}: Deuce bị tắt, điểm của người thắng set phải đạt đúng ${pointsPerSet}.`);
    }
}
function validateRallyPointScoreDetails(context) {
    const { resolvedConfig, normalizedEntries } = context;
    const setsToWin = Math.ceil(resolvedConfig.bestOf / 2);
    let p1SetsWon = 0;
    let p2SetsWon = 0;
    let winnerReachedAtSetIndex = null;
    const lastEntryIndex = normalizedEntries.length - 1;
    for (const [index, entry] of normalizedEntries.entries()) {
        const isLiveFinalSet = index === lastEntryIndex && entry.isFinished === false;
        if (!entry.isFinished && !isLiveFinalSet) {
            throw new common_1.BadRequestException(`Hiệp ${entry.key}: Chỉ hiệp cuối cùng mới được để trạng thái đang diễn ra.`);
        }
        if (isLiveFinalSet) {
            continue;
        }
        const maxScore = Math.max(entry.p1, entry.p2);
        const minScore = Math.min(entry.p1, entry.p2);
        const diff = maxScore - minScore;
        const winner = entry.p1 > entry.p2 ? 'P1' : entry.p2 > entry.p1 ? 'P2' : null;
        if (!winner) {
            throw new common_1.BadRequestException(`Hiệp ${entry.key}: Không được phép hòa ${entry.scoreStr}.`);
        }
        if (!entry.isOverridden)
            validateRallyPointSetScore(entry.key, maxScore, resolvedConfig.pointsPerSet, minScore, diff, resolvedConfig.deuceEnabled, resolvedConfig.tiebreakAt, resolvedConfig.maxPoints);
        if (winner === 'P1') {
            p1SetsWon += 1;
        }
        else {
            p2SetsWon += 1;
        }
        if (winnerReachedAtSetIndex === null && (p1SetsWon >= setsToWin || p2SetsWon >= setsToWin)) {
            winnerReachedAtSetIndex = index;
        }
        else if (winnerReachedAtSetIndex !== null && resolvedConfig.mode !== 'LITE') {
            throw new common_1.BadRequestException(`Không được nhập thêm ${entry.key} sau khi trận đã chốt người thắng từ trước.`);
        }
    }
    if (resolvedConfig.mode !== 'LITE') {
        if (p1SetsWon > setsToWin || p2SetsWon > setsToWin) {
            throw new common_1.BadRequestException('Số set/game thắng đang vượt quá cấu hình của trận.');
        }
        if (p1SetsWon >= setsToWin && p2SetsWon >= setsToWin) {
            throw new common_1.BadRequestException('Hai bên không thể cùng đạt ngưỡng thắng trận.');
        }
    }
    return {
        p1SetsWon,
        p2SetsWon,
        setsToWin,
        totalSets: normalizedEntries.length,
    };
}
//# sourceMappingURL=validate-rally-point-score.js.map