export declare enum PaymentPurpose {
    REGISTRATION_FEE = "REGISTRATION_FEE",
    TOURNAMENT_PUBLISH_FEE = "TOURNAMENT_PUBLISH_FEE",
    PLATFORM_FEE = "PLATFORM_FEE"
}
export declare class CreatePaymentDto {
    purpose: PaymentPurpose;
    tournamentId: string;
    participantId?: string;
    divisionId?: string;
    amount?: number;
}
