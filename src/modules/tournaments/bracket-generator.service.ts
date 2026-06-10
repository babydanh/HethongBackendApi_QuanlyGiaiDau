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
            isBye: false,
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
      // Sắp xếp hạt giống
      const sortedParticipants = [...participants].sort(
        (a, b) => (a.seed || 999) - (b.seed || 999),
      );

      // Tạo thứ tự hạt giống theo tiêu chuẩn tournament (Standard Seeding Order)
      const seedingOrder = this.getSeedingOrder(powerOf2);
      const slots = new Array(powerOf2).fill(null);
      for (let i = 0; i < powerOf2; i++) {
        const seedRank = seedingOrder[i];
        if (seedRank <= numParticipants) {
          slots[i] = sortedParticipants[seedRank - 1].id;
        }
      }

      const round1Matches = matchNodesByRound.get(1)!;
      for (let i = 0; i < round1Matches.length; i++) {
        const p1 = slots[2 * i];
        const p2 = slots[2 * i + 1];

        round1Matches[i].participant1Id = p1 || null;
        round1Matches[i].participant2Id = p2 || null;

        // Nếu có 1 bên là BYE (null)
        if (p1 && !p2) {
          round1Matches[i].status = 'COMPLETED';
          round1Matches[i].winnerId = p1;
          round1Matches[i].isBye = true;
          this.advanceWinner(round1Matches[i], matchNodesByRound);
        } else if (!p1 && p2) {
          round1Matches[i].status = 'COMPLETED';
          round1Matches[i].winnerId = p2;
          round1Matches[i].isBye = true;
          this.advanceWinner(round1Matches[i], matchNodesByRound);
        } else if (!p1 && !p2) {
          round1Matches[i].status = 'COMPLETED';
          round1Matches[i].winnerId = null;
          round1Matches[i].isBye = true;
          this.advanceWinner(round1Matches[i], matchNodesByRound);
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

  private getSeedingOrder(size: number): number[] {
    let order = [1];
    while (order.length < size) {
      const nextOrder: number[] = [];
      const currentSize = order.length * 2;
      for (const x of order) {
        nextOrder.push(x);
        nextOrder.push(currentSize + 1 - x);
      }
      order = nextOrder;
    }
    return order;
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

      // Kiểm tra nếu trận đối diện (siblingMatch) là trống hoặc đã hoàn thành với winner = null (tức là double BYE)
      const siblingMatchOrder = completedMatch.matchOrder % 2 !== 0
        ? completedMatch.matchOrder + 1
        : completedMatch.matchOrder - 1;

      const currentRoundMatches = matchNodesByRound.get(completedMatch.roundNumber)!;
      const siblingMatch = currentRoundMatches.find(m => m.matchOrder === siblingMatchOrder);

      if (!siblingMatch || (siblingMatch.status === 'COMPLETED' && !siblingMatch.winnerId)) {
        nextMatch.status = 'COMPLETED';
        nextMatch.winnerId = completedMatch.winnerId;
        nextMatch.isBye = true;
        this.advanceWinner(nextMatch, matchNodesByRound);
      }
    }
  }
}
