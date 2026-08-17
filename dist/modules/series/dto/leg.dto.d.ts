export declare class CreateLegDto {
    name: string;
    order: number;
    startDate?: string;
    endDate?: string;
    directEntrySlots?: number;
    wildcardSlots?: number;
    rulesOverride?: Record<string, unknown>;
}
export declare class LinkEventDto {
    tournamentId: string;
    region?: string;
    order: number;
    pointMultiplier?: number;
}
