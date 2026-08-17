export type BracketParticipantSlot = 'participant1Id' | 'participant2Id';
export declare const MIN_DOUBLE_ELIMINATION_PARTICIPANTS = 4;
export declare const MAX_DOUBLE_ELIMINATION_PARTICIPANTS = 64;
export interface DoubleEliminationShape {
    bracketSize: number;
    winnersRounds: number;
    losersRounds: number;
    winnersMatchCounts: number[];
    losersMatchCounts: number[];
}
interface WinnerTargetSlotInput {
    sourceBranch: string;
    sourceRoundNumber: number;
    sourceMatchOrder: number;
    targetBranch: string;
}
interface LoserTargetSlotInput {
    sourceRoundNumber: number;
    sourceMatchOrder: number;
}
export declare function getDoubleEliminationShape(participantCount: number): DoubleEliminationShape;
export declare function resolveWinnerTargetSlot({ sourceBranch, sourceRoundNumber, sourceMatchOrder, targetBranch, }: WinnerTargetSlotInput): BracketParticipantSlot;
export declare function resolveLoserTargetSlot({ sourceRoundNumber, sourceMatchOrder, }: LoserTargetSlotInput): BracketParticipantSlot;
export declare function resolveWinnersLoserTargetIndex(sourceRoundNumber: number, sourceMatchIndex: number, sourceRoundMatchCount: number): number;
export {};
