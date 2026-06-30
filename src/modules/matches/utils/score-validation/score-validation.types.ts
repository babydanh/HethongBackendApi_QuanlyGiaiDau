import type { ResolvedSportRulesConfig } from '../../../tournaments/utils/sport-rules/sport-rules.types';

export interface NormalizedScoreEntry {
  key: string;
  p1: number;
  p2: number;
  scoreStr: string;
}

export interface ScoreValidationSummary {
  p1SetsWon: number;
  p2SetsWon: number;
  setsToWin: number;
  totalSets: number;
}

export interface ScoreValidationContext {
  scoreDetails: Record<string, unknown>;
  resolvedConfig: ResolvedSportRulesConfig;
  normalizedEntries: NormalizedScoreEntry[];
}
