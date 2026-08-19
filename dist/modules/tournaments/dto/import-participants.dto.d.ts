export declare class ParticipantImportItemDto {
    teamName: string;
    player1Name: string;
    player1Email?: string;
    player1Phone?: string;
    player2Name?: string;
    player2Email?: string;
    player2Phone?: string;
    elo?: number;
    isPaid?: boolean;
    autoApprove?: boolean;
    customResponses?: Record<string, any>;
}
export declare class ImportParticipantsDto {
    divisionId?: string;
    participants: ParticipantImportItemDto[];
    sendInvitationEmail?: boolean;
}
