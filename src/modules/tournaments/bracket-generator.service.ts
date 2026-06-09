import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { MatchNode } from './interfaces/match-node.interface';

@Injectable()
export class BracketGeneratorService {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async generateSingleElimination(tournamentId: string, userId: string) {
    return await this.db.transaction(async (tx) => {
      // 1. Kiểm tra giải đấu
      const [tournament] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);

      if (!tournament) throw new BadRequestException('Tournament not found');
      if (tournament.createdBy !== userId) {
        throw new BadRequestException('Only the creator can generate brackets');
      }

      // 2. Lấy danh sách đội tham gia
      const participants = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.tournamentId, tournamentId));

      const numParticipants = participants.length;
      if (numParticipants < 2) {
        throw new BadRequestException(
          'At least 2 participants required to generate bracket',
        );
      }

      // 3. Xóa các Stage/Group/Matches cũ (nếu có) để tạo lại
      // Do ON DELETE CASCADE, xóa stages sẽ xóa groups và matches
      await tx
        .delete(schema.tournamentStages)
        .where(eq(schema.tournamentStages.tournamentId, tournamentId));

      // 4. Tạo Stage & Group mới
      const [stage] = await tx
        .insert(schema.tournamentStages)
        .values({
          tournamentId,
          name: 'Elimination Stage',
          type: 'SINGLE_ELIMINATION',
          order: 1,
        })
        .returning();

      const [group] = await tx
        .insert(schema.tournamentGroups)
        .values({
          stageId: stage.id,
          name: 'Main Bracket',
        })
        .returning();

      // 5. Tính toán Bracket (Toán học Power of 2)
      const powerOf2 = Math.pow(2, Math.ceil(Math.log2(numParticipants)));
      const totalRounds = Math.log2(powerOf2);

      // Sinh danh sách ID cho tất cả các trận
      const matchNodesByRound = new Map<number, MatchNode[]>();

      // Chạy ngược từ Chung kết (Round = totalRounds) về Round 1
      for (let r = totalRounds; r >= 1; r--) {
        const matchesInRound = Math.pow(2, totalRounds - r);
        const roundMatches: MatchNode[] = [];

        for (let i = 0; i < matchesInRound; i++) {
          roundMatches.push({
            id: randomUUID(),
            groupId: group.id,
            roundNumber: r,
            matchOrder: i + 1,
            bracketBranch: 'MAIN',
            status: 'SCHEDULED',
            nextMatchId: null,
            participant1Id: null,
            participant2Id: null,
            winnerId: null,
            p1SetsWon: 0,
            p2SetsWon: 0,
            totalSetsPlayed: 0,
          });
        }
        matchNodesByRound.set(r, roundMatches);
      }

      // Gắn next_match_id
      for (let r = 1; r < totalRounds; r++) {
        const currentRoundMatches = matchNodesByRound.get(r)!;
        const nextRoundMatches = matchNodesByRound.get(r + 1)!;

        for (let i = 0; i < currentRoundMatches.length; i++) {
          const nextMatchIndex = Math.floor(i / 2);
          currentRoundMatches[i].nextMatchId =
            nextRoundMatches[nextMatchIndex].id;
        }
      }

      // 6. Xếp đội vào Round 1
      // Sắp xếp hạt giống (tạm thời random/hoặc giữ nguyên thứ tự đăng ký)
      const sortedParticipants = [...participants].sort(
        (a, b) => (a.seed || 999) - (b.seed || 999),
      );

      // Tạo mảng P slots
      const slots = new Array(powerOf2).fill(null);
      // Chia đều đội để những BYE nằm xen kẽ.
      // Cách chia đơn giản: nhét lần lượt vào mảng slots.
      // Một thuật toán chia chuẩn (ví dụ P=8): 1-8, 4-5, 2-7, 3-6.
      // Nhưng để đơn giản, ta cứ nhét tuần tự.
      for (let i = 0; i < numParticipants; i++) {
        slots[i] = sortedParticipants[i].id;
      }

      // Trộn slots để người chơi không bị dồn 1 cục nếu có BYE
      // Với MVP, để dễ kiểm tra, ta cứ lấy tuần tự.
      const round1Matches = matchNodesByRound.get(1)!;
      for (let i = 0; i < round1Matches.length; i++) {
        const p1 = slots[i];
        const p2 = slots[powerOf2 - 1 - i]; // Pair top with bottom

        round1Matches[i].participant1Id = p1 || null;
        round1Matches[i].participant2Id = p2 || null;

        // Nếu có 1 bên là BYE (null)
        if (p1 && !p2) {
          round1Matches[i].status = 'COMPLETED';
          round1Matches[i].winnerId = p1;
          // Ta cần đẩy p1 lên trận tiếp theo (Round 2)
          this.advanceWinner(round1Matches[i], matchNodesByRound);
        } else if (!p1 && p2) {
          round1Matches[i].status = 'COMPLETED';
          round1Matches[i].winnerId = p2;
          this.advanceWinner(round1Matches[i], matchNodesByRound);
        } else if (!p1 && !p2) {
          // Trận đấu ma (cả 2 đều BYE) - sẽ đẩy null lên
          round1Matches[i].status = 'COMPLETED';
          round1Matches[i].winnerId = null;
        }
      }

      // Lấy tất cả matches để insert
      const allMatchesToInsert: MatchNode[] = [];
      for (let r = 1; r <= totalRounds; r++) {
        allMatchesToInsert.push(...matchNodesByRound.get(r)!);
      }

      // 7. Insert vào Database
      await tx.insert(schema.matches).values(allMatchesToInsert);

      return {
        message: 'Bracket generated successfully',
        stageId: stage.id,
        totalMatches: allMatchesToInsert.length,
      };
    });
  }

  private advanceWinner(
    completedMatch: MatchNode,
    matchNodesByRound: Map<number, MatchNode[]>,
  ) {
    if (!completedMatch.nextMatchId || !completedMatch.winnerId) return;

    const nextRound = completedMatch.roundNumber + 1;
    const nextRoundMatches = matchNodesByRound.get(nextRound);
    if (!nextRoundMatches) return;

    const nextMatch = nextRoundMatches.find(
      (m) => m.id === completedMatch.nextMatchId,
    );
    if (nextMatch) {
      // Xác định vị trí (trái hay phải)
      if (completedMatch.matchOrder % 2 !== 0) {
        nextMatch.participant1Id = completedMatch.winnerId;
      } else {
        nextMatch.participant2Id = completedMatch.winnerId;
      }

      // Nếu nextMatch đã có đủ 2 người, nó vẫn là SCHEDULED.
      // Nhưng nếu nextMatch cũng vô tình lọt vào trường hợp đấu với BYE (rất hiếm khi xảy ra nếu chia hạt giống chuẩn),
      // thì phải xử lý đệ quy. Để đơn giản MVP, bỏ qua đệ quy.
    }
  }
}
