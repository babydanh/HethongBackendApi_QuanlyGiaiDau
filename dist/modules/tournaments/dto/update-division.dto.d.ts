import { DivisionBracketType, GenderRestriction, MatchType } from './create-division.dto';
export declare class UpdateDivisionDto {
    name?: string;
    matchType?: MatchType;
    genderRestriction?: GenderRestriction | null;
    maxParticipants?: number | null;
    entryFee?: number;
    status?: string;
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
