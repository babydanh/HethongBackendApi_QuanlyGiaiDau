import { Injectable } from '@nestjs/common';

@Injectable()
export class EloEngineService {
  /**
   * Tính toán ELO mới cho một người chơi sau trận đấu.
   *
   * @param playerElo ELO hiện tại của người chơi cần tính
   * @param opponentElo ELO hiện tại của đối thủ
   * @param isWin Kết quả trận đấu (true nếu thắng, false nếu thua)
   * @param matchesPlayed Số trận đã đấu của người chơi (trước trận này)
   * @param winStreak Chuỗi thắng của người chơi (trước trận này)
   * @param scoreRatio Tỉ lệ điểm winner/tổng điểm (0.5=sát nút, 0.65=áp đảo, 0.78=hủy diệt).
   *                   undefined/0 = bỏ qua (backward compatible).
   */
  calculateElo(
    playerElo: number,
    opponentElo: number,
    isWin: boolean,
    matchesPlayed: number,
    winStreak: number,
    scoreRatio?: number,
    inactiveDays?: number,
    peakElo?: number,
  ): { newElo: number; changedPoints: number; newWinStreak: number; newPeakElo: number } {
    // 1. Expected Score (Khả năng chiến thắng kỳ vọng)
    const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));

    // 2. Actual Score
    const actual = isWin ? 1.0 : 0.0;

    // 3. K-Factor (continuous formula thay vì step)
    // matchesPlayed = 0 → K=40, 10→20, 30→10, 100→~3.6
    const K = Math.max(4, Math.round(40 / (1 + matchesPlayed / 10)));

    // 4. Win Streak Bonus (chỉ cho bên thắng)
    let streakMultiplier = 1.0;
    if (isWin) {
      if (winStreak >= 7) {
        streakMultiplier = 1.3;
      } else if (winStreak >= 5) {
        streakMultiplier = 1.2;
      } else if (winStreak >= 3) {
        streakMultiplier = 1.1;
      }
    }

    // 5. Score Factor Modifier — hiệu số điểm từng set
    //    Công thức: scoreRatio = winnerPoints / (winnerPoints + loserPoints)
    //    scoreRatio ~0.5 (sát nút) → scoreFactor ~1.0
    //    scoreRatio ~0.65 (áp đảo) → scoreFactor ~1.18
    //    scoreRatio ~0.78 (hủy diệt) → scoreFactor ~1.34
    //    Decay: người mới (<10 trận) chịu ảnh hưởng 100%, người cũ giảm dần
    let scoreFactor = 1.0;
    if (scoreRatio !== undefined && scoreRatio > 0) {
      const clampedRatio = Math.min(0.85, Math.max(0.5, scoreRatio));
      const rawMultiplier = 1.0 + (clampedRatio - 0.5) * 1.2;
      // Decay dần theo số trận: mới đánh → full effect, 25+ trận → chỉ 20%
      const decayFactor = Math.max(0.2, 1 - matchesPlayed / 25);
      scoreFactor = 1.0 + (rawMultiplier - 1.0) * decayFactor;
    }

    // 6. Upset Bonus / Penalty (thắng/thua bất ngờ khi chênh lệch ELO)
    const eloDiff = opponentElo - playerElo;
    let upsetModifier = 0;

    if (isWin) {
      if (eloDiff >= 400) {
        upsetModifier = 10; // Thắng đối thủ vượt trội 400+ ELO
      } else if (eloDiff >= 200) {
        upsetModifier = 5;  // Thắng đối thủ mạnh hơn 200+ ELO
      }
    } else {
      if (eloDiff <= -200) {
        upsetModifier = -3; // Thua đối thủ kém 200+ ELO
      }
    }

    // 7. Tính toán ELO cuối cùng
    const rawChange = K * streakMultiplier * scoreFactor * (actual - expected) + upsetModifier;
    const newElo = Math.max(100, Math.round(playerElo + rawChange));
    const changedPoints = newElo - playerElo;
    const newWinStreak = isWin ? winStreak + 1 : 0;
    const newPeakElo = peakElo ? Math.max(peakElo, newElo) : newElo;

    return {
      newElo,
      changedPoints,
      newWinStreak,
      newPeakElo,
    };
  }
}
