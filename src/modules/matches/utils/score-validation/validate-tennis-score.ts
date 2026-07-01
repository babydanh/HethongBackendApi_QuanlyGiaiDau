import { BadRequestException } from '@nestjs/common';
import type { ScoreValidationContext, ScoreValidationSummary } from './score-validation.types';

function validateTennisSetScore(
  key: string,
  scoreStr: string,
  p1: number,
  p2: number,
  pointsPerSet: number,
  maxPoints: number,
) {
  const maxScore = Math.max(p1, p2);
  const minScore = Math.min(p1, p2);
  const diff = maxScore - minScore;

  if (p1 === p2) {
    throw new BadRequestException(`Set ${key}: Tennis không cho phép set hòa.`);
  }
  if (maxScore < pointsPerSet) {
    throw new BadRequestException(`Set ${key}: Người thắng phải đạt ít nhất ${pointsPerSet} game.`);
  }
  if (maxScore > maxPoints) {
    throw new BadRequestException(`Set ${key}: Số game không được vượt quá ${maxPoints}.`);
  }
  if (maxScore === pointsPerSet) {
    if (diff < 2 || minScore > pointsPerSet - 2) {
      throw new BadRequestException(`Set ${key}: Kết quả ${scoreStr} không hợp lệ cho tennis.`);
    }
    return;
  }
  if (maxScore === maxPoints) {
    if (minScore !== maxPoints - 2 && minScore !== maxPoints - 1) {
      throw new BadRequestException(`Set ${key}: Kết quả ${scoreStr} không hợp lệ cho tennis.`);
    }
    return;
  }

  throw new BadRequestException(`Set ${key}: Kết quả ${scoreStr} không hợp lệ cho tennis.`);
}

export function validateTennisScoreDetails(context: ScoreValidationContext): ScoreValidationSummary {
  const { resolvedConfig, normalizedEntries } = context;
  const setsToWin = Math.ceil(resolvedConfig.bestOf / 2);
  let p1SetsWon = 0;
  let p2SetsWon = 0;
  let winnerReachedAtSetIndex: number | null = null;
  const lastEntryIndex = normalizedEntries.length - 1;

  for (const [index, entry] of normalizedEntries.entries()) {
    const isLiveFinalSet = index === lastEntryIndex && entry.isFinished === false;

    if (!entry.isFinished && !isLiveFinalSet) {
      throw new BadRequestException(`Set ${entry.key}: Chỉ set cuối cùng mới được để trạng thái đang diễn ra.`);
    }

    if (isLiveFinalSet) {
      continue;
    }

    const winner = entry.p1 > entry.p2 ? 'P1' : entry.p2 > entry.p1 ? 'P2' : null;
    if (!winner) {
      throw new BadRequestException(`Set ${entry.key}: Không được phép hòa ${entry.scoreStr}.`);
    }

    validateTennisSetScore(
      entry.key,
      entry.scoreStr,
      entry.p1,
      entry.p2,
      resolvedConfig.pointsPerSet,
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
    throw new BadRequestException('Số set thắng đang vượt quá cấu hình tennis hiện tại.');
  }

  if (p1SetsWon >= setsToWin && p2SetsWon >= setsToWin) {
    throw new BadRequestException('Hai bên không thể cùng đạt ngưỡng thắng trận tennis.');
  }

  return {
    p1SetsWon,
    p2SetsWon,
    setsToWin,
    totalSets: normalizedEntries.length,
  };
}
