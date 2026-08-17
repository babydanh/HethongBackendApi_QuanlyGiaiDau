import type { AppDb } from '../../database/db.types';
export declare class BracketGeneratorService {
    private readonly db;
    constructor(db: AppDb);
    generateSingleElimination(tournamentId: string, userId: string, divisionId?: string, seedingType?: 'SEEDED' | 'RANDOM'): Promise<{
        message: string;
        stageId: string;
        totalMatches: number;
    }>;
    generateDoubleElimination(tournamentId: string, userId: string, divisionId?: string, seedingType?: 'SEEDED' | 'RANDOM'): Promise<{
        message: string;
        stageId: string;
        totalMatches: number;
    }>;
    generateRoundRobin(tournamentId: string, userId: string, divisionId?: string, seedingType?: 'SEEDED' | 'RANDOM'): Promise<{
        message: string;
        stageId: string;
        totalMatches: number;
    }>;
    private getSeedingOrder;
    private advanceWinner;
    private resolveTiebreakers;
    private getMaxRoundAndOrder;
    generateGroupStageKnockout(tournamentId: string, userId: string, divisionId?: string, seedingType?: 'SEEDED' | 'RANDOM'): Promise<{
        message: string;
        stage1Id: string;
        stage2Id: string;
        totalGroups: number;
        totalAdvancing: number;
    }>;
    advanceStandings(tournamentId: string, divisionId: string, stageId: string): Promise<{
        message: string;
        stage2Id: string;
        advancingParticipants: number;
    }>;
}
