"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTennisScoreDetails = validateTennisScoreDetails;
const common_1 = require("@nestjs/common");
function validateTennisSetScore(key, scoreStr, p1, p2, pointsPerSet, maxPoints) {
    const maxScore = Math.max(p1, p2);
    const minScore = Math.min(p1, p2);
    const diff = maxScore - minScore;
    if (p1 === p2) {
        throw new common_1.BadRequestException(`Set ${key}: Tennis không cho phép set hòa.`);
    }
    if (maxScore < pointsPerSet) {
        throw new common_1.BadRequestException(`Set ${key}: Người thắng phải đạt ít nhất ${pointsPerSet} game.`);
    }
    if (maxScore > maxPoints) {
        throw new common_1.BadRequestException(`Set ${key}: Số game không được vượt quá ${maxPoints}.`);
    }
    if (maxScore === pointsPerSet) {
        if (diff < 2 || minScore > pointsPerSet - 2) {
            throw new common_1.BadRequestException(`Set ${key}: Kết quả ${scoreStr} không hợp lệ cho tennis.`);
        }
        return;
    }
    if (maxScore === maxPoints) {
        if (minScore !== maxPoints - 2 && minScore !== maxPoints - 1) {
            throw new common_1.BadRequestException(`Set ${key}: Kết quả ${scoreStr} không hợp lệ cho tennis.`);
        }
        return;
    }
    throw new common_1.BadRequestException(`Set ${key}: Kết quả ${scoreStr} không hợp lệ cho tennis.`);
}
function validateTennisScoreDetails(context) {
    const { resolvedConfig, normalizedEntries } = context;
    const setsToWin = Math.ceil(resolvedConfig.bestOf / 2);
    let p1SetsWon = 0;
    let p2SetsWon = 0;
    let winnerReachedAtSetIndex = null;
    const lastEntryIndex = normalizedEntries.length - 1;
    for (const [index, entry] of normalizedEntries.entries()) {
        const isLiveFinalSet = index === lastEntryIndex && entry.isFinished === false;
        if (!entry.isFinished && !isLiveFinalSet) {
            throw new common_1.BadRequestException(`Set ${entry.key}: Chỉ set cuối cùng mới được để trạng thái đang diễn ra.`);
        }
        if (isLiveFinalSet) {
            continue;
        }
        const winner = entry.p1 > entry.p2 ? 'P1' : entry.p2 > entry.p1 ? 'P2' : null;
        if (!winner) {
            throw new common_1.BadRequestException(`Set ${entry.key}: Không được phép hòa ${entry.scoreStr}.`);
        }
        validateTennisSetScore(entry.key, entry.scoreStr, entry.p1, entry.p2, resolvedConfig.pointsPerSet, resolvedConfig.maxPoints);
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
            throw new common_1.BadRequestException('Số set thắng đang vượt quá cấu hình tennis hiện tại.');
        }
        if (p1SetsWon >= setsToWin && p2SetsWon >= setsToWin) {
            throw new common_1.BadRequestException('Hai bên không thể cùng đạt ngưỡng thắng trận tennis.');
        }
    }
    return {
        p1SetsWon,
        p2SetsWon,
        setsToWin,
        totalSets: normalizedEntries.length,
    };
}
//# sourceMappingURL=validate-tennis-score.js.map