import { BadRequestException } from '@nestjs/common';
import type { ScoreValidationContext, ScoreValidationSummary } from './score-validation.types';

function validateRallyPointSetScore(
  key: string,
  maxScore: number,
  pointsPerSet: number,
  minScore: number,
  diff: number,
  deuceEnabled: boolean,
  tiebreakAt: number,
  maxPoints: number,
) {
  if (maxScore < pointsPerSet) {
    throw new BadRequestException(`Hiệp ${key}: Điểm của người thắng set (${maxScore}) phải đạt tối thiểu là ${pointsPerSet}.`);
  }

  if (deuceEnabled) {
    if (minScore >= tiebreakAt) {
      if (maxScore < maxPoints) {
        if (diff !== 2) {
          throw new BadRequestException(`Hiệp ${key}: Trận đấu đang deuce, người thắng phải thắng cách đúng 2 điểm.`);
        }
      } else if (maxScore === maxPoints) {
        if (diff < 1) {
          throw new BadRequestException(`Hiệp ${key}: Khi đạt điểm tối đa ${maxPoints}, phải có người thắng.`);
        }
      } else {
        throw new BadRequestException(`Hiệp ${key}: Điểm số không được vượt quá giới hạn tối đa ${maxPoints}.`);
      }
    } else if (maxScore !== pointsPerSet) {
      throw new BadRequestException(`Hiệp ${key}: Người thắng set phải đạt đúng ${pointsPerSet} điểm.`);
    }
    return;
  }

  if (maxScore !== pointsPerSet) {
    throw new BadRequestException(`Hiệp ${key}: Deuce bị tắt, điểm của người thắng set phải đạt đúng ${pointsPerSet}.`);
  }
}

export function validateRallyPointScoreDetails(context: ScoreValidationContext): ScoreValidationSummary {
  const { resolvedConfig, normalizedEntries } = context;
  const setsToWin = Math.ceil(resolvedConfig.bestOf / 2);
  let p1SetsWon = 0;
  let p2SetsWon = 0;
  let winnerReachedAtSetIndex: number | null = null;
  const lastEntryIndex = normalizedEntries.length - 1;

  for (const [index, entry] of normalizedEntries.entries()) {
    const isLiveFinalSet = index === lastEntryIndex && entry.isFinished === false;
    if (!entry.isFinished && !isLiveFinalSet) {
      throw new BadRequestException(`Hiệp ${entry.key}: Chỉ hiệp cuối cùng mới được để trạng thái đang diễn ra.`);
    }

    if (isLiveFinalSet) {
      continue;
    }

    const maxScore = Math.max(entry.p1, entry.p2);
    const minScore = Math.min(entry.p1, entry.p2);
    const diff = maxScore - minScore;
    const winner = entry.p1 > entry.p2 ? 'P1' : entry.p2 > entry.p1 ? 'P2' : null;

    if (!winner) {
      throw new BadRequestException(`Hiệp ${entry.key}: Không được phép hòa ${entry.scoreStr}.`);
    }

    validateRallyPointSetScore(
      entry.key,
      maxScore,
      resolvedConfig.pointsPerSet,
      minScore,
      diff,
      resolvedConfig.deuceEnabled,
      resolvedConfig.tiebreakAt,
      resolvedConfig.maxPoints,
    );

    if (winner === 'P1') {
      p1SetsWon += 1;
    } else {
      p2SetsWon += 1;
    }

    if (winnerReachedAtSetIndex === null && (p1SetsWon >= setsToWin || p2SetsWon >= setsToWin)) {
      winnerReachedAtSetIndex = index;
    } else if (winnerReachedAtSetIndex !== null) {
      throw new BadRequestException(`Không được nhập thêm ${entry.key} sau khi trận đã chốt người thắng từ trước.`);
    }
  }

  if (p1SetsWon > setsToWin || p2SetsWon > setsToWin) {
    throw new BadRequestException('Số set/game thắng đang vượt quá cấu hình của trận.');
  }

  if (p1SetsWon >= setsToWin && p2SetsWon >= setsToWin) {
    throw new BadRequestException('Hai bên không thể cùng đạt ngưỡng thắng trận.');
  }

  return {
    p1SetsWon,
    p2SetsWon,
    setsToWin,
    totalSets: normalizedEntries.length,
  };
}
