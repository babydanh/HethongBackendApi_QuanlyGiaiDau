import { BadRequestException } from '@nestjs/common';
import type { ResolvedSportRulesConfig } from '../../../tournaments/utils/sport-rules/sport-rules.types';
import type { ScoreValidationSummary } from './score-validation.types';
import { extractNormalizedScoreEntries } from './score-validation.utils';
import { validatePickleballSideOutScoreDetails } from './validate-pickleball-side-out-score';
import { validateRallyPointScoreDetails } from './validate-rally-point-score';
import { validateTennisScoreDetails } from './validate-tennis-score';

export function validateScoreDetails(
  scoreDetails: Record<string, unknown>,
  resolvedConfig: ResolvedSportRulesConfig,
): ScoreValidationSummary {
  if (!scoreDetails || typeof scoreDetails !== 'object' || Array.isArray(scoreDetails)) {
    throw new BadRequestException('scoreDetails phải là object chứa tỉ số chi tiết của trận.');
  }

  const normalizedEntries = extractNormalizedScoreEntries(scoreDetails);
  if (normalizedEntries.length === 0) {
    throw new BadRequestException('Không tìm thấy set/game hợp lệ trong scoreDetails.');
  }

  if (normalizedEntries.length > resolvedConfig.bestOf) {
    throw new BadRequestException(`Số set/game nhập vào (${normalizedEntries.length}) vượt quá thể thức BO${resolvedConfig.bestOf}.`);
  }

  const context = {
    scoreDetails,
    resolvedConfig,
    normalizedEntries,
  };

  switch (resolvedConfig.scoringModel) {
    case 'TENNIS_SET':
      return validateTennisScoreDetails(context);
    case 'PICKLEBALL_SIDE_OUT':
      return validatePickleballSideOutScoreDetails(context);
    case 'RALLY_POINT_SET':
    default:
      return validateRallyPointScoreDetails(context);
  }
}
