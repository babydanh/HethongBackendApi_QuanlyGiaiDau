export declare class EloEngineService {
    calculateElo(playerElo: number, opponentElo: number, isWin: boolean, matchesPlayed: number, winStreak: number, scoreRatio?: number, inactiveDays?: number, peakElo?: number): {
        newElo: number;
        changedPoints: number;
        newWinStreak: number;
        newPeakElo: number;
    };
}
