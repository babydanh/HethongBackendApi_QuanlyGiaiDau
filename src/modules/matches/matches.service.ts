import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { MatchesRepository } from './matches.repository';
import { QueryMatchDto } from './dto/query-match.dto';
import { UpdateMatchScoreDto } from './dto/update-match-score.dto';
import { UpdateMatchStatusDto } from './dto/update-match-status.dto';
import { LiveScoreGateway } from './live-score.gateway';
import { RankingsService } from '../rankings/rankings.service';

interface RoundConfig {
  bestOf?: number;
  pointsPerSet?: number;
  deuceEnabled?: boolean;
  tiebreakAt?: number;
  maxPoints?: number;
  sets_to_win?: number;
  points_per_set?: number;
  deuce_enabled?: boolean;
  tiebreak_at?: number;
  max_points?: number;
}

@Injectable()
export class MatchesService {
  constructor(
    private readonly matchesRepository: MatchesRepository,
    private readonly liveScoreGateway: LiveScoreGateway,
    private readonly rankingsService: RankingsService,
  ) {}

  async findAll(query: QueryMatchDto) {
    return this.matchesRepository.findAll(query);
  }

  async findOne(id: string) {
    const match = await this.matchesRepository.findById(id);
    if (!match) {
      throw new NotFoundException('Match not found');
    }
    return match;
  }

  // Helper method to validate set score details
  private validateScoreDetails(scoreDetails: Record<string, unknown>, roundConfig: RoundConfig) {
    const bestOf = roundConfig?.bestOf || (roundConfig?.sets_to_win ? (roundConfig.sets_to_win * 2 - 1) : 3);
    const pointsPerSet = roundConfig?.pointsPerSet || roundConfig?.points_per_set || 21;
    const deuceEnabled = roundConfig?.deuceEnabled !== false && roundConfig?.deuce_enabled !== false;
    const tiebreakAt = roundConfig?.tiebreakAt || roundConfig?.tiebreak_at || 20;
    const maxPoints = roundConfig?.maxPoints || roundConfig?.max_points || 30;

    if (!scoreDetails || typeof scoreDetails !== 'object') {
      throw new BadRequestException('scoreDetails must be an object containing set scores (e.g. { set1: "21-19" }).');
    }

    const setsToWin = Math.ceil(bestOf / 2);
    let p1SetsWon = 0;
    let p2SetsWon = 0;

    const setKeys = Object.keys(scoreDetails).sort();
    if (setKeys.length === 0) {
      throw new BadRequestException('No set scores provided in scoreDetails.');
    }

    for (const key of setKeys) {
      const scoreStr = scoreDetails[key];
      if (typeof scoreStr !== 'string') {
        throw new BadRequestException(`Tỉ số set cho key '${key}' phải là chuỗi 'p1-p2'.`);
      }

      const parts = scoreStr.split('-');
      if (parts.length !== 2) {
        throw new BadRequestException(`Tỉ số set '${scoreStr}' không đúng định dạng 'p1-p2'.`);
      }

      const p1 = parseInt(parts[0], 10);
      const p2 = parseInt(parts[1], 10);
      if (isNaN(p1) || isNaN(p2) || p1 < 0 || p2 < 0) {
        throw new BadRequestException(`Điểm số set '${scoreStr}' phải là số nguyên không âm.`);
      }

      const maxScore = Math.max(p1, p2);
      const minScore = Math.min(p1, p2);
      const diff = maxScore - minScore;

      // Validate points per set
      if (maxScore < pointsPerSet) {
        throw new BadRequestException(`Hiệp ${key}: Điểm của người thắng set (${maxScore}) phải đạt tối thiểu là ${pointsPerSet}.`);
      }

      // Validate deuce
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
        } else {
          // minScore < tiebreakAt
          if (maxScore !== pointsPerSet) {
            throw new BadRequestException(`Hiệp ${key}: Người thắng set phải đạt đúng ${pointsPerSet} điểm.`);
          }
        }
      } else {
        // deuceEnabled is false
        if (maxScore !== pointsPerSet) {
          throw new BadRequestException(`Hiệp ${key}: Deuce bị tắt, điểm của người thắng set phải đạt đúng ${pointsPerSet}.`);
        }
      }

