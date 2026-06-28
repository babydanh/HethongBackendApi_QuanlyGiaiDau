import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { MatchesRepository } from './matches.repository';
import { MATCH_OPERATION_ACTIONS, MatchOperationAction, OperateMatchDto } from './dto/operate-match.dto';
import { QueryMatchDto } from './dto/query-match.dto';
import { UpdateMatchScoreDto } from './dto/update-match-score.dto';
import { UpdateMatchStatusDto } from './dto/update-match-status.dto';
import { CreateMatchCommentDto } from './dto/create-match-comment.dto';
import { LiveScoreGateway } from './live-score.gateway';
import { RankingsService } from '../rankings/rankings.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  buildMatchCompletedNotification,
  buildMatchScheduledNotification,
  buildRefereeAssignedNotification,
} from '../notifications/notification-builder';
import { RedisService } from '../../providers/redis/redis.service';
import { resolveEffectiveSportRules } from '../tournaments/utils/sport-rules/resolve-effective-sport-rules';
import { validateSportRuleConfig } from '../tournaments/utils/sport-rules/validate-sport-rules-config';
import { validateScoreDetails } from './utils/score-validation/validate-score-details';

@Injectable()
export class MatchesService {
  constructor(
    private readonly matchesRepository: MatchesRepository,
    private readonly liveScoreGateway: LiveScoreGateway,
    private readonly rankingsService: RankingsService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  private isAdmin(user: JwtPayload) {
    return user.role === 'ADMIN' || user.roles?.includes('ADMIN') === true;
  }

  private resolveOperationalWinner(
    match: Awaited<ReturnType<MatchesRepository['findById']>>,
    winnerId?: string,
  ) {
    if (!match) {
      throw new NotFoundException('Match not found');
    }
    if (!winnerId) {
      throw new BadRequestException('Phải chỉ định đội thắng cho quyết định nghiệp vụ này.');
    }
    if (winnerId !== match.participant1Id && winnerId !== match.participant2Id) {
      throw new BadRequestException('Người thắng phải thuộc một trong hai participant của trận.');
    }
    return winnerId;
  }

  private async finalizeCompletedMatch(
    existing: Awaited<ReturnType<MatchesRepository['findById']>>,
    matchId: string,
    winnerId: string,
    auditUserId: string | null,
    overrideOutcome?: {
      p1SetsWon: number;
      p2SetsWon: number;
      scoreDetails?: Record<string, unknown> | null;
    },
  ) {
    if (!existing) {
      throw new NotFoundException('Match not found');
    }

    const isRoundRobin = existing.stage?.type === 'ROUND_ROBIN';

    const updatedMatch = await this.matchesRepository.completeMatch(matchId, winnerId, {
      nextMatchId: existing.nextMatchId,
      loserNextMatchId: existing.loserNextMatchId,
      matchOrder: existing.matchOrder,
      participant1Id: existing.participant1Id,
      participant2Id: existing.participant2Id,
      groupId: existing.groupId,
      isRoundRobin,
      p1SetsWon: overrideOutcome?.p1SetsWon ?? existing.p1SetsWon,
      p2SetsWon: overrideOutcome?.p2SetsWon ?? existing.p2SetsWon,
      scoreDetails:
        overrideOutcome?.scoreDetails ??
        (existing.scoreDetails as Record<string, unknown> | null | undefined),
      auditUserId,
    });

    try {
      await this.redisService.del(`match:live:${matchId}`);
    } catch (err) {
      console.error('Failed to delete live score cache:', err);
    }

    if (existing.tournament) {
      const tournament = existing.tournament;
      const scope = tournament.tournamentType === 'CLUB' ? 'COMMUNITY' : 'PUBLIC';
      const loserId = winnerId === existing.participant1Id ? existing.participant2Id : existing.participant1Id;

      if (winnerId && loserId) {
        try {
          await this.rankingsService.processMatchResult(
            matchId,
            winnerId,
            loserId,
            tournament.categoryId,
            tournament.matchType,
            scope,
            tournament.communityId || undefined,
            (tournament as unknown as Record<string, unknown>).genderRestriction as string | undefined,
          );
        } catch (err) {
          console.error('Failed to update ELO after match completion:', err.message);
        }
      }
    }

    if (existing.tournamentId) {
      try {
        const allCompleted = await this.matchesRepository.checkAllMatchesCompleted(existing.tournamentId);
        if (allCompleted) {
          await this.matchesRepository.updateTournamentStatus(existing.tournamentId, 'COMPLETED');
        }
      } catch (err) {
        console.error('Failed to auto-complete tournament:', err.message);
      }
    }

    this.liveScoreGateway.broadcastMatchStatus(matchId, updatedMatch);
    this.liveScoreGateway.broadcastScoreUpdate(matchId, updatedMatch);

    try {
      const participantIds: string[] = [];
      if (existing.participant1Id) participantIds.push(existing.participant1Id);
      if (existing.participant2Id) participantIds.push(existing.participant2Id);

      if (participantIds.length > 0) {
        const rosters = await this.matchesRepository.getRostersForParticipants(participantIds);
        for (const roster of rosters) {
          await this.notificationsService.sendNotification(
            buildMatchCompletedNotification({
              receiverId: roster.userId,
              tournamentId: existing.tournamentId,
              tournamentName: existing.tournament?.name || 'giải đấu',
              divisionId:
                existing.participant1?.tournamentDivisionId ||
                existing.participant2?.tournamentDivisionId ||
                undefined,
            }),
          );
        }
      }
    } catch (err) {
      console.error('Failed to send MATCH_COMPLETED notifications:', err);
    }

    return updatedMatch;
  }

  private resolveMatchConfig(match: Awaited<ReturnType<MatchesRepository['findById']>>) {
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    return resolveEffectiveSportRules({
      tournamentSportRules: match.tournament?.sportRules as Record<string, unknown> | null | undefined,
      categoryConfig: match.tournament?.categoryConfig as Record<string, unknown> | null | undefined,
      categoryName: match.tournament?.categoryName,
      categorySlug: match.tournament?.categorySlug,
      stageRoundConfig: match.stage?.roundConfig as Record<string, unknown> | null | undefined,
      roundNumber: match.roundNumber,
      matchConfig: match.matchConfig as Record<string, unknown> | null | undefined,
    });
  }

  async findAll(query: QueryMatchDto) {
    return this.matchesRepository.findAll(query);
  }

  async findOne(id: string) {
    const match = await this.matchesRepository.findById(id);
    if (!match) {
      throw new NotFoundException('Match not found');
    }
    if (match.status === 'ONGOING') {
      try {
        const live = await this.redisService.hgetall(`match:live:${id}`);
        if (live && Object.keys(live).length > 0) {
          if (live.p1SetsWon !== undefined) match.p1SetsWon = Number(live.p1SetsWon);
          if (live.p2SetsWon !== undefined) match.p2SetsWon = Number(live.p2SetsWon);
          if (live.scoreDetails) match.scoreDetails = JSON.parse(live.scoreDetails);
          if (live.winnerId) match.winnerId = live.winnerId;
        }
      } catch (err) {
        console.error('Failed to get live score from Redis:', err);
      }
    }
    return match;
  }

  async updateScore(
    id: string,
    user: JwtPayload,
    updateMatchScoreDto: UpdateMatchScoreDto,
  ) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    const isCreator = existing.tournament?.createdBy === user.sub;
    const isReferee = existing.refereeId === user.sub;
    const isAdmin = this.isAdmin(user);

    if (!isAdmin && !isCreator && !isReferee) {
      throw new ForbiddenException('Bạn không có quyền nhập điểm cho trận đấu này');
    }

    if (!existing.participant1Id || !existing.participant2Id) {
      throw new BadRequestException('Trận đấu chưa xác định đủ đối thủ, không thể nhập điểm.');
    }

    let p1SetsWon = updateMatchScoreDto.p1SetsWon;
    let p2SetsWon = updateMatchScoreDto.p2SetsWon;
    const scoreDetails = updateMatchScoreDto.scoreDetails;
    let winnerId = updateMatchScoreDto.winnerId;

    // 1. Validate score details if provided
    if (scoreDetails) {
      // Resolve config hierarchy (Stage -> Round -> Match)
      const resolvedConfig = this.resolveMatchConfig(existing);
      const validation = validateScoreDetails(scoreDetails, resolvedConfig);

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

    const updatedMatch = await this.matchesRepository.updateScore(id, user.sub, {
      p1SetsWon,
      p2SetsWon,
      scoreDetails,
      winnerId,
    });

    // Cache live score in Redis if match is active/ongoing
    if (existing.status === 'ONGOING' || existing.status === 'SCHEDULED') {
      try {
        const cacheKey = `match:live:${id}`;
        if (p1SetsWon !== undefined) await this.redisService.hset(cacheKey, 'p1SetsWon', String(p1SetsWon));
        if (p2SetsWon !== undefined) await this.redisService.hset(cacheKey, 'p2SetsWon', String(p2SetsWon));
        if (scoreDetails) await this.redisService.hset(cacheKey, 'scoreDetails', JSON.stringify(scoreDetails));
        if (winnerId) await this.redisService.hset(cacheKey, 'winnerId', winnerId);

        // TTL 24 hours
        await this.redisService.getClient().expire(cacheKey, 86400);
      } catch (err) {
        console.error('Failed to cache live score to Redis:', err);
      }
    }

    // Broadcast score real-time
    this.liveScoreGateway.broadcastScoreUpdate(id, updatedMatch);

    return updatedMatch;
  }

  async updateStatus(
    id: string,
    user: JwtPayload,
    updateMatchStatusDto: UpdateMatchStatusDto,
  ) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    const isCreator = existing.tournament?.createdBy === user.sub;
    const isReferee = existing.refereeId === user.sub;
    const isAdmin = this.isAdmin(user);

    if (!isAdmin && !isCreator && !isReferee) {
      throw new ForbiddenException('Bạn không có quyền thay đổi trạng thái trận đấu này');
    }

    if (updateMatchStatusDto.status === 'ONGOING') {
      if (!existing.participant1Id || !existing.participant2Id) {
        throw new BadRequestException('Chưa đủ đối thủ để bắt đầu trận đấu.');
      }
    }

    if (updateMatchStatusDto.status === 'COMPLETED') {
      // Validate that we have a winner
      let winnerId = existing.winnerId;
      if (!winnerId) {
        // Try to determine winner based on sets won
        const resolvedConfig = this.resolveMatchConfig(existing);
        const setsToWin = resolvedConfig.setsToWin;

        if (existing.p1SetsWon >= setsToWin) {
          winnerId = existing.participant1Id;
        } else if (existing.p2SetsWon >= setsToWin) {
          winnerId = existing.participant2Id;
        }
      }

      if (!winnerId) {
        throw new BadRequestException('Chưa xác định được người chiến thắng. Vui lòng cập nhật tỉ số trước.');
      }

      return this.finalizeCompletedMatch(existing, id, winnerId, user.sub);
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

  async operateMatch(
    id: string,
    user: JwtPayload,
    data: OperateMatchDto,
  ) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    const isCreator = existing.tournament?.createdBy === user.sub;
    const isAdmin = this.isAdmin(user);
    if (!isAdmin && !isCreator) {
      throw new ForbiddenException('Bạn không có quyền áp dụng quyết định nghiệp vụ cho trận này');
    }

    const reason = data.reason.trim();
    const specialResult = {
      action: data.action,
      reason,
      decidedAt: new Date().toISOString(),
      decidedBy: user.sub,
    };

    const currentScoreDetails =
      existing.scoreDetails && typeof existing.scoreDetails === 'object'
        ? (existing.scoreDetails as Record<string, unknown>)
        : {};

    const scoreDetails = {
      ...currentScoreDetails,
      specialResult,
    };

    if (!MATCH_OPERATION_ACTIONS.includes(data.action as MatchOperationAction)) {
      throw new BadRequestException('Hành động nghiệp vụ không hợp lệ.');
    }

    const winnerId = this.resolveOperationalWinner(existing, data.winnerId);
    const isParticipant1Winner = winnerId === existing.participant1Id;
    const nextP1SetsWon = isParticipant1Winner ? Math.max(existing.p1SetsWon, 2) : 0;
    const nextP2SetsWon = isParticipant1Winner ? 0 : Math.max(existing.p2SetsWon, 2);

    return this.finalizeCompletedMatch(existing, id, winnerId, user.sub, {
      p1SetsWon: nextP1SetsWon,
      p2SetsWon: nextP2SetsWon,
      scoreDetails,
    });
  }

  async getComments(id: string) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Match not found');
    }

