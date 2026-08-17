export interface ConfiguredRoundRobinGroup {
    name?: string;
    participantIds: string[];
    roundConfig: Record<string, unknown>;
}
export interface RoundRobinScheduledMatch {
    participant1Id: string;
    participant2Id: string;
    roundNumber: number;
    leg: number;
}
export declare function asConfigRecord(value: unknown): Record<string, unknown> | null;
export declare function extractSportRuleOverrides(value: unknown): Record<string, unknown>;
export declare function resolveConfiguredGroups(...sources: Array<Record<string, unknown> | null | undefined>): ConfiguredRoundRobinGroup[];
export declare function resolveRoundsToPlay(...sources: Array<Record<string, unknown> | null | undefined>): number;
export declare function resolveRoundRobinGroupCount(groupsConfig: Record<string, unknown>, configuredGroups: ConfiguredRoundRobinGroup[], participantCount: number, maxPerGroup: number): number;
export declare function buildRoundRobinSchedule(participantIds: string[], legs: number): RoundRobinScheduledMatch[];
export declare function allocateRoundRobinGroups<T extends {
    id: string;
}>(participants: T[], groupCount: number, configuredGroups: ConfiguredRoundRobinGroup[], maxPerGroup: number): T[][];
