"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFootballTeamEloOutcome = resolveFootballTeamEloOutcome;
const specialActions = new Set([
    'WALKOVER',
    'NO_SHOW',
    'DISQUALIFICATION',
]);
function resolveFootballTeamEloOutcome(input) {
    const { winnerId, participant1Id, participant2Id, specialAction } = input;
    if (winnerId &&
        winnerId !== participant1Id &&
        winnerId !== participant2Id) {
        throw new Error('Football ELO winner must be one of the match participants.');
    }
    const score1 = winnerId
        ? winnerId === participant1Id
            ? 1
            : 0
        : 0.5;
    const score2 = (1 - score1);
    const isSpecial = specialAction ? specialActions.has(specialAction) : false;
    const outcome1 = isSpecial
        ? score1 === 1
            ? 'FORFEIT'
            : 'NO_SHOW'
        : score1 === 1
            ? 'WIN'
            : score1 === 0.5
                ? 'DRAW'
                : 'LOSS';
    const outcome2 = isSpecial
        ? score2 === 1
            ? 'FORFEIT'
            : 'NO_SHOW'
        : score2 === 1
            ? 'WIN'
            : score2 === 0.5
                ? 'DRAW'
                : 'LOSS';
    return { score1, score2, outcome1, outcome2 };
}
//# sourceMappingURL=football-team-elo-outcome.js.map