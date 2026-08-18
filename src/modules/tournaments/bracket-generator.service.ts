import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, and, ne, or, inArray, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { MatchNode } from './interfaces/match-node.interface';
import {
  getDoubleEliminationShape,
  MAX_DOUBLE_ELIMINATION_PARTICIPANTS,
  MIN_DOUBLE_ELIMINATION_PARTICIPANTS,
  resolveLoserTargetSlot,
  resolveWinnersLoserTargetIndex,
  resolveWinnerTargetSlot,
} from '../../common/helpers/bracket-advancement.helper';
import {
  allocateRoundRobinGroups,
  asConfigRecord,
  buildRoundRobinSchedule,
  extractSportRuleOverrides,
  resolveConfiguredGroups,
  resolveRoundRobinGroupCount,
  resolveRoundsToPlay,
} from './utils/round-robin-config';
import { sortFootballStandings } from './utils/football-standings';

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

      if (!tournament) throw new BadRequestException('Giải đấu không tồn tại');

      // 2. Lấy danh sách đội tham gia
      const participants = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(
          divisionId
            ? and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                eq(schema.tournamentParticipants.tournamentDivisionId, divisionId),
                or(
                  eq(schema.tournamentParticipants.isMock, true),
                  eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                ),
              )
            : and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                or(
                  eq(schema.tournamentParticipants.isMock, true),
                  eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                ),
              ),
        );

      const numParticipants = participants.length;
      if (numParticipants < 2) {
        throw new BadRequestException(
          'Cần ít nhất 2 đội để tạo sơ đồ loại trực tiếp',
        );
      }

      // 3. Soft-delete các Stage/Group/Matches cũ (nếu có) để tạo lại
      await tx
        .update(schema.tournamentStages)
        .set({ deletedAt: new Date() })
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

      // Two-legged knockout (bóng đá Champion League): mỗi cặp = 2 trận (leg1 + leg2)
      const tConfig = (tournament.tournamentConfig || {}) as Record<string, unknown>;
      const twoLegged = tConfig.twoLegged === true;

      // Sinh danh sách ID cho tất cả các trận
      const matchNodesByRound = new Map<number, MatchNode[]>();

      // Chạy ngược từ Chung kết (Round = totalRounds) về Round 1
      for (let r = totalRounds; r >= 1; r--) {
        const matchesInRound = Math.pow(2, totalRounds - r);
        const roundMatches: MatchNode[] = [];

        for (let i = 0; i < matchesInRound; i++) {
          // Two-legged: sinh 2 trận (leg1 home, leg2 away) cùng tieId
          const legs = twoLegged ? [1, 2] : [1];
          const tieId = twoLegged ? randomUUID() : null;

          for (const leg of legs) {
            roundMatches.push({
              id: randomUUID(),
              groupId: group.id,
              roundNumber: r,
              matchOrder: roundMatches.length + 1,
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
              leg,
              tieId,
            });
          }
        }
        matchNodesByRound.set(r, roundMatches);
      }

      // Gắn next_match_id — 2 trận ở vòng hiện tại dẫn vào 1 trận ở vòng kế tiếp
      for (let r = 1; r < totalRounds; r++) {
        const currentRoundMatches = matchNodesByRound.get(r)!;
        const nextRoundMatches = matchNodesByRound.get(r + 1)!;

        for (let i = 0; i < currentRoundMatches.length; i++) {
          const nextMatchIndex = twoLegged
            ? Math.floor(i / 4) * 2 + (i % 2)
            : Math.floor(i / 2);
          if (nextRoundMatches && nextRoundMatches[nextMatchIndex]) {
            currentRoundMatches[i].nextMatchId =
              nextRoundMatches[nextMatchIndex].id;
          }
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
          // Both slots empty (BYE) — skip, don't propagate null winner
          round1Matches[i].status = 'COMPLETED';
          round1Matches[i].winnerId = null;
          round1Matches[i].isBye = true;
          // No advanceWinner call — null winner would propagate incorrectly
        }
      }

      // Two-legged: leg2 phải có cùng cặp đối thủ với leg1 (đổi vai home/away).
      // Round1 mỗi cặp = 2 trận liên tiếp (i, i+1). Gán lại p1/p2 cho leg2 ngược vai.
      if (twoLegged) {
        for (let i = 0; i < round1Matches.length; i += 2) {
          const leg1 = round1Matches[i];
          const leg2 = round1Matches[i + 1];
          if (!leg1 || !leg2) continue;
          leg2.participant1Id = leg1.participant2Id;
          leg2.participant2Id = leg1.participant1Id;
          // BYE: nếu leg1 là bye, leg2 cũng bye → không advance lần 2
          if (leg1.isBye) {
            leg2.status = 'COMPLETED';
            leg2.winnerId = leg1.winnerId;
            leg2.isBye = true;
          }
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
        message: 'Sơ đồ loại trực tiếp đã được tạo thành công',
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

      if (!tournament) throw new BadRequestException('Giải đấu không tồn tại');

      // 2. Lấy danh sách đội tham gia
      const participants = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(
          divisionId
            ? and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                eq(schema.tournamentParticipants.tournamentDivisionId, divisionId),
                or(
                  eq(schema.tournamentParticipants.isMock, true),
                  eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                ),
              )
            : and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                or(
                  eq(schema.tournamentParticipants.isMock, true),
                  eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                ),
              ),
        );

      const numParticipants = participants.length;
      if (
        numParticipants < MIN_DOUBLE_ELIMINATION_PARTICIPANTS ||
        numParticipants > MAX_DOUBLE_ELIMINATION_PARTICIPANTS
      ) {
        throw new BadRequestException(
          `Double Elimination yêu cầu từ ${MIN_DOUBLE_ELIMINATION_PARTICIPANTS} đến ${MAX_DOUBLE_ELIMINATION_PARTICIPANTS} đội`,
        );
      }

      // 3. Soft-delete các Stage/Group/Matches cũ (nếu có) để tạo lại
      await tx
        .update(schema.tournamentStages)
        .set({ deletedAt: new Date() })
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
      const shape = getDoubleEliminationShape(numParticipants);
      const powerOf2 = shape.bracketSize;
      const winnersRounds = shape.winnersRounds;
      const losersRounds = shape.losersRounds;

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
            const targetIndex = resolveWinnersLoserTargetIndex(r, i, currentRound.length);
            currentRound[i].loserNextMatchId = losersR1[targetIndex].id;
          } else {
            const losersTargetRound = losersMatchesByRound.get(2 * r - 2)!;
            const targetIndex = resolveWinnersLoserTargetIndex(r, i, currentRound.length);
            currentRound[i].loserNextMatchId = losersTargetRound[targetIndex].id;
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
              // Losers bracket alternates between same-size rounds and half-size rounds.
              // Odd rounds feed the next round by the same match index.
              // Even rounds collapse two matches into one next match.
              const nextIndex = lr % 2 !== 0 ? i : Math.floor(i / 2);
              currentRound[i].nextMatchId = nextRound[nextIndex]?.id || null;
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
          // Both slots empty — skip propagation, null winner/loser would corrupt bracket
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

        const targetSlot = resolveWinnerTargetSlot({
          sourceBranch: completed.bracketBranch,
          sourceRoundNumber: completed.roundNumber,
          sourceMatchOrder: completed.matchOrder,
          targetBranch: next.bracketBranch,
        });
        next[targetSlot] = completed.winnerId;

        propagateInMemoryByes(next.id);
      };

      const advanceLoserInMemory = (completed: MatchNode) => {
        if (!completed.loserNextMatchId) return;
        const next = matchMap.get(completed.loserNextMatchId);
        if (!next) return;

        const loserId = (completed.winnerId === completed.participant1Id)
          ? completed.participant2Id
          : completed.participant1Id;

        const targetSlot = resolveLoserTargetSlot({
          sourceRoundNumber: completed.roundNumber,
          sourceMatchOrder: completed.matchOrder,
        });
        next[targetSlot] = loserId;

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
        message: 'Sơ đồ nhánh thắng/thua đã được tạo thành công',
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

      if (!tournament) throw new BadRequestException('Giải đấu không tồn tại');

      // 2. Lấy danh sách đội tham gia
      const participants = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(
          divisionId
            ? and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                eq(schema.tournamentParticipants.tournamentDivisionId, divisionId),
                or(
                  eq(schema.tournamentParticipants.isMock, true),
                  eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                ),
              )
            : and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                or(
                  eq(schema.tournamentParticipants.isMock, true),
                  eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                ),
              ),
        );

      const numParticipants = participants.length;
      if (numParticipants < 2) {
        throw new BadRequestException(
          'Cần ít nhất 2 đội để tạo bảng đấu vòng tròn',
        );
      }

      // 3. Soft-delete các Stage/Group/Matches cũ (nếu có) để tạo lại
      await tx
        .update(schema.tournamentStages)
        .set({ deletedAt: new Date() })
        .where(
          divisionId
            ? and(
                eq(schema.tournamentStages.tournamentId, tournamentId),
                eq(schema.tournamentStages.tournamentDivisionId, divisionId),
              )
            : eq(schema.tournamentStages.tournamentId, tournamentId),
        );

      // 4. Tạo Stage & Groups (hỗ trợ multi-group)
      // Chia participants thành nhiều bảng nhỏ (max ~8 đội/bảng)
      const config = (tournament.tournamentConfig || {}) as Record<string, unknown>;

      // Đọc config từ division.roundConfig (ưu tiên) hoặc tournament config
      let divisionConfig: Record<string, unknown> = {};
      if (divisionId) {
        const divisions = await tx
          .select()
          .from(schema.tournamentDivisions)
          .where(eq(schema.tournamentDivisions.id, divisionId))
          .limit(1);
        divisionConfig = asConfigRecord(divisions[0]?.roundConfig) || {};
      }

      const tournamentGroupsConfig = asConfigRecord(config.groupsConfig) || {};
      const divisionGroupsConfig = asConfigRecord(divisionConfig.groupsConfig) || {};
      const groupsConfig = { ...tournamentGroupsConfig, ...divisionGroupsConfig };
      const scoring = {
        ...(asConfigRecord(config.scoring) || {}),
        ...(asConfigRecord(divisionConfig.scoring) || {}),
        ...(asConfigRecord(groupsConfig.scoring) || {}),
      };
      const maxGroupSize = Number(
        groupsConfig.teamsPerGroup ??
        groupsConfig.teams_per_group ??
        groupsConfig.maxGroupSize ??
        config.roundRobinGroupSize ??
        8,
      );
      const winPoints = typeof scoring.winPoints === 'number' ? scoring.winPoints : 3;
      const drawPoints = typeof scoring.drawPoints === 'number' ? scoring.drawPoints : 1;
      const lossPoints = typeof scoring.lossPoints === 'number' ? scoring.lossPoints : 0;
      const tiebreakerRules = {
        primary: 'H2H_POINTS',
        secondary: ['SET_DIFF', 'POINT_DIFF'],
        ...(asConfigRecord(config.tiebreakerRules) || {}),
        ...(asConfigRecord(divisionConfig.tiebreakerRules) || {}),
      };
      const roundRobinLegs = resolveRoundsToPlay(divisionConfig, { groupsConfig }, config);
      const configuredGroups = resolveConfiguredGroups(divisionConfig, config);
      const stageSportRuleOverrides = {
        ...extractSportRuleOverrides(config),
        ...extractSportRuleOverrides(tournamentGroupsConfig),
        ...extractSportRuleOverrides(divisionConfig),
        ...extractSportRuleOverrides(divisionGroupsConfig),
      };

      if (!Number.isInteger(maxGroupSize) || maxGroupSize < 2 || maxGroupSize > 8) {
        throw new BadRequestException('Tối đa 8 đội/bảng');
      }
      if (!Number.isInteger(roundRobinLegs) || roundRobinLegs < 1 || roundRobinLegs > 5) {
        throw new BadRequestException('Số lượt vòng tròn phải nằm trong khoảng 1-5');
      }

      const [stage] = await tx
        .insert(schema.tournamentStages)
        .values({
          tournamentId,
          name: 'Group Stage',
          type: 'ROUND_ROBIN',
          order: 1,
          tournamentDivisionId: divisionId ?? null,
          roundConfig: {
            ...stageSportRuleOverrides,
            scoring: {
              ...(asConfigRecord(stageSportRuleOverrides.scoring) || {}),
              winPoints,
              drawPoints,
              lossPoints,
            },
            tiebreakerRules,
            maxGroupSize,
            roundsToPlay: roundRobinLegs,
          },
        })
        .returning();

      // Phân bố participants vào các bảng (snake draft nếu seeded, random nếu không)
      const sortedParticipants = [...participants];
      if (seedingType === 'SEEDED') {
        sortedParticipants.sort((a, b) => (a.seed || 999) - (b.seed || 999));
      } else {
        for (let i = sortedParticipants.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = sortedParticipants[i];
          sortedParticipants[i] = sortedParticipants[j];
          sortedParticipants[j] = temp;
        }
      }

      const requestedCount = groupsConfig.numGroups ?? groupsConfig.num_groups ?? config.numberOfGroups;
      const numGroups = resolveRoundRobinGroupCount(
        { ...groupsConfig, ...(requestedCount !== undefined ? { numGroups: requestedCount } : {}) },
        configuredGroups,
        numParticipants,
        maxGroupSize,
      );
      let groupParticipants: Array<Array<typeof participants[0]>>;
      try {
        groupParticipants = allocateRoundRobinGroups(
          sortedParticipants,
          numGroups,
          configuredGroups,
          maxGroupSize,
        );
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Cấu hình bảng không hợp lệ');
      }

      // Tạo groups + standings
      const groups: Array<{ id: string; name: string }> = [];
      for (let g = 0; g < numGroups; g++) {
        const [newGroup] = await tx
          .insert(schema.tournamentGroups)
          .values({
            stageId: stage.id,
            name: configuredGroups[g]?.name || (numGroups > 1 ? `Bảng ${String.fromCharCode(65 + g)}` : 'Vòng bảng'),
            roundConfig: configuredGroups[g]?.roundConfig || null,
          })
          .returning();
        groups.push(newGroup);

        for (const p of groupParticipants[g]) {
          await tx.insert(schema.groupStandings).values({
            groupId: newGroup.id,
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
      }

      // 5. Xếp lịch vòng tròn (Circle Method) cho từng bảng
      const allMatchesToInsert: (typeof schema.matches.$inferInsert)[] = [];
      let globalMatchCounter = 1;

      for (let g = 0; g < groups.length; g++) {
        const group = groups[g];
        const participantIds = groupParticipants[g].map(p => p.id);
        for (const scheduled of buildRoundRobinSchedule(participantIds, roundRobinLegs)) {
          allMatchesToInsert.push({
            id: randomUUID(),
            groupId: group.id,
            roundNumber: scheduled.roundNumber,
            matchOrder: globalMatchCounter++,
            bracketBranch: 'MAIN',
            status: 'SCHEDULED',
            isBye: false,
            participant1Id: scheduled.participant1Id,
            participant2Id: scheduled.participant2Id,
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

      if (allMatchesToInsert.length > 0) {
        await tx.insert(schema.matches).values(allMatchesToInsert);
      }

      return {
        message: 'Đã tạo bảng đấu vòng tròn thành công',
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

  // ─── Tiebreaker: Tạo playoff matches cho các đội bằng điểm ───
  private async resolveTiebreakers(
    tx: any,
    tournamentId: string,
    stageId: string,
    configuredGroupId: string,
    standings: Array<{ participantId: string; totalPoints: number; pointsFor: number; pointsAgainst: number }>,
    _tiebreakerRules: { primary: string; secondary: string[] },
  ): Promise<string[]> {
    void _tiebreakerRules;
    // Nhóm các đội có cùng totalPoints
    const pointGroups = new Map<number, Array<{ participantId: string; pointsFor: number; pointsAgainst: number }>>();
    for (const s of standings) {
      const list = pointGroups.get(s.totalPoints) || [];
      list.push({ participantId: s.participantId, pointsFor: s.pointsFor, pointsAgainst: s.pointsAgainst });
      pointGroups.set(s.totalPoints, list);
    }

    const rankedOrder: string[] = [];

    for (const [, group] of pointGroups) {
      if (group.length === 1) {
        rankedOrder.push(group[0].participantId);
      } else if (group.length === 2) {
        // 2 đội bằng điểm → tạo 1 playoff match
        const { maxRound, maxOrder } = await this.getMaxRoundAndOrder(tx, stageId);
        const groups = await tx
          .select()
          .from(schema.tournamentGroups)
          .where(eq(schema.tournamentGroups.id, configuredGroupId))
          .limit(1);
        const groupId = groups[0]?.id;
        if (groupId) {
          await tx.insert(schema.matches).values({
            id: randomUUID(),
            tournamentId,
            stageId,
            groupId,
            participant1Id: group[0].participantId,
            participant2Id: group[1].participantId,
            roundNumber: maxRound + 1,
            matchOrder: maxOrder + 1,
            bracketBranch: 'PLAYOFF',
            status: 'SCHEDULED',
            isBye: false,
            p1SetsWon: 0,
            p2SetsWon: 0,
            totalSetsPlayed: 0,
            nextMatchId: null,
            loserNextMatchId: null,
            winnerId: null,
            updatedAt: new Date(),
          });
          // Winner gets higher rank (placeholder - will be resolved when match completes)
          rankedOrder.push(group[0].participantId, group[1].participantId);
        }
      } else if (group.length === 3) {
        // 3 đội bằng điểm → round-robin mini-playoff
        const { maxRound, maxOrder } = await this.getMaxRoundAndOrder(tx, stageId);
        const groups = await tx
          .select()
          .from(schema.tournamentGroups)
          .where(eq(schema.tournamentGroups.id, configuredGroupId))
          .limit(1);
        const groupId = groups[0]?.id;
        if (groupId) {
          // Tạo 3 trận vòng tròn nhỏ
          const pairs = [[group[0].participantId, group[1].participantId], [group[1].participantId, group[2].participantId], [group[0].participantId, group[2].participantId]];
          for (let i = 0; i < pairs.length; i++) {
            await tx.insert(schema.matches).values({
              id: randomUUID(),
              tournamentId,
              stageId,
              groupId,
              participant1Id: pairs[i][0],
              participant2Id: pairs[i][1],
              roundNumber: maxRound + 1,
              matchOrder: maxOrder + 1 + i,
              bracketBranch: 'PLAYOFF',
              status: 'SCHEDULED',
              isBye: false,
              p1SetsWon: 0,
              p2SetsWon: 0,
              totalSetsPlayed: 0,
              nextMatchId: null,
              loserNextMatchId: null,
              winnerId: null,
              updatedAt: new Date(),
            });
          }
          // Placeholder ranking (will be resolved when matches complete)
          rankedOrder.push(...group.map(g => g.participantId));
        }
      } else {
        // > 3 đội: sort by set diff then point diff
        group.sort((a, b) => {
          const diffA = a.pointsFor - a.pointsAgainst;
          const diffB = b.pointsFor - b.pointsAgainst;
          return diffB - diffA;
        });
        rankedOrder.push(...group.map(g => g.participantId));
      }
    }

    return rankedOrder;
  }

  private async getMaxRoundAndOrder(tx: any, stageId: string) {
    const result = await tx
      .select({
        maxRound: sql<number>`COALESCE(MAX(${schema.matches.roundNumber}), 0)`,
        maxOrder: sql<number>`COALESCE(MAX(${schema.matches.matchOrder}), 0)`,
      })
      .from(schema.matches)
      .where(eq(schema.matches.stageId, stageId));
    return result[0] || { maxRound: 0, maxOrder: 0 };
  }

  // ─── Group Stage → Knockout ───
  async generateGroupStageKnockout(
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

      if (!tournament) throw new BadRequestException('Giải đấu không tồn tại');

      // 2. Lấy danh sách đội tham gia
      const participants = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(
          divisionId
            ? and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                eq(schema.tournamentParticipants.tournamentDivisionId, divisionId),
                or(
                  eq(schema.tournamentParticipants.isMock, true),
                  and(
                    eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                    eq(schema.tournamentParticipants.isPaid, true),
                  ),
                ),
              )
            : and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                or(
                  eq(schema.tournamentParticipants.isMock, true),
                  and(
                    eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                    eq(schema.tournamentParticipants.isPaid, true),
                  ),
                ),
              ),
        );

      const numParticipants = participants.length;
      if (numParticipants < 2) {
        throw new BadRequestException('Cần ít nhất 2 đội tham gia');
      }

      // 3. Đọc division + roundConfig
      let division: typeof schema.tournamentDivisions.$inferSelect | undefined;
      if (divisionId) {
        const divs = await tx
          .select()
          .from(schema.tournamentDivisions)
          .where(eq(schema.tournamentDivisions.id, divisionId))
          .limit(1);
        division = divs[0];
      }

      const config = (tournament.tournamentConfig || {}) as Record<string, unknown>;
      const divConfig = division?.roundConfig as Record<string, unknown> | null || {};
      const tournamentGroupsConfig = asConfigRecord(config.groupsConfig) || {};
      const divisionGroupsConfig = asConfigRecord(divConfig.groupsConfig) || {};
      const groupsConfig = { ...tournamentGroupsConfig, ...divisionGroupsConfig };
      const advancementConfig = {
        ...(asConfigRecord(config.advancementConfig) || {}),
        ...(asConfigRecord(divConfig.advancementConfig) || {}),
      };
      const playoffConfig = {
        ...(asConfigRecord(config.playoffConfig) || {}),
        ...(asConfigRecord(divConfig.playoffConfig) || {}),
      };
      const scoring = {
        winPoints: 3,
        drawPoints: 1,
        lossPoints: 0,
        ...(asConfigRecord(config.scoring) || {}),
        ...(asConfigRecord(divConfig.scoring) || {}),
        ...(asConfigRecord(groupsConfig.scoring) || {}),
      };
      const tiebreakerRules = {
        primary: 'H2H_POINTS',
        secondary: ['SET_DIFF', 'POINT_DIFF'],
        ...(asConfigRecord(config.tiebreakerRules) || {}),
        ...(asConfigRecord(divConfig.tiebreakerRules) || {}),
      };
      const stageSportRuleOverrides = {
        ...extractSportRuleOverrides(config),
        ...extractSportRuleOverrides(tournamentGroupsConfig),
        ...extractSportRuleOverrides(divConfig),
        ...extractSportRuleOverrides(divisionGroupsConfig),
      };
      const configuredGroups = resolveConfiguredGroups(divConfig, config);
      const playoffSportRuleOverrides = extractSportRuleOverrides(playoffConfig);

      const requestedNumGroups = resolveRoundRobinGroupCount(
        { ...groupsConfig, ...(config.numberOfGroups !== undefined && groupsConfig.numGroups === undefined && groupsConfig.num_groups === undefined
          ? { numGroups: config.numberOfGroups }
          : {}) },
        configuredGroups,
        numParticipants,
        Number(groupsConfig.teamsPerGroup ?? groupsConfig.teams_per_group) || 8,
      );
      const configuredGroupCapacity = configuredGroups.reduce(
        (maximum, group) => Math.max(maximum, group.participantIds.length),
        0,
      );
      const teamsPerGroup = Number(groupsConfig.teamsPerGroup ?? groupsConfig.teams_per_group) || Math.max(
        2,
        configuredGroupCapacity,
        Math.ceil(numParticipants / requestedNumGroups),
      );
      const teamsAdvancing = Number(
        advancementConfig.teamsAdvancing ?? config.teamsAdvancingPerGroup ?? 1,
      );
      const allowWildcard = (advancementConfig.allowWildcardThird as boolean) || false;
      const wildcardTeams = (advancementConfig.wildcardTeamsAdvancing as number) || 0;
      const playoffType = String(
        playoffConfig.type ?? config.knockoutBracketType ?? 'SINGLE_ELIMINATION',
      );
      const rtp = resolveRoundsToPlay(divConfig, { groupsConfig }, config);

      if (numParticipants < 2) {
        throw new BadRequestException('Cần ít nhất 2 đội tham gia');
      }

      // Validate groups config. Use the organizer's saved settings, not an inferred group count.
      const actualNumGroups = requestedNumGroups;
      if (!Number.isInteger(actualNumGroups) || actualNumGroups < 2) {
        throw new BadRequestException('Cần ít nhất 2 bảng để tạo vòng loại trực tiếp');
      }
      if (!Number.isInteger(teamsPerGroup) || teamsPerGroup < 2) {
        throw new BadRequestException('Mỗi bảng cần ít nhất 2 đội');
      }
      if (actualNumGroups > Math.floor(numParticipants / 2)) {
        throw new BadRequestException('Số bảng quá nhiều so với số đội tham gia hiện tại');
      }
      if (actualNumGroups * teamsPerGroup < numParticipants) {
        throw new BadRequestException('Cấu hình bảng không đủ chỗ cho tất cả đội tham gia');
      }
      const smallestGroupSize = Math.floor(numParticipants / actualNumGroups);
      if (!Number.isInteger(teamsAdvancing) || teamsAdvancing < 1 || teamsAdvancing >= smallestGroupSize) {
        throw new BadRequestException('Số số đi tiếp mỗi bảng không hợp lệ');
      }
      if (allowWildcard && (!Number.isInteger(wildcardTeams) || wildcardTeams < 1 || wildcardTeams > actualNumGroups)) {
        throw new BadRequestException('Số đội wildcard đi tiếp không hợp lệ');
      }
      if (!Number.isInteger(rtp) || rtp < 1 || rtp > 5) {
        throw new BadRequestException('Số lượt vòng bảng phải nằm trong khoảng 1-5');
      }

      // 3. Soft-delete các Stage/Group/Matches cũ
      await tx
        .update(schema.tournamentStages)
        .set({ deletedAt: new Date() })
        .where(
          divisionId
            ? and(
                eq(schema.tournamentStages.tournamentId, tournamentId),
                eq(schema.tournamentStages.tournamentDivisionId, divisionId),
              )
            : eq(schema.tournamentStages.tournamentId, tournamentId),
        );

      // 4. Stage 1: Round Robin
      const winPts = typeof scoring.winPoints === 'number' ? scoring.winPoints : 3;
      const drawPts = typeof scoring.drawPoints === 'number' ? scoring.drawPoints : 1;
      const lossPts = typeof scoring.lossPoints === 'number' ? scoring.lossPoints : 0;

      const [stage1] = await tx
        .insert(schema.tournamentStages)
        .values({
          tournamentId,
          name: 'Vòng bảng',
          type: 'ROUND_ROBIN',
          order: 1,
          tournamentDivisionId: divisionId ?? null,
          roundConfig: {
            ...stageSportRuleOverrides,
            scoring: {
              ...(asConfigRecord(stageSportRuleOverrides.scoring) || {}),
              winPoints: winPts,
              drawPoints: drawPts,
              lossPoints: lossPts,
            },
            tiebreakerRules,
            advanceConfig: {
              teamsAdvancing: advancementConfig.teamsAdvancing || 1,
              allowWildcardThird: allowWildcard,
              wildcardTeamsAdvancing: wildcardTeams,
            },
            maxGroupSize: teamsPerGroup,
            roundsToPlay: rtp,
          },
        })
        .returning();

      // Phân bố participants vào groups (snake draft)
      const sortedParticipants = [...participants];
      if (seedingType === 'SEEDED') {
        sortedParticipants.sort((a, b) => (a.seed || 999) - (b.seed || 999));
      } else {
        for (let i = sortedParticipants.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = sortedParticipants[i];
          sortedParticipants[i] = sortedParticipants[j];
          sortedParticipants[j] = temp;
        }
      }

      let groupParticipants: Array<Array<typeof participants[0]>>;
      try {
        groupParticipants = allocateRoundRobinGroups(
          sortedParticipants,
          actualNumGroups,
          configuredGroups,
          teamsPerGroup,
        );
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Cấu hình bảng không hợp lệ');
      }

      // Tạo groups + standings
      const groups: Array<{ id: string; name: string }> = [];
      for (let g = 0; g < actualNumGroups; g++) {
        const [newGroup] = await tx
          .insert(schema.tournamentGroups)
          .values({
            stageId: stage1.id,
            name: configuredGroups[g]?.name || `Bảng ${String.fromCharCode(65 + g)}`,
            roundConfig: configuredGroups[g]?.roundConfig || null,
          })
          .returning();
        groups.push(newGroup);

        for (const p of groupParticipants[g]) {
          await tx.insert(schema.groupStandings).values({
            groupId: newGroup.id,
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
      }

      // Circle method scheduling for each group
      const allMatchesToInsert: (typeof schema.matches.$inferInsert)[] = [];
      let globalMatchCounter = 1;

      for (let g = 0; g < groups.length; g++) {
        const group = groups[g];
        const participantIds = groupParticipants[g].map(p => p.id);
        for (const scheduled of buildRoundRobinSchedule(participantIds, rtp)) {
          allMatchesToInsert.push({
            id: randomUUID(),
            groupId: group.id,
            roundNumber: scheduled.roundNumber,
            matchOrder: globalMatchCounter++,
            bracketBranch: 'MAIN',
            status: 'SCHEDULED',
            isBye: false,
            participant1Id: scheduled.participant1Id,
            participant2Id: scheduled.participant2Id,
            winnerId: null,
            p1SetsWon: 0,
            p2SetsWon: 0,
            totalSetsPlayed: 0,
            nextMatchId: null,
            loserNextMatchId: null,
            tournamentId,
            stageId: stage1.id,
            updatedAt: new Date(),
          });
        }
      }

      if (allMatchesToInsert.length > 0) {
        await tx.insert(schema.matches).values(allMatchesToInsert);
      }

      // 6. Stage 2: Playoff (SINGLE_ELIMINATION or DOUBLE_ELIMINATION)
      const totalAdvancing = teamsAdvancing * actualNumGroups + (allowWildcard ? wildcardTeams : 0);
      const powerOf2 = Math.pow(2, Math.ceil(Math.log2(totalAdvancing)));

      const playoffTypeUpper = playoffType.toUpperCase();
      const [stage2] = await tx
        .insert(schema.tournamentStages)
        .values({
          tournamentId,
          name: playoffTypeUpper === 'DOUBLE_ELIMINATION' ? 'Vòng loại trực tiếp (Nhánh thua)' : 'Vòng loại trực tiếp',
          type: playoffTypeUpper,
          order: 2,
          tournamentDivisionId: divisionId ?? null,
          roundConfig: {
            ...playoffSportRuleOverrides,
            advanceMapping: {
              numGroups: actualNumGroups,
              teamsAdvancing,
              allowWildcard: allowWildcard,
              wildcardTeams,
              totalAdvancing,
            },
          },
        })
        .returning();

      if (playoffTypeUpper === 'SINGLE_ELIMINATION') {
        // Tạo bracket rỗng (TBD slots) cho knockout stage
        const [koGroup] = await tx
          .insert(schema.tournamentGroups)
          .values({
            stageId: stage2.id,
            name: 'Vòng loại trực tiếp',
          })
          .returning();

        const totalRounds = Math.log2(powerOf2);
        const matchNodesByRound = new Map<number, MatchNode[]>();

        for (let r = totalRounds; r >= 1; r--) {
          const matchesInRound = Math.pow(2, totalRounds - r);
          const roundMatches: MatchNode[] = [];
          for (let i = 0; i < matchesInRound; i++) {
            roundMatches.push({
              id: randomUUID(),
              groupId: koGroup.id,
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
              stageId: stage2.id,
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
            currentRoundMatches[i].nextMatchId = nextRoundMatches[nextMatchIndex].id;
          }
        }

        // Insert matches
        for (let r = totalRounds; r >= 1; r--) {
          const roundMatches = matchNodesByRound.get(r)!;
          if (roundMatches.length > 0) {
            await tx.insert(schema.matches).values(roundMatches);
          }
        }
      } else {
        // DOUBLE_ELIMINATION
        const [koGroup] = await tx
          .insert(schema.tournamentGroups)
          .values({
            stageId: stage2.id,
            name: 'Vòng loại trực tiếp',
          })
          .returning();

        const shape = getDoubleEliminationShape(powerOf2);
        // Winners bracket
        const winnersRounds = shape.winnersRounds;
        const winnersMatchesByRound: MatchNode[][] = [];
        for (let r = 0; r < winnersRounds; r++) {
          const matchesInRound = Math.pow(2, winnersRounds - 1 - r);
          const roundMatches: MatchNode[] = [];
          for (let i = 0; i < matchesInRound; i++) {
            roundMatches.push({
              id: randomUUID(),
              groupId: koGroup.id,
              roundNumber: r + 1,
              matchOrder: i + 1,
              bracketBranch: 'WINNERS',
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
              stageId: stage2.id,
            });
          }
          winnersMatchesByRound.push(roundMatches);
        }

        // Losers bracket
        const losersRounds = shape.losersRounds;
        const losersMatchesByRound: MatchNode[][] = [];
        for (let r = 0; r < losersRounds; r++) {
          const matchesInRound = shape.losersMatchCounts[r];
          const roundMatches: MatchNode[] = [];
          for (let i = 0; i < matchesInRound; i++) {
            roundMatches.push({
              id: randomUUID(),
              groupId: koGroup.id,
              roundNumber: winnersRounds + r + 1,
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
              stageId: stage2.id,
            });
          }
          losersMatchesByRound.push(roundMatches);
        }

        // Grand final
        const grandFinal: MatchNode = {
          id: randomUUID(),
          groupId: koGroup.id,
          roundNumber: winnersRounds + losersRounds + 1,
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
          stageId: stage2.id,
        };

        // Link winners bracket
        for (let r = 0; r < winnersRounds - 1; r++) {
          const currentRound = winnersMatchesByRound[r];
          const nextRound = winnersMatchesByRound[r + 1];
          for (let i = 0; i < currentRound.length; i++) {
            const nextMatchIndex = Math.floor(i / 2);
            currentRound[i].nextMatchId = nextRound[nextMatchIndex].id;
          }
        }
        // Winners final → grand final
        const lastWinnersRound = winnersMatchesByRound[winnersMatchesByRound.length - 1];
        if (lastWinnersRound) {
          lastWinnersRound[0].nextMatchId = grandFinal.id;
        }

        // Link losers bracket
        for (let r = 0; r < losersRounds; r++) {
          const currentRound = losersMatchesByRound[r];
          const nextRound = losersMatchesByRound[r + 1];
          if (nextRound) {
            for (let i = 0; i < currentRound.length; i++) {
              const nextMatchIndex = Math.floor(i / 2);
              currentRound[i].nextMatchId = nextRound[nextMatchIndex].id;
            }
          }
        }
        // Losers final → grand final
        const lastLosersRound = losersMatchesByRound[losersMatchesByRound.length - 1];
        if (lastLosersRound) {
          lastLosersRound[0].nextMatchId = grandFinal.id;
        }

        // Insert all matches
        const allMatches = [
          ...winnersMatchesByRound.flat(),
          ...losersMatchesByRound.flat(),
          grandFinal,
        ];
        await tx.insert(schema.matches).values(allMatches);
      }

      return {
        message: 'Đã tạo bảng + vòng loại trực tiếp thành công',
        stage1Id: stage1.id,
        stage2Id: stage2.id,
        totalGroups: actualNumGroups,
        totalAdvancing,
      };
    });
  }

  // ─── Advance Standings: Group Stage → Knockout ───
  async advanceStandings(
    tournamentId: string,
    divisionId: string,
    stageId: string,
  ) {
    return await this.db.transaction(async (tx) => {
      // 1. Load stage 1 (ROUND_ROBIN) info
      const [stage1] = await tx
        .select()
        .from(schema.tournamentStages)
        .where(eq(schema.tournamentStages.id, stageId))
        .limit(1);

      if (!stage1) throw new BadRequestException('Không tìm thấy vòng đấu');
      if (stage1.type !== 'ROUND_ROBIN') throw new BadRequestException('Vòng đấu phải là hình thức vòng tròn');

      const advanceConfig = (stage1.roundConfig as Record<string, unknown>)?.advanceConfig as Record<string, unknown> || {};
      const teamsAdvancing = (advanceConfig.teamsAdvancing as number) || 1;
      const allowWildcard = (advanceConfig.allowWildcardThird as boolean) || false;
      const wildcardTeams = (advanceConfig.wildcardTeamsAdvancing as number) || 0;

      // 2. Find stage 2 (knockout)
      const stages = await tx
        .select()
        .from(schema.tournamentStages)
        .where(
          and(
            eq(schema.tournamentStages.tournamentId, tournamentId),
            divisionId ? eq(schema.tournamentStages.tournamentDivisionId, divisionId) : undefined,
            eq(schema.tournamentStages.order, 2),
            isNull(schema.tournamentStages.deletedAt),
          ),
        )
        .limit(1);

      const stage2 = stages[0];
      if (!stage2) throw new BadRequestException('Chưa tìm thấy vòng loại trực tiếp (vòng 2). Vui lòng tạo sơ đồ trước.');

      // 3. Load groups + standings for stage 1
      const groups = await tx
        .select()
        .from(schema.tournamentGroups)
        .where(eq(schema.tournamentGroups.stageId, stageId));

      const groupIds = groups.map((g) => g.id);
      const allStandings = await tx
        .select()
        .from(schema.groupStandings)
        .where(inArray(schema.groupStandings.groupId, groupIds));

      const completedGroupMatches = await tx
        .select({
          groupId: schema.matches.groupId,
          participant1Id: schema.matches.participant1Id,
          participant2Id: schema.matches.participant2Id,
          winnerId: schema.matches.winnerId,
          scoreDetails: schema.matches.scoreDetails,
        })
        .from(schema.matches)
        .where(and(
          inArray(schema.matches.groupId, groupIds),
          eq(schema.matches.status, 'COMPLETED'),
          isNull(schema.matches.deletedAt),
        ));

      // 4. Rank each group
      const advancingParticipants: Array<{ participantId: string; groupIndex: number; rank: number }> = [];

      for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi];
        const groupStandings = allStandings.filter((s) => s.groupId === group.id);

        // Use the same football tie-break order as the public standings endpoint.
        const orderedStandings = sortFootballStandings(groupStandings, completedGroupMatches);
        groupStandings.splice(0, groupStandings.length, ...orderedStandings);

        // Check for ties and create playoff matches
        const pointGroups = new Map<number, typeof groupStandings>();
        for (const s of groupStandings) {
          const list = pointGroups.get(s.totalPoints) || [];
          list.push(s);
          pointGroups.set(s.totalPoints, list);
        }

        const hasFootballScore = completedGroupMatches.some((match) => {
          const scoreDetails = match.scoreDetails;
          return scoreDetails && typeof scoreDetails === 'object' &&
            Boolean((scoreDetails as Record<string, unknown>).football);
        });
        for (const [, tiedGroup] of pointGroups) {
          if (tiedGroup.length >= 2 && !hasFootballScore) {
            await this.resolveTiebreakers(
              tx,
              tournamentId,
              stageId,
              group.id,
              tiedGroup.map(s => ({
                participantId: s.participantId,
                totalPoints: s.totalPoints,
                pointsFor: s.pointsFor,
                pointsAgainst: s.pointsAgainst,
              })),
              { primary: 'H2H_POINTS', secondary: ['SET_DIFF', 'POINT_DIFF'] },
            );
          }
        }

        // Take top N advancing
        for (let r = 0; r < teamsAdvancing && r < groupStandings.length; r++) {
          advancingParticipants.push({
            participantId: groupStandings[r].participantId,
            groupIndex: gi,
            rank: r + 1,
          });
        }
      }

      // Wildcard: best third-place
      if (allowWildcard && wildcardTeams > 0) {
        const thirdPlaced: Array<{ participantId: string; pointsFor: number; pointsAgainst: number }> = [];
        for (let gi = 0; gi < groups.length; gi++) {
          const group = groups[gi];
          const groupStandings = allStandings.filter((s) => s.groupId === group.id);
          const orderedStandings = sortFootballStandings(groupStandings, completedGroupMatches);
          groupStandings.splice(0, groupStandings.length, ...orderedStandings);
          if (groupStandings.length >= 3) {
            thirdPlaced.push({
              participantId: groupStandings[2].participantId,
              pointsFor: groupStandings[2].pointsFor,
              pointsAgainst: groupStandings[2].pointsAgainst,
            });
          }
        }
        thirdPlaced.sort((a, b) => {
          const diffA = a.pointsFor - a.pointsAgainst;
          const diffB = b.pointsFor - b.pointsAgainst;
          if (diffB !== diffA) return diffB - diffA;
          if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
          return a.participantId.localeCompare(b.participantId);
        });
        for (let i = 0; i < Math.min(wildcardTeams, thirdPlaced.length); i++) {
          advancingParticipants.push({
            participantId: thirdPlaced[i].participantId,
            groupIndex: -1,
            rank: 3,
          });
        }
      }

      // 4. Fill advancing participants into stage 2 match slots (cross-group seeding)
      const koMatches = await tx
        .select()
        .from(schema.matches)
        .where(
          and(
            eq(schema.matches.stageId, stage2.id),
            isNull(schema.matches.deletedAt),
          ),
        )
        .orderBy(schema.matches.roundNumber, schema.matches.matchOrder);

      if (koMatches.length === 0) {
        throw new BadRequestException('Không tìm thấy trận đấu loại trực tiếp ở vòng 2');
      }

      // Cross-group seeding: A1 vs B2, B1 vs A2, etc.
      const round1Matches = koMatches.filter((m) => m.roundNumber === 1);
      const advancingByGroup = new Map<number, typeof advancingParticipants>();
      for (const ap of advancingParticipants) {
        const list = advancingByGroup.get(ap.groupIndex) || [];
        list.push(ap);
        advancingByGroup.set(ap.groupIndex, list);
      }

      const numAdvGroups = advancingByGroup.size;
      let matchIdx = 0;
      for (let gi = 0; gi < numAdvGroups; gi++) {
        const groupAdv = advancingByGroup.get(gi) || [];
        if (groupAdv.length < 1) continue;

        // A1 vs B2, B1 vs A2 pattern
        const nextGi = (gi + 1) % numAdvGroups;
        const nextGroupAdv = advancingByGroup.get(nextGi) || [];

        if (matchIdx < round1Matches.length) {
          round1Matches[matchIdx].participant1Id = groupAdv[0]?.participantId || null;
          round1Matches[matchIdx].participant2Id = nextGroupAdv[1]?.participantId || null;
          matchIdx++;
        }
        if (matchIdx < round1Matches.length && nextGroupAdv.length > 0) {
          round1Matches[matchIdx].participant1Id = nextGroupAdv[0]?.participantId || null;
          round1Matches[matchIdx].participant2Id = groupAdv[1]?.participantId || null;
          matchIdx++;
        }
      }

      // Update matches in DB
      for (const m of koMatches) {
        await tx
          .update(schema.matches)
          .set({
            participant1Id: m.participant1Id,
            participant2Id: m.participant2Id,
            updatedAt: new Date(),
          })
          .where(eq(schema.matches.id, m.id));
      }

      return {
        message: 'Đã đưa đội đi tiếp vào vòng loại trực tiếp thành công',
        stage2Id: stage2.id,
        advancingParticipants: advancingParticipants.length,
      };
    });
  }
}
