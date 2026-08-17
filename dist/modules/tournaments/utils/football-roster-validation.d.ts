export type FootballRosterSelection = {
    leaderId: string;
    memberIds: readonly string[];
    reserveMemberIds: readonly string[];
    activeMemberIds: ReadonlySet<string>;
    minMainSize: number;
    maxMainSize: number;
    maxReserve: number;
    maxTotalSize: number;
};
export type ValidatedFootballRoster = {
    mainMemberIds: string[];
    reserveMemberIds: string[];
    allMemberIds: string[];
};
export declare function validateFootballRosterSelection(input: FootballRosterSelection): ValidatedFootballRoster;
