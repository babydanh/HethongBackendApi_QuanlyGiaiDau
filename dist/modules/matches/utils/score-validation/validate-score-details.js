"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateScoreDetails = validateScoreDetails;
const common_1 = require("@nestjs/common");
const score_validation_utils_1 = require("./score-validation.utils");
const validate_football_score_1 = require("./validate-football-score");
const validate_pickleball_side_out_score_1 = require("./validate-pickleball-side-out-score");
const validate_rally_point_score_1 = require("./validate-rally-point-score");
const validate_tennis_score_1 = require("./validate-tennis-score");
function validateScoreDetails(scoreDetails, resolvedConfig) {
    if (!scoreDetails || typeof scoreDetails !== 'object' || Array.isArray(scoreDetails)) {
        throw new common_1.BadRequestException('scoreDetails phải là object chứa tỉ số chi tiết của trận.');
    }
    const normalizedEntries = (0, score_validation_utils_1.extractNormalizedScoreEntries)(scoreDetails);
    const hasFootballPayload = resolvedConfig.kind === 'FOOTBALL'
        && Boolean(scoreDetails.football && typeof scoreDetails.football === 'object' && !Array.isArray(scoreDetails.football));
    if (normalizedEntries.length === 0 && !hasFootballPayload) {
        throw new common_1.BadRequestException('Không tìm thấy set/game hợp lệ trong scoreDetails.');
    }
    if (resolvedConfig.mode !== 'LITE' && normalizedEntries.length > resolvedConfig.bestOf) {
        throw new common_1.BadRequestException(`Số set/game nhập vào (${normalizedEntries.length}) vượt quá thể thức BO${resolvedConfig.bestOf}.`);
    }
    const normalizedEntriesForValidation = normalizedEntries.map((entry) => {
        if (!entry.isFinished || !entry.isOverridden) {
            return entry;
        }
        if (entry.p1 === entry.p2) {
            throw new common_1.BadRequestException(`Set ${entry.key}: Ngoại lệ vẫn phải xác định một bên thắng.`);
        }
        const winnerScore = resolvedConfig.pointsPerSet;
        const p1 = entry.p1 > entry.p2 ? winnerScore : 0;
        const p2 = entry.p2 > entry.p1 ? winnerScore : 0;
        return {
            ...entry,
            p1,
            p2,
            scoreStr: `${p1}-${p2}`,
        };
    });
    const context = {
        scoreDetails,
        resolvedConfig,
        normalizedEntries: normalizedEntriesForValidation,
    };
    if (resolvedConfig.kind === 'FOOTBALL') {
        return (0, validate_football_score_1.validateFootballScoreDetails)({
            ...context,
            normalizedEntries: normalizedEntriesForValidation,
        });
    }
    switch (resolvedConfig.scoringModel) {
        case 'TENNIS_SET':
            return (0, validate_tennis_score_1.validateTennisScoreDetails)(context);
        case 'PICKLEBALL_SIDE_OUT':
            return (0, validate_pickleball_side_out_score_1.validatePickleballSideOutScoreDetails)(context);
        case 'RALLY_POINT_SET':
        default:
            return (0, validate_rally_point_score_1.validateRallyPointScoreDetails)(context);
    }
}
//# sourceMappingURL=validate-score-details.js.map