      if (p1 > p2) {
        p1SetsWon++;
      } else {
        p2SetsWon++;
      }
    }

    return {
      p1SetsWon,
      p2SetsWon,
      setsToWin,
      totalSets: setKeys.length,
    };
  }

  async updateScore(
    id: string,
    userId: string,
    updateMatchScoreDto: UpdateMatchScoreDto,
  ) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    let p1SetsWon = updateMatchScoreDto.p1SetsWon;
    let p2SetsWon = updateMatchScoreDto.p2SetsWon;
    const scoreDetails = updateMatchScoreDto.scoreDetails;
    let winnerId = updateMatchScoreDto.winnerId;

    // 1. Validate score details if provided
    if (scoreDetails) {
      // Find round config from stage
      const roundConfig = (existing.stage?.roundConfig as RoundConfig) || {};
      const validation = this.validateScoreDetails(scoreDetails, roundConfig);

      // Verify sets won align with scoreDetails
      if (p1SetsWon !== undefined && p1SetsWon !== validation.p1SetsWon) {
        throw new BadRequestException(`p1SetsWon (${p1SetsWon}) không khớp với tỉ số chi tiết (${validation.p1SetsWon}).`);
      }
      if (p2SetsWon !== undefined && p2SetsWon !== validation.p2SetsWon) {
        throw new BadRequestException(`p2SetsWon (${p2SetsWon}) không khớp với tỉ số chi tiết (${validation.p2SetsWon}).`);
      }

      p1SetsWon = validation.p1SetsWon;
      p2SetsWon = validation.p2SetsWon;

      // Suggest winner automatically
      if (p1SetsWon >= validation.setsToWin) {
        if (winnerId && winnerId !== existing.participant1Id) {
          throw new BadRequestException('WinnerId không khớp với kết quả set thắng.');
        }
        winnerId = existing.participant1Id || undefined;
      } else if (p2SetsWon >= validation.setsToWin) {
        if (winnerId && winnerId !== existing.participant2Id) {
          throw new BadRequestException('WinnerId không khớp với kết quả set thắng.');
        }
        winnerId = existing.participant2Id || undefined;
      }
    }

    const updatedMatch = await this.matchesRepository.updateScore(id, userId, {
      p1SetsWon,
      p2SetsWon,
      scoreDetails,
      winnerId,
    });

    // Broadcast score real-time
    this.liveScoreGateway.broadcastScoreUpdate(id, updatedMatch);

    return updatedMatch;
  }

  async updateStatus(id: string, updateMatchStatusDto: UpdateMatchStatusDto) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    if (updateMatchStatusDto.status === 'COMPLETED') {
      // Validate that we have a winner
      let winnerId = existing.winnerId;
      if (!winnerId) {
        // Try to determine winner based on sets won
        const roundConfig = (existing.stage?.roundConfig as RoundConfig) || {};
        const bestOf = roundConfig.bestOf || (roundConfig.sets_to_win ? (roundConfig.sets_to_win * 2 - 1) : 3);
        const setsToWin = Math.ceil(bestOf / 2);

        if (existing.p1SetsWon >= setsToWin) {
          winnerId = existing.participant1Id;
        } else if (existing.p2SetsWon >= setsToWin) {
          winnerId = existing.participant2Id;
        }
      }

      if (!winnerId) {
        throw new BadRequestException('Chưa xác định được người chiến thắng. Vui lòng cập nhật tỉ số trước.');
      }

      // Perform transaction completion, auto-advancing, and standings
      const isRoundRobin = existing.stage?.type === 'ROUND_ROBIN';
      
      const updatedMatch = await this.matchesRepository.completeMatch(id, winnerId, {
        nextMatchId: existing.nextMatchId,
        loserNextMatchId: existing.loserNextMatchId,
        matchOrder: existing.matchOrder,
        participant1Id: existing.participant1Id,
        participant2Id: existing.participant2Id,
        groupId: existing.groupId,
        isRoundRobin,
        p1SetsWon: existing.p1SetsWon,
        p2SetsWon: existing.p2SetsWon,
        scoreDetails: existing.scoreDetails as Record<string, string> | null | undefined,
      });

      // Trigger ELO Calculation (Async but we await it to catch errors or complete sequentially)
      if (existing.tournament) {
        const tournament = existing.tournament;
        const scope = tournament.tournamentType === 'CLUB' ? 'COMMUNITY' : 'PUBLIC';
        const loserId = (winnerId === existing.participant1Id) ? existing.participant2Id : existing.participant1Id;

        if (winnerId && loserId) {
          try {
            await this.rankingsService.processMatchResult(
              id,
              winnerId,
              loserId,
              tournament.categoryId,
              tournament.matchType,
              scope,
              tournament.communityId || undefined,
            );
          } catch (err) {
            console.error('Failed to update ELO after match completion:', err.message);
            // We don't rollback the match completion since the match is physically played,
            // but logging is critical.
          }
        }
      }

      // Broadcast status and bracket updates real-time
      this.liveScoreGateway.broadcastMatchStatus(id, updatedMatch);
      this.liveScoreGateway.broadcastScoreUpdate(id, updatedMatch);

      return updatedMatch;
    } else {
      // ONGOING or SCHEDULED
      const updatedMatch = await this.matchesRepository.updateStatus(
        id,
        updateMatchStatusDto,
      );

      // Broadcast status real-time
      this.liveScoreGateway.broadcastMatchStatus(id, updatedMatch);

      return updatedMatch;
    }
  }

  async updateSchedule(
    id: string,
    data: { courtId?: string; refereeId?: string; scheduledAt?: string },
  ) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    const updatedMatch = await this.matchesRepository.updateSchedule(id, data);
    this.liveScoreGateway.broadcastScoreUpdate(id, updatedMatch);
    return updatedMatch;
  }
}
