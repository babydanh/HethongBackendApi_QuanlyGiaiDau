"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EloEngineService = void 0;
const common_1 = require("@nestjs/common");
let EloEngineService = class EloEngineService {
    calculateElo(playerElo, opponentElo, isWin, matchesPlayed, winStreak, scoreRatio, inactiveDays, peakElo) {
        const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
        const actual = isWin ? 1.0 : 0.0;
        const K = Math.max(4, Math.round(40 / (1 + matchesPlayed / 10)));
        let streakMultiplier = 1.0;
        if (isWin) {
            if (winStreak >= 7) {
                streakMultiplier = 1.3;
            }
            else if (winStreak >= 5) {
                streakMultiplier = 1.2;
            }
            else if (winStreak >= 3) {
                streakMultiplier = 1.1;
            }
        }
        let scoreFactor = 1.0;
        if (scoreRatio !== undefined && scoreRatio > 0) {
            const clampedRatio = Math.min(0.85, Math.max(0.5, scoreRatio));
            const rawMultiplier = 1.0 + (clampedRatio - 0.5) * 1.2;
            const decayFactor = Math.max(0.2, 1 - matchesPlayed / 25);
            scoreFactor = 1.0 + (rawMultiplier - 1.0) * decayFactor;
        }
        const eloDiff = opponentElo - playerElo;
        let upsetModifier = 0;
        if (isWin) {
            if (eloDiff >= 400) {
                upsetModifier = 10;
            }
            else if (eloDiff >= 200) {
                upsetModifier = 5;
            }
        }
        else {
            if (eloDiff <= -200) {
                upsetModifier = -3;
            }
        }
        const rawChange = K * streakMultiplier * scoreFactor * (actual - expected) + upsetModifier;
        const newElo = Math.max(100, Math.round(playerElo + rawChange));
        const changedPoints = newElo - playerElo;
        const newWinStreak = isWin ? winStreak + 1 : 0;
        const newPeakElo = peakElo ? Math.max(peakElo, newElo) : newElo;
        return {
            newElo,
            changedPoints,
            newWinStreak,
            newPeakElo,
        };
    }
};
exports.EloEngineService = EloEngineService;
exports.EloEngineService = EloEngineService = __decorate([
    (0, common_1.Injectable)()
], EloEngineService);
//# sourceMappingURL=elo-engine.service.js.map