"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateFootballTeamElo = calculateFootballTeamElo;
function calculateFootballTeamElo(elo1, elo2, score1, kFactor = 32) {
    if (!Number.isFinite(elo1) || !Number.isFinite(elo2)) {
        throw new Error('Football team ELO must be finite.');
    }
    if (!Number.isFinite(kFactor) || kFactor <= 0) {
        throw new Error('Football team ELO K-factor must be positive.');
    }
    const expected1 = 1 / (1 + 10 ** ((elo2 - elo1) / 400));
    const expected2 = 1 - expected1;
    return {
        expected1,
        expected2,
        delta1: Math.round(kFactor * (score1 - expected1)),
        delta2: Math.round(kFactor * (1 - score1 - expected2)),
    };
}
//# sourceMappingURL=football-team-elo.js.map