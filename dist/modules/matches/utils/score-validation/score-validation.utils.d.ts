import type { NormalizedScoreEntry } from './score-validation.types';
export declare function extractNormalizedScoreEntries(scoreDetails: Record<string, unknown>): NormalizedScoreEntry[];
export declare function validatePickleballSideOutState(scoreDetails: Record<string, unknown>): void;
