import type { ResolvedSportRulesConfig } from '../../../tournaments/utils/sport-rules/sport-rules.types';
import type { ScoreValidationSummary } from './score-validation.types';
export declare function validateScoreDetails(scoreDetails: Record<string, unknown>, resolvedConfig: ResolvedSportRulesConfig): ScoreValidationSummary;
