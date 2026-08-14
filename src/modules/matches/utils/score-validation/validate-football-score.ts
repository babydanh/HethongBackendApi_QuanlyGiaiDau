import { BadRequestException } from '@nestjs/common';
import type { ScoreValidationContext, ScoreValidationSummary } from './score-validation.types';

/**
 * Validator bóng đá: nhập TỶ SỐ BÀN THẮNG tự do (vd 2-1, 0-0, 3-3).
 * - Khác hẳn tennis/pickleball/cầu lông: không ép "chạm điểm", không "cách 2", không "best-of".
 * - 1 "set" = 1 trận. `setsToWin` luôn = 1.
 * - Cho phép HÒA (p1 === p2) — khi đó không xác định winner (winner null).
 */
export function validateFootballScoreDetails(context: ScoreValidationContext): ScoreValidationSummary {
  const { resolvedConfig } = context;
  const football = context.scoreDetails.football;
  const normalizedEntries = football && typeof football === 'object' && !Array.isArray(football)
    ? (() => {
        const value = football as Record<string, unknown>;
        const team1Goals = value.team1Goals;
        const team2Goals = value.team2Goals;
        if (typeof team1Goals !== 'number' || typeof team2Goals !== 'number'
          || !Number.isInteger(team1Goals) || !Number.isInteger(team2Goals)
          || team1Goals < 0 || team2Goals < 0) {
          throw new BadRequestException('football.team1Goals và football.team2Goals phải là số nguyên không âm.');
        }
        const phase = typeof value.phase === 'string' ? value.phase : 'FIRST_HALF';
        const phases = new Set([
          'FIRST_HALF', 'HALFTIME', 'SECOND_HALF', 'STOPPAGE_TIME',
          'FULL_TIME', 'EXTRA_TIME_FIRST_HALF', 'EXTRA_TIME_BREAK',
          'EXTRA_TIME_SECOND_HALF', 'PENALTY_SHOOTOUT', 'COMPLETED',
        ]);
        if (!phases.has(phase)) {
          throw new BadRequestException('football.phase không hợp lệ.');
        }
        if (value.events !== undefined) {
          if (!Array.isArray(value.events) || value.events.length > 500) {
            throw new BadRequestException('football.events phải là danh sách tối đa 500 sự kiện.');
          }
          for (const event of value.events) {
            if (!event || typeof event !== 'object' || Array.isArray(event)) {
              throw new BadRequestException('football.events chứa phần tử không hợp lệ.');
            }
            const item = event as Record<string, unknown>;
            if (!['GOAL', 'OWN_GOAL', 'PENALTY_GOAL', 'YELLOW_CARD', 'RED_CARD', 'FOUL', 'SUBSTITUTION', 'VAR', 'NOTE'].includes(String(item.type))) {
              throw new BadRequestException('football.events.type không hợp lệ.');
            }
            if (item.team !== 1 && item.team !== 2) {
              throw new BadRequestException('football.events.team phải là 1 hoặc 2.');
            }
            if (item.minute !== undefined && (!Number.isInteger(item.minute) || Number(item.minute) < 0 || Number(item.minute) > 150)) {
              throw new BadRequestException('football.events.minute không hợp lệ.');
            }
          }
        }
        const isFinished = phase === 'FULL_TIME' || phase === 'COMPLETED' || phase === 'PENALTY_SHOOTOUT';
        return [{
          key: 'football',
          p1: team1Goals,
          p2: team2Goals,
          scoreStr: `${team1Goals}-${team2Goals}`,
          isFinished,
          isOverridden: false,
        }];
      })()
    : context.normalizedEntries;
  const setsToWin = 1;
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
