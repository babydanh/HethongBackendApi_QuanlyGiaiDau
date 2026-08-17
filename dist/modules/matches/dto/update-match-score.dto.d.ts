import type { FootballScoreDetailsDto } from './football-score-details.dto';
export declare class UpdateMatchScoreDto {
    p1SetsWon: number;
    p2SetsWon: number;
    scoreDetails?: Record<string, unknown> & {
        football?: FootballScoreDetailsDto;
    };
    winnerId?: string;
    overrideReason?: string;
    expectedRevision?: number;
}
