import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, and, ne } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { MatchNode } from './interfaces/match-node.interface';

@Injectable()
export class BracketGeneratorService {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  async generateSingleElimination(
    tournamentId: string,
    userId: string,
    divisionId?: string,
    seedingType?: 'SEEDED' | 'RANDOM',
  ) {
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
        .where(
          divisionId
            ? and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                eq(schema.tournamentParticipants.tournamentDivisionId, divisionId),
                ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
                ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
              )
            : and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
                ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
              ),
        );

      const numParticipants = participants.length;
      if (numParticipants < 2) {
        throw new BadRequestException(
          'At least 2 participants required to generate bracket',
        );
      }

      // 3. Xóa các Stage/Group/Matches cũ (nếu có) để tạo lại
      await tx
        .delete(schema.tournamentStages)
        .where(
          divisionId
            ? and(
                eq(schema.tournamentStages.tournamentId, tournamentId),
                eq(schema.tournamentStages.tournamentDivisionId, divisionId),
              )
            : eq(schema.tournamentStages.tournamentId, tournamentId),
        );

      // 4. Tạo Stage & Group mới
      const [stage] = await tx
        .insert(schema.tournamentStages)
        .values({
          tournamentId,
          name: 'Elimination Stage',
          type: 'SINGLE_ELIMINATION',
          order: 1,
          tournamentDivisionId: divisionId ?? null,
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
            loserNextMatchId: null,
            participant1Id: null,
            participant2Id: null,
            winnerId: null,
            p1SetsWon: 0,
            p2SetsWon: 0,
            totalSetsPlayed: 0,
            tournamentId,
            stageId: stage.id,
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
      const sortedParticipants = [...participants];
      if (seedingType === 'RANDOM') {
        for (let i = sortedParticipants.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = sortedParticipants[i];
          sortedParticipants[i] = sortedParticipants[j];
          sortedParticipants[j] = temp;
        }
      } else {
        sortedParticipants.sort(
          (a, b) => (a.seed || 999) - (b.seed || 999),
        );
      }

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

      // 7. Insert vào Database theo thứ tự ngược từ chung kết về vòng 1
      for (let r = totalRounds; r >= 1; r--) {
        const roundMatches = matchNodesByRound.get(r)!;
        if (roundMatches.length > 0) {
          await tx.insert(schema.matches).values(roundMatches);
        }
      }

      return {
        message: 'Bracket generated successfully',
        stageId: stage.id,
        totalMatches: totalRounds > 0 ? Array.from(matchNodesByRound.values()).reduce((acc, val) => acc + val.length, 0) : 0,
      };
    });
  }

  async generateDoubleElimination(
    tournamentId: string,
    userId: string,
    divisionId?: string,
    seedingType?: 'SEEDED' | 'RANDOM',
  ) {
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
        .where(
          divisionId
            ? and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                eq(schema.tournamentParticipants.tournamentDivisionId, divisionId),
                ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
                ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
              )
            : and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
                ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
              ),
        );

      const numParticipants = participants.length;
      if (numParticipants < 2) {
        throw new BadRequestException(
          'At least 2 participants required to generate bracket',
        );
      }

      // 3. Xóa các Stage/Group/Matches cũ (nếu có) để tạo lại
      await tx
        .delete(schema.tournamentStages)
        .where(
          divisionId
            ? and(
                eq(schema.tournamentStages.tournamentId, tournamentId),
                eq(schema.tournamentStages.tournamentDivisionId, divisionId),
              )
            : eq(schema.tournamentStages.tournamentId, tournamentId),
        );

      // 4. Tạo Stage & Groups
      const [stage] = await tx
        .insert(schema.tournamentStages)
        .values({
          tournamentId,
          name: 'Elimination Stage',
          type: 'DOUBLE_ELIMINATION',
          order: 1,
          tournamentDivisionId: divisionId ?? null,
        })
        .returning();

      const [groupWinners] = await tx
        .insert(schema.tournamentGroups)
        .values({
          stageId: stage.id,
          name: 'Winners Bracket',
        })
        .returning();

      const [groupLosers] = await tx
        .insert(schema.tournamentGroups)
        .values({
          stageId: stage.id,
          name: 'Losers Bracket',
        })
        .returning();

      const [groupGF] = await tx
        .insert(schema.tournamentGroups)
        .values({
          stageId: stage.id,
          name: 'Grand Finals',
        })
        .returning();

      // 5. Tính toán cấu trúc nhánh
      const powerOf2 = Math.pow(2, Math.ceil(Math.log2(numParticipants)));
      const winnersRounds = Math.log2(powerOf2);
      const losersRounds = 2 * winnersRounds - 2;

      const winnersMatchesByRound = new Map<number, MatchNode[]>();
      const losersMatchesByRound = new Map<number, MatchNode[]>();

      // A. Tạo Winners Bracket matches
      for (let r = 1; r <= winnersRounds; r++) {
        const matchesInRound = powerOf2 / Math.pow(2, r);
        const roundMatches: MatchNode[] = [];
        for (let i = 0; i < matchesInRound; i++) {
          roundMatches.push({
            id: randomUUID(),
            groupId: groupWinners.id,
            roundNumber: r,
            matchOrder: i + 1,
            bracketBranch: 'MAIN',
            status: 'SCHEDULED',
            isBye: false,
            nextMatchId: null,
            loserNextMatchId: null,
            participant1Id: null,
            participant2Id: null,
            winnerId: null,
            p1SetsWon: 0,
            p2SetsWon: 0,
            totalSetsPlayed: 0,
            tournamentId,
            stageId: stage.id,
          });
        }
        winnersMatchesByRound.set(r, roundMatches);
      }

      // B. Tạo Losers Bracket matches
      if (winnersRounds >= 2) {
        const r1MatchesCount = powerOf2 / 4;
        const r1Matches: MatchNode[] = [];
        for (let i = 0; i < r1MatchesCount; i++) {
          r1Matches.push({
            id: randomUUID(),
            groupId: groupLosers.id,
            roundNumber: 1,
            matchOrder: i + 1,
            bracketBranch: 'LOSERS',
            status: 'SCHEDULED',
            isBye: false,
            nextMatchId: null,
            loserNextMatchId: null,
            participant1Id: null,
            participant2Id: null,
            winnerId: null,
            p1SetsWon: 0,
            p2SetsWon: 0,
            totalSetsPlayed: 0,
            tournamentId,
            stageId: stage.id,
          });
        }
        losersMatchesByRound.set(1, r1Matches);

        for (let r = 2; r <= winnersRounds; r++) {
          const matchesCount2r2 = powerOf2 / Math.pow(2, r);
          const round2r2Matches: MatchNode[] = [];
          for (let i = 0; i < matchesCount2r2; i++) {
            round2r2Matches.push({
              id: randomUUID(),
              groupId: groupLosers.id,
              roundNumber: 2 * r - 2,
              matchOrder: i + 1,
              bracketBranch: 'LOSERS',
              status: 'SCHEDULED',
              isBye: false,
              nextMatchId: null,
              loserNextMatchId: null,
              participant1Id: null,
              participant2Id: null,
              winnerId: null,
              p1SetsWon: 0,
              p2SetsWon: 0,
              totalSetsPlayed: 0,
              tournamentId,
              stageId: stage.id,
            });
          }
          losersMatchesByRound.set(2 * r - 2, round2r2Matches);

          if (r < winnersRounds) {
            const matchesCount2r1 = powerOf2 / Math.pow(2, r + 1);
            const round2r1Matches: MatchNode[] = [];
            for (let i = 0; i < matchesCount2r1; i++) {
              round2r1Matches.push({
                id: randomUUID(),
                groupId: groupLosers.id,
                roundNumber: 2 * r - 1,
                matchOrder: i + 1,
                bracketBranch: 'LOSERS',
                status: 'SCHEDULED',
                isBye: false,
                nextMatchId: null,
                loserNextMatchId: null,
                participant1Id: null,
                participant2Id: null,
                winnerId: null,
                p1SetsWon: 0,
                p2SetsWon: 0,
                totalSetsPlayed: 0,
                tournamentId,
                stageId: stage.id,
              });
            }
            losersMatchesByRound.set(2 * r - 1, round2r1Matches);
          }
        }
      }

      // C. Tạo Grand Finals match (GF1)
      const gf1: MatchNode = {
        id: randomUUID(),
        groupId: groupGF.id,
        roundNumber: 1,
        matchOrder: 1,
        bracketBranch: 'GRAND_FINALS',
        status: 'SCHEDULED',
        isBye: false,
        nextMatchId: null,
        loserNextMatchId: null,
        participant1Id: null,
        participant2Id: null,
        winnerId: null,
        p1SetsWon: 0,
        p2SetsWon: 0,
        totalSetsPlayed: 0,
        tournamentId,
        stageId: stage.id,
      };

      // 6. Thiết lập liên kết nextMatchId và loserNextMatchId
      for (let r = 1; r <= winnersRounds; r++) {
        const currentRound = winnersMatchesByRound.get(r)!;
        const nextRound = winnersMatchesByRound.get(r + 1);

        for (let i = 0; i < currentRound.length; i++) {
          if (r < winnersRounds && nextRound) {
            currentRound[i].nextMatchId = nextRound[Math.floor(i / 2)].id;
          } else if (r === winnersRounds) {
            currentRound[i].nextMatchId = gf1.id;
          }

          if (r === 1) {
            const losersR1 = losersMatchesByRound.get(1)!;
            currentRound[i].loserNextMatchId = losersR1[Math.floor(i / 2)].id;
          } else {
            const losersTargetRound = losersMatchesByRound.get(2 * r - 2)!;
            currentRound[i].loserNextMatchId = losersTargetRound[i].id;
          }
        }
      }

      if (winnersRounds >= 2) {
        for (let lr = 1; lr <= losersRounds; lr++) {
          const currentRound = losersMatchesByRound.get(lr)!;
          const nextRound = (lr === losersRounds) ? null : losersMatchesByRound.get(lr + 1)!;

          for (let i = 0; i < currentRound.length; i++) {
            if (lr === losersRounds) {
              currentRound[i].nextMatchId = gf1.id;
            } else if (nextRound) {
              if (lr % 2 !== 0) {
                currentRound[i].nextMatchId = nextRound[i].id;
              } else {
                currentRound[i].nextMatchId = nextRound[Math.floor(i / 2)].id;
              }
            }
          }
        }
      }

      // 7. Xếp đội hạt giống vào Winners Round 1
      const sortedParticipants = [...participants];
      if (seedingType === 'RANDOM') {
        for (let i = sortedParticipants.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = sortedParticipants[i];
          sortedParticipants[i] = sortedParticipants[j];
          sortedParticipants[j] = temp;
        }
      } else {
        sortedParticipants.sort(
          (a, b) => (a.seed || 999) - (b.seed || 999),
        );
      }
      const seedingOrder = this.getSeedingOrder(powerOf2);
      const slots = new Array(powerOf2).fill(null);
      for (let i = 0; i < powerOf2; i++) {
        const seedRank = seedingOrder[i];
        if (seedRank <= numParticipants) {
          slots[i] = sortedParticipants[seedRank - 1].id;
        }
      }

      const w1Matches = winnersMatchesByRound.get(1)!;
      for (let i = 0; i < w1Matches.length; i++) {
        w1Matches[i].participant1Id = slots[2 * i];
        w1Matches[i].participant2Id = slots[2 * i + 1];
      }

      // 8. Xử lý BYEs ban đầu bằng cách mô phỏng in-memory
      const allMatchesList: MatchNode[] = [];
      for (let r = 1; r <= winnersRounds; r++) {
        allMatchesList.push(...winnersMatchesByRound.get(r)!);
      }
      if (winnersRounds >= 2) {
        for (let lr = 1; lr <= losersRounds; lr++) {
          allMatchesList.push(...losersMatchesByRound.get(lr)!);
        }
      }
      allMatchesList.push(gf1);

      const matchMap = new Map<string, MatchNode>(allMatchesList.map(m => [m.id, m]));

      const propagateInMemoryByes = (mId: string) => {
        const m = matchMap.get(mId);
        if (!m || m.status === 'COMPLETED') return;

        // A match is only ready for BYE propagation if it is in Round 1 (Winners),
        // or if all incoming matches that feed into it have completed.
        const incomingMatches = allMatchesList.filter(
          (src) => src.nextMatchId === m.id || src.loserNextMatchId === m.id
        );
        const allIncomingCompleted = incomingMatches.every(
          (src) => src.status === 'COMPLETED'
        );

        if (!allIncomingCompleted) return;

        const p1 = m.participant1Id;
        const p2 = m.participant2Id;

        if (!p1 && !p2) {
          m.status = 'COMPLETED';
          m.winnerId = null;
          m.isBye = true;
          advanceWinnerInMemory(m);
          advanceLoserInMemory(m);
        } else if (p1 && !p2) {
          m.status = 'COMPLETED';
          m.winnerId = p1;
          m.isBye = true;
          advanceWinnerInMemory(m);
          advanceLoserInMemory(m);
        } else if (!p1 && p2) {
          m.status = 'COMPLETED';
          m.winnerId = p2;
          m.isBye = true;
          advanceWinnerInMemory(m);
          advanceLoserInMemory(m);
        }
      };

      const advanceWinnerInMemory = (completed: MatchNode) => {
        if (!completed.nextMatchId || !completed.winnerId) return;
        const next = matchMap.get(completed.nextMatchId);
        if (!next) return;

        if (next.bracketBranch === 'GRAND_FINALS') {
          if (completed.bracketBranch === 'MAIN') {
            next.participant1Id = completed.winnerId;
          } else {
            next.participant2Id = completed.winnerId;
          }
        } else {
          if (completed.bracketBranch === 'LOSERS') {
            if (completed.roundNumber % 2 !== 0) {
              next.participant1Id = completed.winnerId;
            } else {
              const isOdd = (completed.matchOrder % 2 !== 0);
              if (isOdd) {
                next.participant1Id = completed.winnerId;
              } else {
                next.participant2Id = completed.winnerId;
              }
            }
          } else {
            const isOdd = (completed.matchOrder % 2 !== 0);
            if (isOdd) {
              next.participant1Id = completed.winnerId;
            } else {
              next.participant2Id = completed.winnerId;
            }
          }
        }

        propagateInMemoryByes(next.id);
      };

      const advanceLoserInMemory = (completed: MatchNode) => {
        if (!completed.loserNextMatchId) return;
        const next = matchMap.get(completed.loserNextMatchId);
        if (!next) return;

        const loserId = (completed.winnerId === completed.participant1Id)
          ? completed.participant2Id
          : completed.participant1Id;

        if (completed.roundNumber === 1) {
          const isOdd = (completed.matchOrder % 2 !== 0);
          if (isOdd) {
            next.participant1Id = loserId;
          } else {
            next.participant2Id = loserId;
          }
        } else {
          next.participant2Id = loserId;
        }

        propagateInMemoryByes(next.id);
      };

      for (const m of winnersMatchesByRound.get(1)!) {
        propagateInMemoryByes(m.id);
      }
      
      if (winnersRounds >= 2) {
        for (const m of losersMatchesByRound.get(1)!) {
          propagateInMemoryByes(m.id);
        }
      }

      // 9. Insert vào Database theo thứ tự ngược
      await tx.insert(schema.matches).values(gf1);

      if (winnersRounds >= 2) {
        for (let lr = losersRounds; lr >= 1; lr--) {
          await tx.insert(schema.matches).values(losersMatchesByRound.get(lr)!);
        }
      }

      for (let r = winnersRounds; r >= 1; r--) {
        await tx.insert(schema.matches).values(winnersMatchesByRound.get(r)!);
      }

      return {
        message: 'Double Elimination bracket generated successfully',
        stageId: stage.id,
        totalMatches: allMatchesList.length,
      };
    });
  }

  async generateRoundRobin(
    tournamentId: string,
    userId: string,
    divisionId?: string,
    seedingType?: 'SEEDED' | 'RANDOM',
  ) {
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
        .where(
          divisionId
            ? and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                eq(schema.tournamentParticipants.tournamentDivisionId, divisionId),
                ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
                ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
              )
            : and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
                ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
              ),
        );

      const numParticipants = participants.length;
      if (numParticipants < 2) {
        throw new BadRequestException(
          'At least 2 participants required to generate round robin group',
        );
      }

      // 3. Xóa các Stage/Group/Matches cũ (nếu có) để tạo lại
      await tx
        .delete(schema.tournamentStages)
        .where(
          divisionId
            ? and(
                eq(schema.tournamentStages.tournamentId, tournamentId),
                eq(schema.tournamentStages.tournamentDivisionId, divisionId),
              )
            : eq(schema.tournamentStages.tournamentId, tournamentId),
        );

      // 4. Tạo Stage & Group mới
      const [stage] = await tx
        .insert(schema.tournamentStages)
        .values({
          tournamentId,
          name: 'Group Stage',
          type: 'ROUND_ROBIN',
          order: 1,
          tournamentDivisionId: divisionId ?? null,
        })
        .returning();

      const [group] = await tx
        .insert(schema.tournamentGroups)
        .values({
          stageId: stage.id,
          name: 'Round Robin Group',
        })
        .returning();

      // 5. Khởi tạo standings cho tất cả participant
      for (const p of participants) {
        await tx.insert(schema.groupStandings).values({
          groupId: group.id,
          participantId: p.id,
          played: 0,
          won: 0,
          lost: 0,
          draws: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          totalPoints: 0,
          updatedAt: new Date(),
        });
      }

      // 6. Xếp lịch thi đấu vòng tròn (Circle Method)
      const config = (tournament.tournamentConfig || {}) as Record<string, unknown>;
      const legs = (config.roundRobinLegs as number) || 1;

      const list = participants.map(p => p.id);
      if (seedingType === 'RANDOM') {
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = list[i];
          list[i] = list[j];
          list[j] = temp;
        }
      }
      if (list.length % 2 !== 0) {
        list.push(null as unknown as string);
      }

      const N = list.length;
      const roundsCount = N - 1;
      const matchesPerRound = N / 2;
      const matchesToInsert: (typeof schema.matches.$inferInsert)[] = [];
      let matchCounter = 1;

      for (let leg = 0; leg < legs; leg++) {
        const teams = [...list];

        for (let round = 1; round <= roundsCount; round++) {
          const currentRoundNumber = leg * roundsCount + round;

          for (let i = 0; i < matchesPerRound; i++) {
            const home = teams[i];
            const away = teams[N - 1 - i];

            if (home && away) {
              const p1 = (leg % 2 === 0) ? home : away;
              const p2 = (leg % 2 === 0) ? away : home;

              matchesToInsert.push({
                id: randomUUID(),
                groupId: group.id,
                roundNumber: currentRoundNumber,
                matchOrder: matchCounter++,
                bracketBranch: 'MAIN',
                status: 'SCHEDULED',
                isBye: false,
                participant1Id: p1,
                participant2Id: p2,
                winnerId: null,
                p1SetsWon: 0,
                p2SetsWon: 0,
                totalSetsPlayed: 0,
                nextMatchId: null,
                loserNextMatchId: null,
                tournamentId,
                stageId: stage.id,
                updatedAt: new Date(),
              });
            }
          }

          const last = teams.pop()!;
          teams.splice(1, 0, last);
        }
      }

      if (matchesToInsert.length > 0) {
        await tx.insert(schema.matches).values(matchesToInsert);
      }

      return {
        message: 'Round Robin group stage generated successfully',
        stageId: stage.id,
        totalMatches: matchesToInsert.length,
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
      if (completedMatch.matchOrder % 2 !== 0) {
        nextMatch.participant1Id = completedMatch.winnerId;
      } else {
        nextMatch.participant2Id = completedMatch.winnerId;
      }

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


