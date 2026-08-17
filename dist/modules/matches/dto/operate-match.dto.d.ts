export declare const MATCH_OPERATION_ACTIONS: readonly ["WALKOVER", "NO_SHOW", "RETIREMENT", "DISQUALIFICATION", "OVERRIDE_RESULT", "POSTPONE", "ABANDON"];
export type MatchOperationAction = (typeof MATCH_OPERATION_ACTIONS)[number];
export declare class OperateMatchDto {
    action: MatchOperationAction;
    reason: string;
    winnerId?: string;
}
