export interface FootballRosterLockState {
    entryExists: boolean;
    entryStatus?: string | null;
    confirmations: Array<'PENDING' | 'CONFIRMED' | 'DECLINED'>;
    mainRosterCount: number;
    requiredMainRosterCount?: number;
}
export declare function assertFootballRosterLockable(state: FootballRosterLockState): void;
