export declare const TOURNAMENT_CLEANUP_GRACE_DAYS = 7;
export type TournamentCleanupReason = 'NO_ACTIVE_REGISTRATION_AFTER_GRACE_PERIOD' | 'STATUS_NOT_ELIGIBLE' | 'REGISTRATION_END_DATE_MISSING' | 'REGISTRATION_END_DATE_INVALID' | 'REGISTRATION_START_DATE_INVALID' | 'REGISTRATION_WINDOW_INVALID' | 'REGISTRATION_NOT_EXPIRED' | 'REGISTRATION_NOT_STARTED' | 'TOURNAMENT_NOT_STARTED' | 'START_DATE_INVALID' | 'GRACE_PERIOD_NOT_ELAPSED' | 'ACTIVE_REGISTRATION' | 'PROTECTED_PAYMENT' | 'PROTECTED_MATCH' | 'PROTECTED_BRACKET' | 'DEPENDENCY_DATA_INVALID';
export type TournamentCleanupDecision = {
    eligible: boolean;
    reason: TournamentCleanupReason;
};
export type TournamentCleanupSnapshot = {
    status: string | null | undefined;
    registrationStartDate: Date | string | null | undefined;
    registrationEndDate: Date | string | null | undefined;
    startDate: Date | string | null | undefined;
    activeRegistrationCount: number | null | undefined;
    protectedPaymentCount: number | null | undefined;
    protectedMatchCount: number | null | undefined;
    hasBracketData: boolean | null | undefined;
};
export declare function evaluateTournamentCleanup(snapshot: TournamentCleanupSnapshot, now: Date): TournamentCleanupDecision;
export declare function isProtectedRegistrationStatus(status: string | null | undefined): boolean;
