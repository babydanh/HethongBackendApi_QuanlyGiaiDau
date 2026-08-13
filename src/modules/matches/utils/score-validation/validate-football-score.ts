import { BadRequestException } from '@nestjs/common';
import type { ScoreValidationContext, ScoreValidationSummary } from './score-validation.types';

/**
 * Validator bóng đá: nhập TỶ SỐ BÀN THẮNG tự do (vd 2-1, 0-0, 3-3).
 * - Khác hẳn tennis/pickleball/cầu lông: không ép "chạm điểm", không "cách 2", không "best-of".
 * - 1 "set" = 1 trận. `setsToWin` luôn = 1.
 * - Cho phép HÒA (p1 === p2) — khi đó không xác định winner (winner null).
 */
export function validateFootballScoreDetails(context: ScoreValidationContext): ScoreValidationSummary {
  const { resolvedConfig, normalizedEntries } = context;
  const setsToWin = Math.max(1, Math.ceil(resolvedConfig.bestOf / 2));
  let p1SetsWon = 0;
  let p2SetsWon = 0;
  let winnerReachedAtSetIndex: number | null = null;
  const lastEntryIndex = normalizedEntries.length - 1;

  for (const [index, entry] of normalizedEntries.entries()) {
    const isLiveFinalSet = index === lastEntryIndex && entry.isFinished === false;
    if (!entry.isFinished && !isLiveFinalSet) {
      throw new BadRequestException(`Trận ${entry.key}: Chỉ trận đang diễn ra cuối cùng mới được để trạng thái chưa kết thúc.`);
    }

    if (isLiveFinalSet) {
      continue;
    }

    const p1 = entry.p1;
    const p2 = entry.p2;

    if (p1 < 0 || p2 < 0) {
      throw new BadRequestException(`Trận ${entry.key}: Tỷ số bàn thắng không được âm.`);
    }

    if (p1 === 0 && p2 === 0) {
      // 0-0 hợp lệ (hòa), nhưng cả hai đều 0 → không có winner.
      p1SetsWon += 0;
      p2SetsWon += 0;
      continue;
    }

    const winner = p1 > p2 ? 'P1' : p2 > p1 ? 'P2' : null;

    if (winner === 'P1') {
      p1SetsWon += 1;
    } else if (winner === 'P2') {
      p2SetsWon += 1;
    }
    // winner === null → hòa (2-2, 3-3...): không ai thắng set này.

    if (winnerReachedAtSetIndex === null && (p1SetsWon >= setsToWin || p2SetsWon >= setsToWin)) {
      winnerReachedAtSetIndex = index;
    } else if (winnerReachedAtSetIndex !== null && resolvedConfig.mode !== 'LITE') {
      throw new BadRequestException(`Không được nhập thêm ${entry.key} sau khi trận đã chốt người thắng từ trước.`);
    }
  }

  return {
    p1SetsWon,
    p2SetsWon,
    setsToWin,
    totalSets: normalizedEntries.length,
  };
}
