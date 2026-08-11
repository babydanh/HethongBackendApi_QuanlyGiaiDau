import { ConflictException, Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
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
import {
  hasRole,
  isAdminUser,
  isMatchOwnerOrAdmin,
} from '../../common/helpers/role.helper';
import { UserRole } from '../../common/constants/enums';

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
    return isAdminUser(user);
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
      expectedRevision?: number;
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
      expectedRevision: overrideOutcome?.expectedRevision,
    });

    // Stale-revision completion conflict (D3): another device already changed
    // the match — surface as 409 so the client refetches before retrying.
    if (updatedMatch && typeof updatedMatch === 'object' && 'conflict' in updatedMatch) {
      const conflict = updatedMatch as unknown as {
        conflict: true;
        currentMatch: { revision: number };
      };
      throw new ConflictException({
        message: 'Điểm đã thay đổi từ thiết bị khác. Vui lòng làm mới trước khi chốt kết quả.',
        currentRevision: conflict.currentMatch.revision,
      });
    }

    // A repeated completion is idempotent: the repository returns null after
    // the first transaction has already completed the match.
    if (!updatedMatch) return existing;

    try {
      await this.redisService.del(`match:live:${matchId}`);
    } catch (err) {
      console.error('Failed to delete live score cache:', err);
    }

    // Invalidate matches list cache
    try {
      await this.redisService.delByPattern('matches:list:*');
    } catch (err) {
      console.error('Failed to invalidate matches list cache:', err);
    }

    // NOTE-3 (T12): ELO is now enqueued inside the completion transaction via
    // match_elo_outbox (see matches.repository completeMatchInTx). The worker
    // (EloOutboxProcessor) owns processMatchResult with retry + idempotency.
    // No inline call here — a failure can no longer be swallowed silently.

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

    this.liveScoreGateway.broadcastMatchStatus(matchId, updatedMatch, existing.tournamentId);
    this.liveScoreGateway.broadcastScoreUpdate(matchId, updatedMatch, existing.tournamentId);

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

    // Gửi thông báo cho người theo dõi giải đấu
    if (existing.tournamentId) {
      try {
        const followers = await this.matchesRepository.getFollowerUserIds(existing.tournamentId);
        for (const fid of followers) {
          await this.notificationsService.sendNotification({
            receiverId: fid,
            type: 'MATCH_COMPLETED',
            title: `Cập nhật kết quả trận đấu`,
            content: existing.tournament?.name
              ? `Trận đấu thuộc giải "${existing.tournament.name}" đã có kết quả.`
              : 'Một trận đấu trong giải bạn theo dõi đã có kết quả.',
            redirectUrl: `/tournaments/${existing.tournamentId}`,
          });
        }
      } catch (err) {
        console.error('Failed to send follower match notifications:', err);
      }
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
      groupConfig: match.group?.roundConfig as Record<string, unknown> | null | undefined,
      roundNumber: match.roundNumber,
      matchConfig: match.matchConfig as Record<string, unknown> | null | undefined,
    });
  }

  private validateBasicOverrideScoreDetails(scoreDetails: Record<string, unknown>) {
    const rawSets = scoreDetails.sets;
    if (!Array.isArray(rawSets)) {
      throw new BadRequestException('Override score yêu cầu scoreDetails.sets là một mảng hợp lệ.');
    }
    // Lite is free-form, but keep a bounded payload and sane integer scores.
    if (rawSets.length === 0 || rawSets.length > 99) {
      throw new BadRequestException('Số set của giải Lite phải nằm trong khoảng từ 1 đến 99.');
    }

    let p1SetsWon = 0;
    let p2SetsWon = 0;
    const lastSetIndex = rawSets.length - 1;

    rawSets.forEach((setValue, index) => {
      if (!setValue || typeof setValue !== 'object' || Array.isArray(setValue)) {
        throw new BadRequestException(`set ${index + 1} không hợp lệ.`);
      }

      const setRecord = setValue as Record<string, unknown>;
      const team1Score = Number(setRecord.team1Score);
      const team2Score = Number(setRecord.team2Score);

      if (
        !Number.isFinite(team1Score) ||
        !Number.isFinite(team2Score) ||
        !Number.isInteger(team1Score) ||
        !Number.isInteger(team2Score) ||
        team1Score < 0 ||
        team2Score < 0
      ) {
        throw new BadRequestException(`set ${index + 1} có điểm số không hợp lệ.`);
      }

      const isFinished = setRecord.isFinished !== false;
      if (!isFinished && index !== lastSetIndex) {
        throw new BadRequestException(`set ${index + 1} đang diễn ra nhưng không phải set cuối cùng.`);
      }

      if (!isFinished) {
        return;
      }

      if (team1Score === team2Score) {
        throw new BadRequestException(`set ${index + 1} không được phép hòa khi chốt ngoại lệ.`);
      }

      if (team1Score > team2Score) {
        p1SetsWon += 1;
      } else if (team2Score > team1Score) {
        p2SetsWon += 1;
      }
    });

    return {
      p1SetsWon,
      p2SetsWon,
    };
  }

  private mergeTrustedSetOverrides(
    scoreDetails: Record<string, unknown>,
    existingScoreDetails: unknown,
    overrideReason: string | undefined,
    userId: string,
  ): Record<string, unknown> {
    if (!Array.isArray(scoreDetails.sets)) {
      return scoreDetails;
    }

    const existingDetails =
      existingScoreDetails && typeof existingScoreDetails === 'object' && !Array.isArray(existingScoreDetails)
        ? (existingScoreDetails as Record<string, unknown>)
        : {};
    const existingSets = Array.isArray(existingDetails.sets) ? existingDetails.sets : [];
    let overrideTargetIndex = -1;

    if (overrideReason) {
      scoreDetails.sets.forEach((setValue, index) => {
        if (!setValue || typeof setValue !== 'object' || Array.isArray(setValue)) return;

        const existingSet = existingSets[index];
        const wasFinished =
          existingSet && typeof existingSet === 'object' && !Array.isArray(existingSet)
            ? (existingSet as Record<string, unknown>).isFinished === true
            : false;
        if ((setValue as Record<string, unknown>).isFinished === true && !wasFinished) {
          overrideTargetIndex = index;
        }
      });

    }

    const hasPerSetOverride = existingSets.some((setValue) => {
      if (!setValue || typeof setValue !== 'object' || Array.isArray(setValue)) return false;
      const setOverride = (setValue as Record<string, unknown>).scoreOverride;
      return !!setOverride && typeof setOverride === 'object' && !Array.isArray(setOverride);
    });
    const legacyOverride =
      !hasPerSetOverride &&
      existingDetails.scoreOverride &&
      typeof existingDetails.scoreOverride === 'object' &&
      !Array.isArray(existingDetails.scoreOverride) &&
      typeof (existingDetails.scoreOverride as Record<string, unknown>).reason === 'string'
        ? existingDetails.scoreOverride
        : undefined;
    const legacyOverrideTargetIndex = legacyOverride
      ? existingSets.findLastIndex((setValue) => {
          if (!setValue || typeof setValue !== 'object' || Array.isArray(setValue)) return false;
          const setRecord = setValue as Record<string, unknown>;
          return setRecord.isFinished === true && !setRecord.scoreOverride;
        })
      : -1;

    const sets = scoreDetails.sets.map((setValue, index) => {
      if (!setValue || typeof setValue !== 'object' || Array.isArray(setValue)) return setValue;

      const safeSet = { ...(setValue as Record<string, unknown>) };
      delete safeSet.scoreOverride;
      const existingSet = existingSets[index];
      const existingOverride =
        existingSet && typeof existingSet === 'object' && !Array.isArray(existingSet)
          ? (existingSet as Record<string, unknown>).scoreOverride
          : undefined;

      if (index === overrideTargetIndex && overrideReason) {
        safeSet.scoreOverride = {
          reason: overrideReason,
          decidedAt: new Date().toISOString(),
          decidedBy: userId,
        };
      } else if (
        existingOverride &&
        typeof existingOverride === 'object' &&
        !Array.isArray(existingOverride) &&
        typeof (existingOverride as Record<string, unknown>).reason === 'string'
      ) {
        safeSet.scoreOverride = existingOverride;
      } else if (index === legacyOverrideTargetIndex && legacyOverride) {
        safeSet.scoreOverride = legacyOverride;
      }

      return safeSet;
    });

    return { ...scoreDetails, sets };
  }

  async findAll(query: QueryMatchDto) {
    const cacheKey = `matches:list:${JSON.stringify(query)}`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      // Redis down — ignore cache, fall through to DB
    }

    const result = await this.matchesRepository.findAll(query);

    try {
      await this.redisService.set(cacheKey, JSON.stringify(result), 30);
    } catch (e) {
      // Redis down — ignore
    }

    return result;
  }

  async findOne(id: string) {
    const match = await this.matchesRepository.findById(id);
    if (!match) {
      throw new NotFoundException('Match not found');
    }
    const t = match.tournament;
    if (
      t &&
      (t.visibility !== 'PUBLIC' ||
        ['DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED', 'PENDING_DELETE', 'pending_delete'].includes(
          t.status,
        ))
    ) {
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
    if (existing.status === 'COMPLETED') {
      throw new BadRequestException('Trận đấu đã kết thúc, không thể nhập điểm nữa.');
    }

    if (existing.status !== 'ONGOING') {
      throw new BadRequestException('Chỉ có thể nhập điểm khi trận đấu đang diễn ra. Hãy bắt đầu trận trước.');
    }

    const isReferee = existing.refereeId === user.sub;
    const isAdmin = this.isAdmin(user);
    if (!isAdmin && !isReferee) {
      throw new ForbiddenException('Bạn không có quyền nhập điểm cho trận đấu này');
    }

    if (!existing.participant1Id || !existing.participant2Id) {
      throw new BadRequestException('Trận đấu chưa xác định đủ đối thủ, không thể nhập điểm.');
    }

    let p1SetsWon = updateMatchScoreDto.p1SetsWon;
    let p2SetsWon = updateMatchScoreDto.p2SetsWon;
    let scoreDetails = updateMatchScoreDto.scoreDetails;
    let winnerId = updateMatchScoreDto.winnerId;
    const overrideReason = updateMatchScoreDto.overrideReason?.trim();

    if (scoreDetails) {
      scoreDetails = this.mergeTrustedSetOverrides(
        scoreDetails,
        existing.scoreDetails,
        overrideReason,
        user.sub,
      );
    }

    // 1. Validate score details if provided
    if (scoreDetails) {
      if (overrideReason) {
        const validation = this.validateBasicOverrideScoreDetails(scoreDetails);
        p1SetsWon = validation.p1SetsWon;
        p2SetsWon = validation.p2SetsWon;
      } else {
        // Resolve config hierarchy (Stage -> Round -> Match)
        const resolvedConfig = this.resolveMatchConfig(existing);
        const validation = validateScoreDetails(scoreDetails, resolvedConfig);
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
    }

    if (winnerId) {
      if (winnerId !== existing.participant1Id && winnerId !== existing.participant2Id) {
        throw new BadRequestException('WinnerId không thuộc một trong hai participant của trận.');
      }

      if (winnerId === existing.participant1Id && p1SetsWon <= p2SetsWon) {
        throw new BadRequestException('Đội 1 chỉ có thể được chốt thắng khi số set/game thắng cao hơn.');
      }

      if (winnerId === existing.participant2Id && p2SetsWon <= p1SetsWon) {
        throw new BadRequestException('Đội 2 chỉ có thể được chốt thắng khi số set/game thắng cao hơn.');
      }
    }

    const nextScoreDetails =
      overrideReason && scoreDetails
        ? {
            ...scoreDetails,
            scoreOverride: {
              reason: overrideReason,
              decidedAt: new Date().toISOString(),
              decidedBy: user.sub,
            },
          }
        : scoreDetails;

    /*
      throw new BadRequestException('Trận đấu đã kết thúc');
    }

    // Nếu trận đấu đã xác định được đội thắng, tiến hành chốt kết quả và tự động đi tiếp (advancement logic)
    */
    if (winnerId) {
      return await this.finalizeCompletedMatch(existing, id, winnerId, user.sub, {
        p1SetsWon,
        p2SetsWon,
        scoreDetails: nextScoreDetails,
        expectedRevision: updateMatchScoreDto.expectedRevision,
      });
    }

    const updatedMatch = await this.matchesRepository.updateScore(id, user.sub, {
      p1SetsWon,
      p2SetsWon,
      scoreDetails: nextScoreDetails,
      expectedRevision: updateMatchScoreDto.expectedRevision,
    });

    // Optimistic-lock conflict (D3): another device wrote first → 409 + currentRevision.
    if (updatedMatch && typeof updatedMatch === 'object' && 'conflict' in updatedMatch) {
      const conflict = updatedMatch as unknown as {
        conflict: true;
        currentMatch: { revision: number };
      };
      throw new ConflictException({
        message: 'Điểm đã thay đổi từ thiết bị khác. Vui lòng làm mới trước khi nhập tiếp.',
        currentRevision: conflict.currentMatch.revision,
      });
    }

    if (!updatedMatch) {
      throw new NotFoundException('Match not found after score update');
    }

    // Cache live score in Redis if match is active/ongoing
    if (existing.status === 'ONGOING' || existing.status === 'SCHEDULED') {
      try {
        const cacheKey = `match:live:${id}`;
        if (p1SetsWon !== undefined) await this.redisService.hset(cacheKey, 'p1SetsWon', String(p1SetsWon));
        if (p2SetsWon !== undefined) await this.redisService.hset(cacheKey, 'p2SetsWon', String(p2SetsWon));
        if (nextScoreDetails) await this.redisService.hset(cacheKey, 'scoreDetails', JSON.stringify(nextScoreDetails));
        if (winnerId) await this.redisService.hset(cacheKey, 'winnerId', winnerId);

        // TTL 24 hours
        await this.redisService.getClient().expire(cacheKey, 86400);
      } catch (err) {
        console.error('Failed to cache live score to Redis:', err);
      }
    }

    // Broadcast score real-time
    this.liveScoreGateway.broadcastScoreUpdate(id, updatedMatch, existing.tournamentId);

    // Invalidate matches list cache
    try {
      await this.redisService.delByPattern('matches:list:*');
    } catch (err) {
      console.error('Failed to invalidate matches list cache:', err);
    }

    return updatedMatch;
  }

  async updateStatus(
    id: string,
    user: JwtPayload,
    updateMatchStatusDto: UpdateMatchStatusDto,
  ) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');
    if (existing.status === 'COMPLETED') {
      throw new BadRequestException('Trận đấu đã kết thúc, không thể đổi trạng thái nữa.');
    }

    const nextStatus = updateMatchStatusDto.status;
    if (nextStatus === 'ONGOING' && existing.status !== 'SCHEDULED') {
      throw new BadRequestException('A match must be scheduled before it can start.');
    }
    if (nextStatus === 'COMPLETED' && existing.status !== 'ONGOING') {
      throw new BadRequestException('A match must be ongoing before it can be completed.');
    }
    if (nextStatus === 'SCHEDULED' && existing.status !== 'SCHEDULED') {
      throw new BadRequestException('An ongoing match cannot return to scheduled.');
    }

    const isReferee = existing.refereeId === user.sub;
    const isAdmin = this.isAdmin(user);

    const canClaimAsReferee =
      updateMatchStatusDto.status === 'ONGOING' && hasRole(user, UserRole.REFEREE);
    const isOrganizer = hasRole(user, UserRole.ORGANIZER);
    if (!isAdmin && !isOrganizer && !isReferee && !canClaimAsReferee) {
      throw new ForbiddenException('Bạn không có quyền thay đổi trạng thái trận đấu này');
    }

    if (updateMatchStatusDto.status === 'ONGOING') {
      if (!existing.participant1Id || !existing.participant2Id) {
        throw new BadRequestException('Chưa đủ đối thủ để bắt đầu trận đấu.');
      }

      if (hasRole(user, UserRole.REFEREE) && existing.refereeId && existing.refereeId !== user.sub) {
        throw new ForbiddenException('This match is assigned to another referee.');
      }

      // A referee may claim an unassigned match only after the tournament accepts them.
      if (!existing.refereeId && hasRole(user, UserRole.REFEREE)) {
        const accepted = await this.matchesRepository.isRefereeAccepted(existing.tournamentId, user.sub);
        if (!accepted) {
          throw new ForbiddenException('Only an accepted tournament referee can claim this match.');
        }

        const updated = await this.matchesRepository.updateRefereeId(id, user.sub, user.sub);
        if (!updated) {
          throw new ConflictException('Another referee claimed this match.');
        }
        existing.refereeId = updated.refereeId;
      }
    }

    if (updateMatchStatusDto.status === 'COMPLETED') {
      if (existing.status === 'COMPLETED') {
        return existing;
      }

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
      if (!updatedMatch) {
        throw new NotFoundException('Match not found after status update');
      }

      // Broadcast status real-time
      this.liveScoreGateway.broadcastMatchStatus(id, updatedMatch, existing.tournamentId);

      // Invalidate matches list cache
      try {
        await this.redisService.delByPattern('matches:list:*');
      } catch (err) {
        console.error('Failed to invalidate matches list cache:', err);
      }

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
    if (existing.status === 'COMPLETED') {
      throw new BadRequestException('Trận đấu đã kết thúc, không thể áp dụng quyết định lần nữa.');
    }

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
    const resolvedConfig = this.resolveMatchConfig(existing);
    const nextP1SetsWon = isParticipant1Winner
      ? Math.max(existing.p1SetsWon, resolvedConfig.setsToWin)
      : 0;
    const nextP2SetsWon = isParticipant1Winner
      ? 0
      : Math.max(existing.p2SetsWon, resolvedConfig.setsToWin);

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

    const userId = user?.sub ?? null;
    const comment = await this.matchesRepository.createComment(
      id,
      userId as string,
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

    // Object-level authorization: admin or tournament creator only (NOTE-5)
    const isCreator = existing.tournament?.createdBy === user.sub;
    const isAdmin = this.isAdmin(user);
    if (!isAdmin && !isCreator) {
      throw new ForbiddenException('Bạn không có quyền chỉnh lịch thi đấu của giải này');
    }

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
        groupConfig: existing.group?.roundConfig as Record<string, unknown> | null | undefined,
        roundNumber: existing.roundNumber,
      }).kind;

      validateSportRuleConfig(data.matchConfig, {
        expectedKind,
        sourceLabel: 'matchConfig',
        allowRoundMetadata: true,
      });
    }

    const updatedMatch = await this.matchesRepository.updateSchedule(id, user.sub, data);
    if (updatedMatch) {
      this.liveScoreGateway.broadcastScoreUpdate(id, updatedMatch, existing.tournamentId);
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

    // Invalidate matches list cache
    try {
      await this.redisService.delByPattern('matches:list:*');
    } catch (err) {
      console.error('Failed to invalidate matches list cache:', err);
    }

    return updatedMatch;
  }

  async assignReferee(id: string, refereeId: string, user: JwtPayload) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    const isCreator = existing.tournament?.createdBy === user.sub;
    const isAdmin = this.isAdmin(user);

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

  async unmuteUser(id: string, targetUserId: string, user: JwtPayload) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    // Object-level authorization: admin or tournament creator only (NOTE-4)
    const isCreator = existing.tournament?.createdBy === user.sub;
    const isAdmin = this.isAdmin(user);
    if (!isAdmin && !isCreator) {
      throw new ForbiddenException('Bạn không có quyền quản lý bình luận trận đấu này');
    }

    await this.matchesRepository.unmuteUser(id, targetUserId);
    this.liveScoreGateway.broadcastComment(id, {
      type: 'MUTE_UPDATE',
      userId: targetUserId,
      action: 'UNMUTE',
    });
    return { message: 'Đã bỏ cấm/mute người dùng' };
  }

  async getMutedUsers(id: string, user: JwtPayload) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    if (!isMatchOwnerOrAdmin(user, existing.tournament?.createdBy)) {
      throw new ForbiddenException('Bạn không có quyền xem danh sách người dùng bị hạn chế');
    }

    return this.matchesRepository.getMutedUsers(id);
  }

  async cheerMatch(id: string) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    const updated = await this.matchesRepository.incrementCheerCount(id);
    if (!updated) {
      throw new NotFoundException('Match not found after cheer update');
    }

    // Invalidate Redis list cache so home page gets fresh cheerCount
    try {
      await this.redisService.delByPattern('matches:list:*');
    } catch (e) {
      // Ignore redis errors
    }

    // Broadcast cheer update realtime
    this.liveScoreGateway.broadcastCheerUpdate(id, updated.cheerCount);

    return { cheerCount: updated.cheerCount };
  }

  async getCheerCount(id: string) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');
    return { cheerCount: existing.cheerCount ?? 0 };
  }
}
