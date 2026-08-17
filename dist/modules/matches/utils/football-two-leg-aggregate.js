"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregateFootballTwoLegs = aggregateFootballTwoLegs;
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function footballGoals(leg) {
    const details = asRecord(leg.scoreDetails);
    const football = asRecord(details?.football);
    if (!football)
        return null;
    const team1 = football.team1Goals;
    const team2 = football.team2Goals;
    if (typeof team1 !== 'number' ||
        typeof team2 !== 'number' ||
        !Number.isInteger(team1) ||
        !Number.isInteger(team2) ||
        team1 < 0 ||
        team2 < 0) {
        return null;
    }
    return { team1, team2 };
}
function goalsForParticipant(leg, participantId) {
    const goals = footballGoals(leg);
    if (goals) {
        if (participantId === leg.participant1Id)
            return goals.team1;
        if (participantId === leg.participant2Id)
            return goals.team2;
        return 0;
    }
    if (participantId === leg.participant1Id)
        return Math.max(0, leg.p1SetsWon ?? 0);
    if (participantId === leg.participant2Id)
        return Math.max(0, leg.p2SetsWon ?? 0);
    return 0;
}
function aggregateFootballTwoLegs(leg1, leg2, shootoutWinnerId) {
    const participant1Id = leg1.participant1Id;
    const participant2Id = leg1.participant2Id;
    if (!participant1Id || !participant2Id) {
        return {
            participant1Id,
            participant2Id,
            participant1Goals: 0,
            participant2Goals: 0,
            winnerId: null,
        };
    }
    const participant1Goals = goalsForParticipant(leg1, participant1Id) + goalsForParticipant(leg2, participant1Id);
    const participant2Goals = goalsForParticipant(leg1, participant2Id) + goalsForParticipant(leg2, participant2Id);
    const winnerId = participant1Goals > participant2Goals
        ? participant1Id
        : participant2Goals > participant1Goals
            ? participant2Id
            : shootoutWinnerId === participant1Id || shootoutWinnerId === participant2Id
                ? shootoutWinnerId
                : null;
    return {
        participant1Id,
        participant2Id,
        participant1Goals,
        participant2Goals,
        winnerId,
    };
}
//# sourceMappingURL=football-two-leg-aggregate.js.map