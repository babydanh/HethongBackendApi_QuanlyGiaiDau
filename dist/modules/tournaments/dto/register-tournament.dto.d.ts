export declare class RegisterTournamentDto {
    teamName: string;
    memberIds?: string[];
    reserveMemberIds?: string[];
    footballTeamId?: string;
    partnerEmailOrPhone?: string;
    divisionId?: string;
    tournamentDivisionId?: string;
    matchType?: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
    rankingConsent?: boolean;
    customResponses?: Record<string, unknown>;
}
