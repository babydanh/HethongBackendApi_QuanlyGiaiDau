import type { SportRuleKind, SportScoringModel } from './sport-rule-kind.type';

export interface SportRuleResolutionInput {
  tournamentSportRules?: Record<string, unknown> | null;
  categoryConfig?: Record<string, unknown> | null;
  categoryName?: string | null;
  categorySlug?: string | null;
  stageRoundConfig?: Record<string, unknown> | null;
  roundNumber?: number | null;
  matchConfig?: Record<string, unknown> | null;
}

export interface ResolvedSportRulesConfig {
  version: number;
  kind: SportRuleKind;
  scoringModel: SportScoringModel;
  format: Record<string, unknown>;
  bestOf: number;
  setsToWin: number;
  pointsPerSet: number;
  deuceEnabled: boolean;
  mustWinByTwo: boolean;
  tiebreakAt: number;
  maxPoints: number;
  tiebreakPoints: number | null;
}
