"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePickleballSideOutScoreDetails = validatePickleballSideOutScoreDetails;
const common_1 = require("@nestjs/common");
const score_validation_utils_1 = require("./score-validation.utils");
function validatePickleballSideOutGameScore(key, scoreStr, maxScore, minScore, diff, pointsPerSet, deuceEnabled, tiebreakAt, maxPoints) {
    if (maxScore < pointsPerSet) {
        throw new common_1.BadRequestException(`Game ${key}: Đội thắng phải đạt tối thiểu ${pointsPerSet} điểm trong mode side-out.`);
    }
    if (deuceEnabled) {
        if (minScore >= tiebreakAt) {
            if (diff !== 2) {
                throw new common_1.BadRequestException(`Game ${key}: Pickleball side-out yêu cầu thắng cách 2 điểm ở giai đoạn cuối.`);
            }
        }
        else if (maxScore !== pointsPerSet) {
            throw new common_1.BadRequestException(`Game ${key}: Điểm đích chuẩn của side-out là ${pointsPerSet}.`);
        }
    }
    else if (maxScore !== pointsPerSet) {
        throw new common_1.BadRequestException(`Game ${key}: Khi tắt win-by-two, đội thắng phải chạm đúng ${pointsPerSet}.`);
    }
    if (maxScore > maxPoints && maxPoints > 0) {
        throw new common_1.BadRequestException(`Game ${key}: Điểm số ${scoreStr} vượt quá ngưỡng cấu hình hiện tại (${maxPoints}).`);
    }
}
function validatePickleballSideOutScoreDetails(context) {
    const { scoreDetails, resolvedConfig, normalizedEntries } = context;
    (0, score_validation_utils_1.validatePickleballSideOutState)(scoreDetails);
    const setsToWin = Math.ceil(resolvedConfig.bestOf / 2);
    let p1SetsWon = 0;
    let p2SetsWon = 0;
    let winnerReachedAtSetIndex = null;
    const lastEntryIndex = normalizedEntries.length - 1;
    for (const [index, entry] of normalizedEntries.entries()) {
        const isLiveFinalSet = index === lastEntryIndex && entry.isFinished === false;
        if (!entry.isFinished && !isLiveFinalSet) {
            throw new common_1.BadRequestException(`Game ${entry.key}: Chỉ game cuối cùng mới được để trạng thái đang diễn ra.`);
        }
        if (isLiveFinalSet) {
            continue;
        }
        const maxScore = Math.max(entry.p1, entry.p2);
        const minScore = Math.min(entry.p1, entry.p2);
        const diff = maxScore - minScore;
        const winner = entry.p1 > entry.p2 ? 'P1' : entry.p2 > entry.p1 ? 'P2' : null;
        if (!winner) {
            throw new common_1.BadRequestException(`Game ${entry.key}: Không được phép hòa ${entry.scoreStr}.`);
        }
        validatePickleballSideOutGameScore(entry.key, entry.scoreStr, maxScore, minScore, diff, resolvedConfig.pointsPerSet, resolvedConfig.deuceEnabled, resolvedConfig.tiebreakAt, resolvedConfig.maxPoints);
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
            throw new common_1.BadRequestException('Số game thắng đang vượt quá cấu hình pickleball side-out.');
        }
        if (p1SetsWon >= setsToWin && p2SetsWon >= setsToWin) {
            throw new common_1.BadRequestException('Hai bên không thể cùng đạt ngưỡng thắng trận pickleball side-out.');
        }
    }
    return {
        p1SetsWon,
        p2SetsWon,
        setsToWin,
        totalSets: normalizedEntries.length,
    };
}
//# sourceMappingURL=validate-pickleball-side-out-score.js.map