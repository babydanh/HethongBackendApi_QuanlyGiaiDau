import { BadRequestException } from '@nestjs/common';
import type { ScoreValidationContext, ScoreValidationSummary } from './score-validation.types';
import { validatePickleballSideOutState } from './score-validation.utils';

function validatePickleballSideOutGameScore(
  key: string,
  scoreStr: string,
  maxScore: number,
  minScore: number,
  diff: number,
  pointsPerSet: number,
  deuceEnabled: boolean,
  tiebreakAt: number,
  maxPoints: number,
) {
  if (maxScore < pointsPerSet) {
    throw new BadRequestException(`Game ${key}: Đội thắng phải đạt tối thiểu ${pointsPerSet} điểm trong mode side-out.`);
  }

  if (deuceEnabled) {
    if (minScore >= tiebreakAt) {
      if (diff !== 2) {
        throw new BadRequestException(`Game ${key}: Pickleball side-out yêu cầu thắng cách 2 điểm ở giai đoạn cuối.`);
      }
    } else if (maxScore !== pointsPerSet) {
      throw new BadRequestException(`Game ${key}: Điểm đích chuẩn của side-out là ${pointsPerSet}.`);
    }
  } else if (maxScore !== pointsPerSet) {
    throw new BadRequestException(`Game ${key}: Khi tắt win-by-two, đội thắng phải chạm đúng ${pointsPerSet}.`);
  }

  if (maxScore > maxPoints && maxPoints > 0) {
    throw new BadRequestException(`Game ${key}: Điểm số ${scoreStr} vượt quá ngưỡng cấu hình hiện tại (${maxPoints}).`);
  }
}

export function validatePickleballSideOutScoreDetails(
  context: ScoreValidationContext,
): ScoreValidationSummary {
  const { scoreDetails, resolvedConfig, normalizedEntries } = context;
  validatePickleballSideOutState(scoreDetails);

  const setsToWin = Math.ceil(resolvedConfig.bestOf / 2);
  let p1SetsWon = 0;
  let p2SetsWon = 0;
  let winnerReachedAtSetIndex: number | null = null;
  const lastEntryIndex = normalizedEntries.length - 1;

  for (const [index, entry] of normalizedEntries.entries()) {
    const isLiveFinalSet = index === lastEntryIndex && entry.isFinished === false;
    if (!entry.isFinished && !isLiveFinalSet) {
      throw new BadRequestException(`Game ${entry.key}: Chỉ game cuối cùng mới được để trạng thái đang diễn ra.`);
    }

    if (isLiveFinalSet) {
      continue;
    }

    const maxScore = Math.max(entry.p1, entry.p2);
    const minScore = Math.min(entry.p1, entry.p2);
    const diff = maxScore - minScore;
    const winner = entry.p1 > entry.p2 ? 'P1' : entry.p2 > entry.p1 ? 'P2' : null;

    if (!winner) {
      throw new BadRequestException(`Game ${entry.key}: Không được phép hòa ${entry.scoreStr}.`);
    }

    validatePickleballSideOutGameScore(
      entry.key,
      entry.scoreStr,
      maxScore,
      minScore,
      diff,
      resolvedConfig.pointsPerSet,
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
    } else if (winnerReachedAtSetIndex !== null && resolvedConfig.mode !== 'LITE') {
      throw new BadRequestException(`Không được nhập thêm ${entry.key} sau khi trận đã chốt người thắng từ trước.`);
    }
  }

  if (resolvedConfig.mode !== 'LITE') {
    if (p1SetsWon > setsToWin || p2SetsWon > setsToWin) {
      throw new BadRequestException('Số game thắng đang vượt quá cấu hình pickleball side-out.');
    }

    if (p1SetsWon >= setsToWin && p2SetsWon >= setsToWin) {
      throw new BadRequestException('Hai bên không thể cùng đạt ngưỡng thắng trận pickleball side-out.');
    }
  }

  return {
    p1SetsWon,
    p2SetsWon,
    setsToWin,
    totalSets: normalizedEntries.length,
  };
}
