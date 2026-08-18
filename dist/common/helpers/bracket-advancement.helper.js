"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_DOUBLE_ELIMINATION_PARTICIPANTS = exports.MIN_DOUBLE_ELIMINATION_PARTICIPANTS = void 0;
exports.getDoubleEliminationShape = getDoubleEliminationShape;
exports.resolveWinnerTargetSlot = resolveWinnerTargetSlot;
exports.resolveLoserTargetSlot = resolveLoserTargetSlot;
exports.resolveWinnersLoserTargetIndex = resolveWinnersLoserTargetIndex;
exports.MIN_DOUBLE_ELIMINATION_PARTICIPANTS = 4;
exports.MAX_DOUBLE_ELIMINATION_PARTICIPANTS = 128;
function getDoubleEliminationShape(participantCount) {
    if (!Number.isInteger(participantCount) ||
        participantCount < exports.MIN_DOUBLE_ELIMINATION_PARTICIPANTS ||
        participantCount > exports.MAX_DOUBLE_ELIMINATION_PARTICIPANTS) {
        throw new RangeError(`Double elimination requires ${exports.MIN_DOUBLE_ELIMINATION_PARTICIPANTS}-${exports.MAX_DOUBLE_ELIMINATION_PARTICIPANTS} participants`);
    }
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(participantCount)));
    const winnersRounds = Math.log2(bracketSize);
    const losersRounds = 2 * winnersRounds - 2;
    const winnersMatchCounts = Array.from({ length: winnersRounds }, (_, index) => bracketSize / Math.pow(2, index + 1));
    const losersMatchCounts = Array.from({ length: losersRounds }, (_, index) => bracketSize / Math.pow(2, Math.floor(index / 2) + 2));
    return {
        bracketSize,
        winnersRounds,
        losersRounds,
        winnersMatchCounts,
        losersMatchCounts,
    };
}
function resolveWinnerTargetSlot({ sourceBranch, sourceRoundNumber, sourceMatchOrder, targetBranch, }) {
    if (targetBranch === 'GRAND_FINALS') {
        return sourceBranch === 'MAIN' ? 'participant1Id' : 'participant2Id';
    }
    if (sourceBranch === 'LOSERS' && sourceRoundNumber % 2 !== 0) {
        return 'participant1Id';
    }
    return sourceMatchOrder % 2 !== 0
        ? 'participant1Id'
        : 'participant2Id';
}
function resolveLoserTargetSlot({ sourceRoundNumber, sourceMatchOrder, }) {
    if (sourceRoundNumber === 1) {
        return sourceMatchOrder % 2 !== 0
            ? 'participant1Id'
            : 'participant2Id';
    }
    return 'participant2Id';
}
function resolveWinnersLoserTargetIndex(sourceRoundNumber, sourceMatchIndex, sourceRoundMatchCount) {
    if (sourceRoundNumber === 1) {
        return Math.floor(sourceMatchIndex / 2);
    }
    return sourceRoundMatchCount > 1 ? sourceMatchIndex ^ 1 : 0;
}
//# sourceMappingURL=bracket-advancement.helper.js.map