    const mutedUserIds = await this.matchesRepository.getMutedUserIds(id);
    return this.matchesRepository.findCommentsByMatchId(id, mutedUserIds);
  }

  async createComment(
    id: string,
    user: JwtPayload,
    createMatchCommentDto: CreateMatchCommentDto,
  ) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Match not found');
    }

    const comment = await this.matchesRepository.createComment(
      id,
      user.sub,
      createMatchCommentDto.commentText.trim(),
    );

    this.liveScoreGateway.broadcastComment(id, comment);

    return comment;
  }

  async updateSchedule(
    id: string,
    user: JwtPayload,
    data: { courtName?: string; courtAddress?: string; refereeId?: string; scheduledAt?: string; matchConfig?: Record<string, unknown> },
  ) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    if (data.refereeId) {
      const isAccepted = await this.matchesRepository.isRefereeAccepted(existing.tournamentId, data.refereeId);
      if (!isAccepted) {
        throw new BadRequestException('Trọng tài được chọn chưa xác nhận tham gia giải đấu này (status ACCEPTED)');
      }
    }

    if (data.matchConfig) {
      const expectedKind = resolveEffectiveSportRules({
        tournamentSportRules: existing.tournament?.sportRules as Record<string, unknown> | null | undefined,
        categoryName: existing.tournament?.categoryName,
        categorySlug: existing.tournament?.categorySlug,
        stageRoundConfig: existing.stage?.roundConfig as Record<string, unknown> | null | undefined,
      }).kind;

      validateSportRuleConfig(data.matchConfig, {
        expectedKind,
        sourceLabel: 'matchConfig',
        allowRoundMetadata: true,
      });
    }

    const updatedMatch = await this.matchesRepository.updateSchedule(id, user.sub, data);
    if (updatedMatch) {
      this.liveScoreGateway.broadcastScoreUpdate(id, updatedMatch);
    }

    if (data.refereeId && data.refereeId !== existing.refereeId) {
      try {
        const matchName = `${existing.participant1?.teamName || 'TBD'} vs ${existing.participant2?.teamName || 'TBD'}`;
        const scheduledTime = data.scheduledAt
          ? new Date(data.scheduledAt).toLocaleString('vi-VN')
          : (existing.scheduledAt ? new Date(existing.scheduledAt).toLocaleString('vi-VN') : 'chưa xác định');

        await this.notificationsService.sendNotification(
          buildRefereeAssignedNotification({
            receiverId: data.refereeId,
            tournamentId: existing.tournamentId,
            matchName,
            scheduledTime,
            divisionId:
              existing.participant1?.tournamentDivisionId ||
              existing.participant2?.tournamentDivisionId ||
              undefined,
          }),
        );
      } catch (err) {
        console.error('Failed to send referee assignment notification:', err);
      }
    }

    // Trigger notification when scheduling/updating time or court info
    const isScheduleChanged =
      (data.scheduledAt && data.scheduledAt !== (existing.scheduledAt ? new Date(existing.scheduledAt).toISOString() : null)) ||
      (data.courtName && data.courtName !== existing.courtName) ||
      (data.courtAddress && data.courtAddress !== existing.courtAddress);

    if (isScheduleChanged) {
      try {
        const participantIds: string[] = [];
        if (existing.participant1Id) participantIds.push(existing.participant1Id);
        if (existing.participant2Id) participantIds.push(existing.participant2Id);

        if (participantIds.length > 0) {
          const rosters = await this.matchesRepository.getRostersForParticipants(participantIds);

          const scheduledTime = data.scheduledAt
            ? new Date(data.scheduledAt).toLocaleString('vi-VN')
            : (existing.scheduledAt ? new Date(existing.scheduledAt).toLocaleString('vi-VN') : 'chưa xác định');
          const court = data.courtName || existing.courtName || 'Chưa xếp sân';

          for (const roster of rosters) {
            await this.notificationsService.sendNotification(
              buildMatchScheduledNotification({
                receiverId: roster.userId,
                tournamentId: existing.tournamentId,
                tournamentName: existing.tournament?.name || 'giải đấu',
                scheduledTime,
                court,
                divisionId:
                  existing.participant1?.tournamentDivisionId ||
                  existing.participant2?.tournamentDivisionId ||
                  undefined,
              }),
            );
          }
        }
      } catch (err) {
        console.error('Failed to send MATCH_SCHEDULED notifications:', err);
      }
    }

    return updatedMatch;
  }

  async assignReferee(id: string, refereeId: string, user: JwtPayload) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    const isCreator = existing.tournament?.createdBy === user.sub;
    const isAdmin = user.role === 'ADMIN';

    if (!isAdmin && !isCreator) {
      throw new ForbiddenException('Bạn không có quyền phân công trọng tài cho trận đấu này');
    }

    if (refereeId) {
      const isAccepted = await this.matchesRepository.isRefereeAccepted(existing.tournamentId, refereeId);
      if (!isAccepted) {
        throw new BadRequestException('Trọng tài được chọn chưa xác nhận tham gia giải đấu này (status ACCEPTED)');
      }
    }

    return this.updateSchedule(id, user, { refereeId });
  }

  async muteUser(
    id: string,
    targetUserId: string,
    type: 'MUTE' | 'BAN',
    reason: string | undefined,
    user: JwtPayload,
  ) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    const isCreator = existing.tournament?.createdBy === user.sub;
    const isAdmin = this.isAdmin(user);
    if (!isAdmin && !isCreator) {
      throw new ForbiddenException('Bạn không có quyền quản lý bình luận trận đấu này');
    }

    await this.matchesRepository.muteUser(id, targetUserId, type, reason ?? null, user.sub);
    this.liveScoreGateway.broadcastComment(id, {
      type: 'MUTE_UPDATE',
      userId: targetUserId,
      action: type,
    });

    return { message: type === 'BAN' ? 'Đã cấm người dùng này' : 'Đã mute người dùng này' };
  }

  async unmuteUser(id: string, targetUserId: string) {
    await this.matchesRepository.unmuteUser(id, targetUserId);
    this.liveScoreGateway.broadcastComment(id, {
      type: 'MUTE_UPDATE',
      userId: targetUserId,
      action: 'UNMUTE',
    });
    return { message: 'Đã bỏ cấm/mute người dùng' };
  }

  async getMutedUsers(id: string) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');
    return this.matchesRepository.getMutedUsers(id);
  }
}
