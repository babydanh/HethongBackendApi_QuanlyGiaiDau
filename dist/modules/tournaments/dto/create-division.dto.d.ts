export declare enum GenderRestriction {
    MALE = "MALE",
    FEMALE = "FEMALE",
    MIXED = "MIXED"
}
export declare enum MatchType {
    SINGLES = "SINGLES",
    DOUBLES = "DOUBLES",
    MIXED_DOUBLES = "MIXED_DOUBLES"
}
export declare enum DivisionBracketType {
    SINGLE_ELIMINATION = "SINGLE_ELIMINATION",
    DOUBLE_ELIMINATION = "DOUBLE_ELIMINATION",
    ROUND_ROBIN = "ROUND_ROBIN",
    GROUP_STAGE_KNOCKOUT = "GROUP_STAGE_KNOCKOUT",
    GROUP_STAGE_THEN_KNOCKOUT = "GROUP_STAGE_THEN_KNOCKOUT"
}
export declare class CreateDivisionDto {
    name: string;
    matchType: MatchType;
    genderRestriction?: GenderRestriction;
    maxParticipants?: number;
    entryFee?: number;
    isConfigOverride?: boolean;
    venueId?: string | null;
    bracketType?: DivisionBracketType | null;
    roundConfig?: Record<string, unknown> | null;
    startDate?: string | null;
    registrationEndDate?: string | null;
    minElo?: number | null;
    maxElo?: number | null;
    prizeDescription?: string | null;
}
