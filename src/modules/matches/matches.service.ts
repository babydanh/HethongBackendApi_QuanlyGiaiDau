import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { MatchesRepository } from './matches.repository';
import {
  MATCH_OPERATION_ACTIONS,
  MatchOperationAction,
  OperateMatchDto,
} from './dto/operate-match.dto';
import { QueryMatchDto } from './dto/query-match.dto';
import {
  CreateSchedulePlanDto,
  SCHEDULE_PLAN_STRATEGY,
} from './dto/create-schedule-plan.dto';
import { UpdateMatchScoreDto } from './dto/update-match-score.dto';
import { UpdateMatchStatusDto } from './dto/update-match-status.dto';
import { CreateMatchCommentDto } from './dto/create-match-comment.dto';
import { LiveScoreGateway } from './live-score.gateway';
import type { MatchBroadcastData } from './interfaces/match-broadcast.interface';
import { RankingsService } from '../rankings/rankings.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  buildMatchCompletedNotification,
  buildMatchScheduledNotification,
  buildMatchReminderNotification,
  buildRefereeAssignedNotification,
  buildMatchAdvancedNotification,
} from '../notifications/notification-builder';
import { RedisService } from '../../providers/redis/redis.service';
import { resolveEffectiveSportRules } from '../tournaments/utils/sport-rules/resolve-effective-sport-rules';
import { validateSportRuleConfig } from '../tournaments/utils/sport-rules/validate-sport-rules-config';
import { validateScoreDetails } from './utils/score-validation/validate-score-details';
import { aggregateFootballTwoLegs } from './utils/football-two-leg-aggregate';
import {
  isAdminUser,
  isMatchOwnerOrAdmin,
} from '../../common/helpers/role.helper';

@Injectable()
export class MatchesService {
  constructor(
    private readonly matchesRepository: MatchesRepository,
    private readonly liveScoreGateway: LiveScoreGateway,
    private readonly rankingsService: RankingsService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  @Cron('*/10 * * * *')
  async notifyUpcomingMatchReminders() {
    const now = Date.now();
    const windows = [
      { key: '24h', minutes: 24 * 60, tolerance: 10, label: '1 ngày' },
      { key: '2h', minutes: 120, tolerance: 10, label: '2 giờ' },
      { key: '30m', minutes: 30, tolerance: 5, label: '30 phút' },
    ];

    try {
      const result = await this.matchesRepository.findAll({
        page: 1,
        limit: 500,
        status: 'SCHEDULED',
      });
      for (const match of result.data) {
        if (!match.scheduledAt || match.status !== 'SCHEDULED') continue;
        const scheduledMs = new Date(match.scheduledAt).getTime();
        if (!Number.isFinite(scheduledMs) || scheduledMs <= now) continue;
        const minutesUntil = (scheduledMs - now) / 60000;
        const window = windows.find(
          (candidate) =>
            Math.abs(minutesUntil - candidate.minutes) <= candidate.tolerance,
        );
        if (!window) continue;

        const reminderKey = `match-reminder:${match.id}:${window.key}`;
        if (await this.redisService.get(reminderKey)) continue;
        await this.redisService.set(reminderKey, '1', 36 * 60 * 60);

        const participantIds = [
          match.participant1Id,
          match.participant2Id,
        ].filter((participantId): participantId is string =>
          Boolean(participantId),
        );
        const rosters =
          await this.matchesRepository.getRostersForParticipants(
            participantIds,
          );
        const scheduledAt = match.scheduledAt;
        const scheduledTime = new Date(scheduledAt).toLocaleString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        await Promise.all(
          rosters.map((roster) =>
            this.notificationsService.sendNotification(
              buildMatchReminderNotification({
                matchId: match.id,
                receiverId: roster.userId,
                tournamentName: match.tournament?.name || 'giải đấu',
                sportName: match.tournament?.category?.name,
                divisionName: match.tournament?.divisionName,
                matchType: match.tournament?.matchType,
                scheduledTime,
                court: match.courtName || 'Chưa xếp sân',
                untilLabel: window.label,
                bracketBranch: match.bracketBranch,
                roundNumber: match.roundNumber,
              }),
            ),
          ),
        );
      }
    } catch (error) {
      console.error('Failed to send upcoming match reminders:', error);
    }
  }

  private isAdmin(user: JwtPayload) {
    return isAdminUser(user);
  }

  private async isTournamentManager(
    match: Awaited<ReturnType<MatchesRepository['findById']>>,
    user: JwtPayload,
  ) {
    if (!match) return false;
    if (this.isAdmin(user) || match.tournament?.createdBy === user.sub) {
      return true;
    }
    return this.matchesRepository.isTournamentManager(
      match.tournamentId,
      user.sub,
    );
  }

  private resolveOperationalWinner(
    match: Awaited<ReturnType<MatchesRepository['findById']>>,
    winnerId?: string,
  ) {
    if (!match) {
      throw new NotFoundException('Match not found');
    }
    if (!winnerId) {
      throw new BadRequestException(
        'Phải chỉ định đội thắng cho quyết định nghiệp vụ này.',
      );
    }
    if (
      winnerId !== match.participant1Id &&
      winnerId !== match.participant2Id
    ) {
      throw new BadRequestException(
        'Người thắng phải thuộc một trong hai participant của trận.',
      );
    }
    return winnerId;
  }

  private withBroadcastContext(
    matchData: MatchBroadcastData,
    existing: {
      tournamentId?: string | null;
      participant1?: { tournamentDivisionId?: string | null } | null;
      participant2?: { tournamentDivisionId?: string | null } | null;
    },
  ): MatchBroadcastData {
    return {
      ...matchData,
      tournamentId: existing.tournamentId ?? matchData.tournamentId,
      divisionId:
        existing.participant1?.tournamentDivisionId ??
        existing.participant2?.tournamentDivisionId ??
        matchData.divisionId ??
        null,
    };
  }

  private async finalizeCompletedMatch(
    existing: Awaited<ReturnType<MatchesRepository['findById']>>,
    matchId: string,
    winnerId: string | null,
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

    const updatedMatch = await this.matchesRepository.completeMatch(
      matchId,
      winnerId,
      {
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
      },
    );

    // Stale-revision completion conflict (D3): another device already changed
    // the match — surface as 409 so the client refetches before retrying.
    if (
      updatedMatch &&
      typeof updatedMatch === 'object' &&
      'conflict' in updatedMatch
    ) {
      const conflict = updatedMatch as unknown as {
        conflict: true;
        currentMatch: { revision: number };
      };
      throw new ConflictException({
        message:
          'Điểm đã thay đổi từ thiết bị khác. Vui lòng làm mới trước khi chốt kết quả.',
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
        const allCompleted =
          await this.matchesRepository.checkAllMatchesCompleted(
            existing.tournamentId,
          );
        if (allCompleted) {
          await this.matchesRepository.updateTournamentStatus(
            existing.tournamentId,
            'COMPLETED',
          );
        }
      } catch (err) {
        console.error('Failed to auto-complete tournament:', err.message);
      }
    }

    this.liveScoreGateway.broadcastMatchStatus(
      matchId,
      this.withBroadcastContext(updatedMatch, existing),
      existing.tournamentId,
    );
    this.liveScoreGateway.broadcastScoreUpdate(
      matchId,
      this.withBroadcastContext(updatedMatch, existing),
      existing.tournamentId,
    );

    try {
      const participantIds: string[] = [];
      if (existing.participant1Id) participantIds.push(existing.participant1Id);
      if (existing.participant2Id) participantIds.push(existing.participant2Id);

      if (participantIds.length > 0) {
        const rosters =
          await this.matchesRepository.getRostersForParticipants(
            participantIds,
          );
        for (const roster of rosters) {
          await this.notificationsService.sendNotification(
            buildMatchCompletedNotification({
              matchId,
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
        const followers = await this.matchesRepository.getFollowerUserIds(
          existing.tournamentId,
        );
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

    // Gửi thông báo cho VĐV được advance vào vòng tiếp theo
    if (winnerId && existing.nextMatchId && existing.tournamentId) {
      try {
        const nextMatch = await this.matchesRepository.findById(
          existing.nextMatchId,
        );
        if (nextMatch) {
          const roundNumber = nextMatch.roundNumber ?? 0;
          const maxRoundInStage =
            await this.matchesRepository.getMaxRoundNumber(nextMatch.stageId);
          const roundLabel = this.resolveRoundLabel(
            roundNumber,
            maxRoundInStage,
            nextMatch.stage?.type,
          );

          const winnerRosters =
            await this.matchesRepository.getRostersForParticipants([winnerId]);
          for (const roster of winnerRosters) {
            await this.notificationsService.sendNotification(
              buildMatchAdvancedNotification({
                nextMatchId: existing.nextMatchId,
                tournamentId: existing.tournamentId,
                tournamentName: existing.tournament?.name || 'giải đấu',
                receiverId: roster.userId,
                roundLabel,
                divisionId:
                  existing.participant1?.tournamentDivisionId ||
                  existing.participant2?.tournamentDivisionId ||
                  undefined,
              }),
            );
          }
        }
      } catch (err) {
        console.error('Failed to send MATCH_ADVANCED notifications:', err);
      }
    }

    return updatedMatch;
  }

  private resolveMatchConfig(
    match: Awaited<ReturnType<MatchesRepository['findById']>>,
  ) {
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    return resolveEffectiveSportRules({
      tournamentConfig: match.tournament?.tournamentConfig as
        | Record<string, unknown>
        | null
        | undefined,
      tournamentSportRules: match.tournament?.sportRules as
        | Record<string, unknown>
        | null
        | undefined,
      categoryConfig: match.tournament?.categoryConfig as
        | Record<string, unknown>
        | null
        | undefined,
      categoryName: match.tournament?.categoryName,
      categorySlug: match.tournament?.categorySlug,
      stageRoundConfig: match.stage?.roundConfig as
        | Record<string, unknown>
        | null
        | undefined,
      groupConfig: match.group?.roundConfig as
        | Record<string, unknown>
        | null
        | undefined,
      roundNumber: match.roundNumber,
      matchConfig: match.matchConfig as
        | Record<string, unknown>
        | null
        | undefined,
    });
  }

  private resolveRoundLabel(
    roundNumber: number,
    totalRounds: number,
    stageType?: string | null,
  ): string {
    if (stageType === 'ROUND_ROBIN') {
      return `Vòng bảng (Lượt ${roundNumber})`;
    }
    if (totalRounds > 0) {
      if (roundNumber === totalRounds) return 'Chung kết';
      if (roundNumber === totalRounds - 1) return 'Bán kết';
      if (roundNumber === totalRounds - 2) return 'Tứ kết';
    }
    return `Vòng ${roundNumber}`;
  }

  private resolveFootballForfeitGoals(
    match: Awaited<ReturnType<MatchesRepository['findById']>>,
  ): number {
    const rules = match?.tournament?.sportRules;
    const source =
      rules && typeof rules === 'object' && !Array.isArray(rules)
        ? (rules as Record<string, unknown>)
        : {};
    const scoring =
      source.scoring &&
      typeof source.scoring === 'object' &&
      !Array.isArray(source.scoring)
        ? (source.scoring as Record<string, unknown>)
        : source;
    const configured = scoring.forfeitGoals;
    return typeof configured === 'number' &&
      Number.isInteger(configured) &&
      configured > 0 &&
      configured <= 99
      ? configured
      : 3;
  }

  private validateFootballShootout(
    match: Awaited<ReturnType<MatchesRepository['findById']>>,
    scoreDetails: Record<string, unknown> | null | undefined,
    options?: { aggregateTie?: boolean },
  ): string {
    if (!match || !scoreDetails) {
      throw new BadRequestException(
        'Trận bóng đá loại trực tiếp hòa cần tỷ số luân lưu hợp lệ.',
      );
    }
    const config = this.resolveMatchConfig(match);
    const tournamentConfig = match.tournament?.tournamentConfig as
      | Record<string, unknown>
      | undefined;
    if (
      config.kind !== 'FOOTBALL' ||
      tournamentConfig?.penaltyShootout !== true ||
      match.stage?.type === 'ROUND_ROBIN'
    ) {
      throw new BadRequestException(
        'Luân lưu chỉ được dùng cho trận bóng đá loại trực tiếp khi giải đã bật luân lưu.',
      );
    }
    const football = scoreDetails.football as
      | Record<string, unknown>
      | undefined;
    const regulation1 = football?.team1Goals;
    const regulation2 = football?.team2Goals;
    const shootout = (scoreDetails.shootout ?? football?.shootout) as
      | Record<string, unknown>
      | undefined;
    const team1Goals = shootout?.team1Goals;
    const team2Goals = shootout?.team2Goals;
    if (
      !football ||
      !Number.isInteger(regulation1) ||
      !Number.isInteger(regulation2) ||
      (regulation1 as number) < 0 ||
      (regulation2 as number) < 0 ||
      (!options?.aggregateTie && regulation1 !== regulation2) ||
      !shootout ||
      !Number.isInteger(team1Goals) ||
      !Number.isInteger(team2Goals) ||
      (team1Goals as number) < 0 ||
      (team2Goals as number) < 0 ||
      team1Goals === team2Goals
    ) {
      throw new BadRequestException(
        'Luân lưu chỉ hợp lệ khi tỷ số chính hòa và có hai số nguyên khác nhau.',
      );
    }
    const winnerId =
      (team1Goals as number) > (team2Goals as number)
        ? match.participant1Id
        : match.participant2Id;
    if (!winnerId || shootout.winnerId !== winnerId) {
      throw new BadRequestException(
        'WinnerId phải khớp với đội thắng luân lưu.',
      );
    }
    return winnerId;
  }

  private validateFootballPhaseTransition(
    match: Awaited<ReturnType<MatchesRepository['findById']>>,
    previousScoreDetails: unknown,
    nextScoreDetails: Record<string, unknown>,
  ) {
    const config = this.resolveMatchConfig(match);
    if (config.kind !== 'FOOTBALL') return;
    const previous =
      previousScoreDetails && typeof previousScoreDetails === 'object'
        ? (previousScoreDetails as Record<string, unknown>).football
        : undefined;
    const next = nextScoreDetails.football;
    if (
      !previous ||
      typeof previous !== 'object' ||
      !next ||
      typeof next !== 'object' ||
      Array.isArray(next)
    )
      return;

    const previousPhase = (previous as Record<string, unknown>).phase;
    const nextPhase = (next as Record<string, unknown>).phase;
    if (
      typeof previousPhase !== 'string' ||
      typeof nextPhase !== 'string' ||
      previousPhase === nextPhase
    )
      return;
    const phases = [
      'FIRST_HALF',
      'HALFTIME',
      'SECOND_HALF',
      'STOPPAGE_TIME',
      'FULL_TIME',
      'EXTRA_TIME_FIRST_HALF',
      'EXTRA_TIME_BREAK',
      'EXTRA_TIME_SECOND_HALF',
      'PENALTY_SHOOTOUT',
      'COMPLETED',
    ];
    const previousIndex = phases.indexOf(previousPhase);
    const nextIndex = phases.indexOf(nextPhase);
    if (previousIndex < 0 || nextIndex < 0 || nextIndex < previousIndex) {
      throw new BadRequestException(
        `football.phase không thể chuyển từ ${previousPhase} sang ${nextPhase}.`,
      );
    }
  }

  private validateBasicOverrideScoreDetails(
    scoreDetails: Record<string, unknown>,
  ) {
    const rawSets = scoreDetails.sets;
    if (!Array.isArray(rawSets)) {
      throw new BadRequestException(
        'Override score yêu cầu scoreDetails.sets là một mảng hợp lệ.',
      );
    }
    // Lite is free-form, but keep a bounded payload and sane integer scores.
    if (rawSets.length === 0 || rawSets.length > 99) {
      throw new BadRequestException(
        'Số set của giải Lite phải nằm trong khoảng từ 1 đến 99.',
      );
    }

    let p1SetsWon = 0;
    let p2SetsWon = 0;
    const lastSetIndex = rawSets.length - 1;

    rawSets.forEach((setValue, index) => {
      if (
        !setValue ||
        typeof setValue !== 'object' ||
        Array.isArray(setValue)
      ) {
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
        throw new BadRequestException(
          `set ${index + 1} có điểm số không hợp lệ.`,
        );
      }

      const isFinished = setRecord.isFinished !== false;
      if (!isFinished && index !== lastSetIndex) {
        throw new BadRequestException(
          `set ${index + 1} đang diễn ra nhưng không phải set cuối cùng.`,
        );
      }

      if (!isFinished) {
        return;
      }

      if (team1Score === team2Score) {
        throw new BadRequestException(
          `set ${index + 1} không được phép hòa khi chốt ngoại lệ.`,
        );
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
      existingScoreDetails &&
      typeof existingScoreDetails === 'object' &&
      !Array.isArray(existingScoreDetails)
        ? (existingScoreDetails as Record<string, unknown>)
        : {};
    const existingSets = Array.isArray(existingDetails.sets)
      ? existingDetails.sets
      : [];
    let overrideTargetIndex = -1;

    if (overrideReason) {
      scoreDetails.sets.forEach((setValue, index) => {
        if (
          !setValue ||
          typeof setValue !== 'object' ||
          Array.isArray(setValue)
        )
          return;

        const existingSet = existingSets[index];
        const wasFinished =
          existingSet &&
          typeof existingSet === 'object' &&
          !Array.isArray(existingSet)
            ? (existingSet as Record<string, unknown>).isFinished === true
            : false;
        if (
          (setValue as Record<string, unknown>).isFinished === true &&
          !wasFinished
        ) {
          overrideTargetIndex = index;
        }
      });
    }

    const hasPerSetOverride = existingSets.some((setValue) => {
      if (!setValue || typeof setValue !== 'object' || Array.isArray(setValue))
        return false;
      const setOverride = (setValue as Record<string, unknown>).scoreOverride;
      return (
        !!setOverride &&
        typeof setOverride === 'object' &&
        !Array.isArray(setOverride)
      );
    });
    const legacyOverride =
      !hasPerSetOverride &&
      existingDetails.scoreOverride &&
      typeof existingDetails.scoreOverride === 'object' &&
      !Array.isArray(existingDetails.scoreOverride) &&
      typeof (existingDetails.scoreOverride as Record<string, unknown>)
        .reason === 'string'
        ? existingDetails.scoreOverride
        : undefined;
    const legacyOverrideTargetIndex = legacyOverride
      ? existingSets.findLastIndex((setValue) => {
          if (
            !setValue ||
            typeof setValue !== 'object' ||
            Array.isArray(setValue)
          )
            return false;
          const setRecord = setValue as Record<string, unknown>;
          return setRecord.isFinished === true && !setRecord.scoreOverride;
        })
      : -1;

    const sets = scoreDetails.sets.map((setValue, index) => {
      if (!setValue || typeof setValue !== 'object' || Array.isArray(setValue))
        return setValue;

      const safeSet = { ...(setValue as Record<string, unknown>) };
      delete safeSet.scoreOverride;
      const existingSet = existingSets[index];
      const existingOverride =
        existingSet &&
        typeof existingSet === 'object' &&
        !Array.isArray(existingSet)
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

  async previewSchedulePlan(
    tournamentId: string,
    user: JwtPayload,
    dto: CreateSchedulePlanDto,
  ) {
    const tournament = await this.matchesRepository.findScheduleTournament(tournamentId);
    if (!tournament) throw new NotFoundException('Tournament not found');

    const isManager =
      this.isAdmin(user) ||
      tournament.createdBy === user.sub ||
      (await this.matchesRepository.isTournamentManager(tournamentId, user.sub));
    if (!isManager) throw new ForbiddenException('Không có quyền xếp lịch giải đấu này');

    const uniqueCourtIds = [...new Set(dto.courtIds)];
    if (uniqueCourtIds.length !== dto.courtIds.length) {
      throw new BadRequestException('Không được chọn trùng sân');
    }
    const courts = await this.matchesRepository.findScheduleCourts(
      tournamentId,
      uniqueCourtIds,
      dto.divisionId,
    );
    if (courts.length !== uniqueCourtIds.length) {
      throw new UnprocessableEntityException('Một hoặc nhiều sân không thuộc phạm vi giải hoặc đã bị vô hiệu hóa');
    }

    const durationMs = dto.durationMinutes * 60_000;
    const bufferMs = dto.bufferMinutes * 60_000;
    const requestedDay = dto.date.slice(0, 10);
    const dateWithTournamentTime = (source: Date | null, fallback: string) => {
      if (!source) return new Date(`${requestedDay}T${fallback}:00.000Z`);
      const hours = String(source.getUTCHours()).padStart(2, '0');
      const minutes = String(source.getUTCMinutes()).padStart(2, '0');
      return new Date(`${requestedDay}T${hours}:${minutes}:00.000Z`);
    };
    const windowStart = dto.operatingWindow
      ? new Date(dto.operatingWindow.start)
      : dateWithTournamentTime(tournament.startDate, '08:00');
    const windowEnd = dto.operatingWindow
      ? new Date(dto.operatingWindow.end)
      : dateWithTournamentTime(tournament.endDate, '22:00');
    if (!Number.isFinite(windowStart.getTime()) || !Number.isFinite(windowEnd.getTime()) || windowEnd <= windowStart) {
      throw new BadRequestException('Khung giờ xếp lịch không hợp lệ');
    }

    const allMatches = await this.matchesRepository.findAll({
      page: 1,
      limit: 500,
      tournamentId,
    });
    if (allMatches.meta.hasMore) {
      throw new UnprocessableEntityException('Phạm vi giải có quá nhiều trận cho một lần preview; hãy chọn một phân hạng');
    }
    const scopedMatches = dto.divisionId
      ? (await this.matchesRepository.findAll({
          page: 1,
          limit: 500,
          tournamentId,
          divisionId: dto.divisionId,
        })).data
      : allMatches.data;
    const scopeById = new Map(scopedMatches.map((match) => [match.id, match]));
    const selectedMatches = dto.matchIds
      ? dto.matchIds.map((matchId) => scopeById.get(matchId))
      : scopedMatches;
    if (dto.matchIds && selectedMatches.some((match) => !match)) {
      throw new UnprocessableEntityException('Một hoặc nhiều trận không thuộc phân hạng hoặc giải đấu này');
    }

    type Interval = { start: number; end: number; participantIds: string[] };
    const busyByCourt = new Map<string, Interval[]>();
    const busyByParticipant = new Map<string, Interval[]>();
    const addBusy = (courtId: string, interval: Interval) => {
      const list = busyByCourt.get(courtId) || [];
      list.push(interval);
      busyByCourt.set(courtId, list);
      for (const participantId of interval.participantIds) {
        const participantList = busyByParticipant.get(participantId) || [];
        participantList.push(interval);
        busyByParticipant.set(participantId, participantList);
      }
    };
    for (const match of allMatches.data) {
      if (!match.courtId || !match.scheduledAt || !['SCHEDULED', 'ONGOING'].includes(match.status)) continue;
      const start = new Date(match.scheduledAt).getTime();
      if (!Number.isFinite(start)) continue;
      const end = start + durationMs + bufferMs;
      if (end <= windowStart.getTime() || start >= windowEnd.getTime()) continue;
      addBusy(match.courtId, {
        start,
        end,
        participantIds: [match.participant1Id, match.participant2Id].filter(
          (value): value is string => Boolean(value),
        ),
      });
    }

    const overlaps = (start: number, end: number, interval: Interval) =>
      start < interval.end && end > interval.start;
    const assignments: Array<{ matchId: string; courtId: string; scheduledAt: string }> = [];
    const skipped: Array<{ matchId: string; reason: string }> = [];
    const eligible = selectedMatches.filter((match): match is NonNullable<typeof match> => Boolean(match));
    eligible.sort((a, b) =>
      a.roundNumber - b.roundNumber ||
      (a.leg ?? 0) - (b.leg ?? 0) ||
      a.matchOrder - b.matchOrder ||
      a.id.localeCompare(b.id),
    );

    for (const match of eligible) {
      if (match.isBye) {
        skipped.push({ matchId: match.id, reason: 'BYE' });
        continue;
      }
      if (!match.participant1Id || !match.participant2Id) {
        skipped.push({ matchId: match.id, reason: 'TBD_OR_DEPENDENCY_BLOCKED' });
        continue;
      }
      if (['COMPLETED', 'CANCELLED', 'DISPUTED', 'ONGOING'].includes(match.status)) {
        skipped.push({ matchId: match.id, reason: 'TERMINAL_OR_ONGOING' });
        continue;
      }
      if (match.scheduledAt || match.courtId) {
        skipped.push({ matchId: match.id, reason: 'ALREADY_SCHEDULED' });
        continue;
      }

      let best: { courtId: string; start: number } | null = null;
      for (const court of courts) {
        let candidateStart = windowStart.getTime();
        const participantIds = [match.participant1Id, match.participant2Id];
        while (candidateStart + durationMs + bufferMs <= windowEnd.getTime()) {
          const candidateEnd = candidateStart + durationMs + bufferMs;
          const courtConflict = (busyByCourt.get(court.id) || []).find((interval) => overlaps(candidateStart, candidateEnd, interval));
          const participantConflict = participantIds
            .flatMap((participantId) => busyByParticipant.get(participantId) || [])
            .find((interval) => overlaps(candidateStart, candidateEnd, interval));
          if (!courtConflict && !participantConflict) break;
          candidateStart = Math.max(courtConflict?.end || 0, participantConflict?.end || 0, candidateStart + bufferMs);
        }
        if (candidateStart + durationMs + bufferMs <= windowEnd.getTime() && (!best || candidateStart < best.start)) {
          best = { courtId: court.id, start: candidateStart };
        }
      }
      if (!best) {
        skipped.push({ matchId: match.id, reason: 'NO_AVAILABLE_SLOT' });
        continue;
      }
      const interval = {
        start: best.start,
        end: best.start + durationMs + bufferMs,
        participantIds: [match.participant1Id, match.participant2Id],
      };
      addBusy(best.courtId, interval);
      assignments.push({
        matchId: match.id,
        courtId: best.courtId,
        scheduledAt: new Date(best.start).toISOString(),
      });
    }

    const scheduleVersion = [
      tournament.updatedAt.toISOString(),
      ...allMatches.data.map((match) => `${match.id}:${match.revision ?? 0}:${match.updatedAt}`).sort(),
    ].join('|');
    return {
      statusCode: 200,
      message: 'Schedule plan previewed',
      data: {
        planId: randomUUID(),
        strategy: SCHEDULE_PLAN_STRATEGY,
        scheduleVersion,
        durationMinutes: dto.durationMinutes,
        bufferMinutes: dto.bufferMinutes,
        operatingWindow: {
          start: windowStart.toISOString(),
          end: windowEnd.toISOString(),
        },
        assignments,
        skipped,
        conflicts: [],
        readiness: {
          eligibleCount: eligible.length,
          assignedCount: assignments.length,
          skippedCount: skipped.length,
          canApply: assignments.length > 0 && skipped.length === 0,
        },
      },
    };
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
        [
          'DRAFT',
          'PENDING_APPROVAL',
          'SUSPENDED',
          'CANCELLED',
          'PENDING_DELETE',
          'pending_delete',
        ].includes(t.status))
    ) {
      throw new NotFoundException('Match not found');
    }
    if (match.status === 'ONGOING') {
      try {
        const live = await this.redisService.hgetall(`match:live:${id}`);
        if (live && Object.keys(live).length > 0) {
          if (live.p1SetsWon !== undefined)
            match.p1SetsWon = Number(live.p1SetsWon);
          if (live.p2SetsWon !== undefined)
            match.p2SetsWon = Number(live.p2SetsWon);
          if (live.scoreDetails)
            match.scoreDetails = JSON.parse(live.scoreDetails);
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
      throw new BadRequestException(
        'Trận đấu đã kết thúc, không thể nhập điểm nữa.',
      );
    }

    if (existing.status !== 'ONGOING') {
      throw new BadRequestException(
        'Chỉ có thể nhập điểm khi trận đấu đang diễn ra. Hãy bắt đầu trận trước.',
      );
    }

    const isReferee = existing.refereeId === user.sub;
    const isTournamentManager = await this.isTournamentManager(existing, user);
    const acceptedReferee = await this.matchesRepository.isRefereeAccepted(
      existing.tournamentId,
      user.sub,
    );
    if (!isTournamentManager && !isReferee && !acceptedReferee) {
      throw new ForbiddenException(
        'Bạn không có quyền nhập điểm cho trận đấu này',
      );
    }

    if (!existing.participant1Id || !existing.participant2Id) {
      throw new BadRequestException(
        'Trận đấu chưa xác định đủ đối thủ, không thể nhập điểm.',
      );
    }

    let p1SetsWon = updateMatchScoreDto.p1SetsWon;
    let p2SetsWon = updateMatchScoreDto.p2SetsWon;
    let scoreDetails = updateMatchScoreDto.scoreDetails;
    let winnerId = updateMatchScoreDto.winnerId;
    const overrideReason = updateMatchScoreDto.overrideReason?.trim();
    const resolvedMatchConfig = this.resolveMatchConfig(existing);
    const isFootballMatch = resolvedMatchConfig.kind === 'FOOTBALL';
    let twoLegAggregate: ReturnType<typeof aggregateFootballTwoLegs> | null =
      null;

    // Football's p1/p2 fields are a derived 1-0/0-1 summary, not the goal
    // score. Requiring the typed football payload here prevents a caller from
    // finalizing a fixture with arbitrary set counters and losing the goals,
    // phase, events or shootout decision that drive standings/brackets.
    if (isFootballMatch) {
      const football = scoreDetails?.football;
      if (
        !football ||
        typeof football !== 'object' ||
        Array.isArray(football)
      ) {
        throw new BadRequestException(
          'Trận bóng đá bắt buộc phải gửi scoreDetails.football.',
        );
      }
    }

    if (scoreDetails) {
      scoreDetails = this.mergeTrustedSetOverrides(
        scoreDetails,
        existing.scoreDetails,
        overrideReason,
        user.sub,
      );
      this.validateFootballPhaseTransition(
        existing,
        existing.scoreDetails,
        scoreDetails,
      );
    }

    // 1. Validate score details if provided
    if (scoreDetails) {
      if (overrideReason) {
        // An override records an exceptional rule decision; it must never
        // bypass the sport validator. Football draws and shootouts are valid
        // domain outcomes and are therefore validated with football rules.
        const resolvedConfig = resolvedMatchConfig;
        const tournamentConfig = existing.tournament?.tournamentConfig as
          | Record<string, unknown>
          | undefined;
        const sportRules = existing.tournament?.sportRules as
          | Record<string, unknown>
          | undefined;
        const matchConfig = existing.matchConfig as
          | Record<string, unknown>
          | undefined;
        resolvedConfig.mode =
          (tournamentConfig?.mode as string | undefined) ||
          (sportRules?.mode as string | undefined) ||
          (matchConfig?.mode as string | undefined);
        const validation =
          resolvedConfig.kind === 'FOOTBALL'
            ? validateScoreDetails(scoreDetails, resolvedConfig)
            : this.validateBasicOverrideScoreDetails(scoreDetails);
        p1SetsWon = validation.p1SetsWon;
        p2SetsWon = validation.p2SetsWon;
        if (resolvedConfig.kind === 'FOOTBALL' && !winnerId) {
          const football = scoreDetails.football;
          if (
            football &&
            typeof football === 'object' &&
            !Array.isArray(football)
          ) {
            const goals1 = Number(football.team1Goals);
            const goals2 = Number(football.team2Goals);
            if (goals1 > goals2)
              winnerId = existing.participant1Id || undefined;
            if (goals2 > goals1)
              winnerId = existing.participant2Id || undefined;
          }
        }
      } else {
        // Resolve config hierarchy (Stage -> Round -> Match)
        const resolvedConfig = resolvedMatchConfig;
        const tournamentConfig = existing.tournament?.tournamentConfig as
          | Record<string, unknown>
          | undefined;
        const sportRules = existing.tournament?.sportRules as
          | Record<string, unknown>
          | undefined;
        const matchConfig = existing.matchConfig as
          | Record<string, unknown>
          | undefined;

        resolvedConfig.mode =
          (tournamentConfig?.mode as string | undefined) ||
          (sportRules?.mode as string | undefined) ||
          (matchConfig?.mode as string | undefined);
        const validation = validateScoreDetails(scoreDetails, resolvedConfig);
        p1SetsWon = validation.p1SetsWon;
        p2SetsWon = validation.p2SetsWon;

        // Suggest winner automatically
        if (p1SetsWon >= validation.setsToWin) {
          if (winnerId && winnerId !== existing.participant1Id) {
            throw new BadRequestException(
              'WinnerId không khớp với kết quả set thắng.',
            );
          }
          winnerId = existing.participant1Id || undefined;
        } else if (p2SetsWon >= validation.setsToWin) {
          if (winnerId && winnerId !== existing.participant2Id) {
            throw new BadRequestException(
              'WinnerId không khớp với kết quả set thắng.',
            );
          }
          winnerId = existing.participant2Id || undefined;
        }
      }
    }

    // Do not finalize a two-legged tie from the current-leg winner alone. If
    // the aggregate is level, keep the match editable until a valid shootout
    // is submitted; otherwise the repository would mark the leg complete but
    // leave the tie without an advancing participant.
    if (isFootballMatch && existing.tieId && existing.leg && scoreDetails) {
      const otherLeg = await this.matchesRepository.findCompletedTieLeg(
        existing.tieId,
        existing.id,
      );
      if (otherLeg) {
        const currentLeg = { ...existing, scoreDetails, status: 'COMPLETED' };
        const leg1 = existing.leg === 1 ? currentLeg : otherLeg;
        const leg2 = existing.leg === 2 ? currentLeg : otherLeg;
        twoLegAggregate = aggregateFootballTwoLegs(leg1, leg2);
        if (!twoLegAggregate.winnerId && winnerId) {
          const scorePayload = scoreDetails as Record<string, unknown>;
          const footballPayload = scorePayload.football as
            | Record<string, unknown>
            | undefined;
          const shootout = (scorePayload.shootout ??
            footballPayload?.shootout) as Record<string, unknown> | undefined;
          if (shootout?.winnerId) {
            winnerId = this.validateFootballShootout(existing, scoreDetails, {
              aggregateTie: true,
            });
          } else {
            winnerId = undefined;
          }
        }
      }
    }

    if (winnerId) {
      if (
        winnerId !== existing.participant1Id &&
        winnerId !== existing.participant2Id
      ) {
        throw new BadRequestException(
          'WinnerId không thuộc một trong hai participant của trận.',
        );
      }

      // Bóng đá knockout hòa → phân định bằng luân lưu: winner từ scoreDetails.shootout,
      // tỷ số chính vẫn hòa (2-2) nên bỏ qua check "winner phải có set cao hơn".
      const scorePayload = scoreDetails as Record<string, unknown> | null;
      const footballPayload = scorePayload?.football as
        | Record<string, unknown>
        | undefined;
      const shootout = (scorePayload?.shootout ?? footballPayload?.shootout) as
        | Record<string, unknown>
        | undefined;
      const isShootoutDecided = shootout?.winnerId === winnerId;

      if (shootout) {
        const shootoutWinner = this.validateFootballShootout(
          existing,
          scoreDetails,
          {
            aggregateTie: Boolean(twoLegAggregate && !twoLegAggregate.winnerId),
          },
        );
        if (shootout.winnerId !== shootoutWinner) {
          throw new BadRequestException(
            'WinnerId phải khớp với tỷ số luân lưu cao hơn.',
          );
        }
      }

      if (
        resolvedMatchConfig.mode !== 'LITE' &&
        !isShootoutDecided &&
        winnerId === existing.participant1Id &&
        p1SetsWon <= p2SetsWon
      ) {
        throw new BadRequestException(
          'Đội 1 chỉ có thể được chốt thắng khi số set/game thắng cao hơn.',
        );
      }

      if (
        resolvedMatchConfig.mode !== 'LITE' &&
        !isShootoutDecided &&
        winnerId === existing.participant2Id &&
        p2SetsWon <= p1SetsWon
      ) {
        throw new BadRequestException(
          'Đội 2 chỉ có thể được chốt thắng khi số set/game thắng cao hơn.',
        );
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
      return await this.finalizeCompletedMatch(
        existing,
        id,
        winnerId,
        user.sub,
        {
          p1SetsWon,
          p2SetsWon,
          scoreDetails: nextScoreDetails,
          expectedRevision: updateMatchScoreDto.expectedRevision,
        },
      );
    }

    const updatedMatch = await this.matchesRepository.updateScore(
      id,
      user.sub,
      {
        p1SetsWon,
        p2SetsWon,
        scoreDetails: nextScoreDetails,
        expectedRevision: updateMatchScoreDto.expectedRevision,
      },
    );

    // Optimistic-lock conflict (D3): another device wrote first → 409 + currentRevision.
    if (
      updatedMatch &&
      typeof updatedMatch === 'object' &&
      'conflict' in updatedMatch
    ) {
      const conflict = updatedMatch as unknown as {
        conflict: true;
        currentMatch: { revision: number };
      };
      throw new ConflictException({
        message:
          'Điểm đã thay đổi từ thiết bị khác. Vui lòng làm mới trước khi nhập tiếp.',
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
        if (p1SetsWon !== undefined)
          await this.redisService.hset(
            cacheKey,
            'p1SetsWon',
            String(p1SetsWon),
          );
        if (p2SetsWon !== undefined)
          await this.redisService.hset(
            cacheKey,
            'p2SetsWon',
            String(p2SetsWon),
          );
        if (nextScoreDetails)
          await this.redisService.hset(
            cacheKey,
            'scoreDetails',
            JSON.stringify(nextScoreDetails),
          );
        if (winnerId)
          await this.redisService.hset(cacheKey, 'winnerId', winnerId);

        // TTL 24 hours
        await this.redisService.getClient().expire(cacheKey, 86400);
      } catch (err) {
        console.error('Failed to cache live score to Redis:', err);
      }
    }

    // Broadcast score real-time
    this.liveScoreGateway.broadcastScoreUpdate(
      id,
      this.withBroadcastContext(updatedMatch, existing),
      existing.tournamentId,
    );

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
      throw new BadRequestException(
        'Trận đấu đã kết thúc, không thể đổi trạng thái nữa.',
      );
    }

    const nextStatus = updateMatchStatusDto.status;
    if (nextStatus === 'ONGOING' && existing.status !== 'SCHEDULED') {
      throw new BadRequestException(
        'A match must be scheduled before it can start.',
      );
    }
    if (nextStatus === 'COMPLETED' && existing.status !== 'ONGOING') {
      throw new BadRequestException(
        'A match must be ongoing before it can be completed.',
      );
    }
    if (nextStatus === 'SCHEDULED' && existing.status !== 'SCHEDULED') {
      throw new BadRequestException(
        'An ongoing match cannot return to scheduled.',
      );
    }

    const isReferee = existing.refereeId === user.sub;
    const isTournamentManager = await this.isTournamentManager(existing, user);
    const acceptedReferee = await this.matchesRepository.isRefereeAccepted(
      existing.tournamentId,
      user.sub,
    );
    if (!isTournamentManager && !isReferee && !acceptedReferee) {
      throw new ForbiddenException(
        'Bạn không có quyền thay đổi trạng thái trận đấu này',
      );
    }

    if (updateMatchStatusDto.status === 'ONGOING') {
      if (!existing.participant1Id || !existing.participant2Id) {
        throw new BadRequestException('Chưa đủ đối thủ để bắt đầu trận đấu.');
      }

      // A tournament referee starts from Live (Web/App), so the system records
      // the person who actually took the match. This is not organizer
      // assignment: only an accepted referee can claim an unassigned match,
      // and the repository's conditional update makes the claim race-safe.
      if (acceptedReferee && !existing.refereeId) {
        await this.matchesRepository.updateRefereeId(id, user.sub, user.sub);
      }
    }

    if (updateMatchStatusDto.status === 'COMPLETED') {
      if (existing.status === 'COMPLETED') {
        return existing;
      }

      // Football completion must be derived from the canonical goal payload;
      // never infer a result from the generic p1/p2 set summary.
      const resolvedConfig = this.resolveMatchConfig(existing);
      if (resolvedConfig.kind === 'FOOTBALL') {
        const scoreDetails = existing.scoreDetails as
          | Record<string, unknown>
          | null
          | undefined;
        const football = scoreDetails?.football as
          | Record<string, unknown>
          | undefined;
        const phase = football?.phase;
        const team1Goals = football?.team1Goals;
        const team2Goals = football?.team2Goals;
        const terminalPhase = [
          'FULL_TIME',
          'PENALTY_SHOOTOUT',
          'COMPLETED',
        ].includes(String(phase));
        if (
          !football ||
          !terminalPhase ||
          !Number.isInteger(team1Goals) ||
          !Number.isInteger(team2Goals) ||
          (team1Goals as number) < 0 ||
          (team2Goals as number) < 0
        ) {
          throw new BadRequestException(
            'Chỉ có thể chốt trận bóng đá sau khi có tỷ số hợp lệ ở trạng thái toàn thời gian.',
          );
        }

        const isRoundRobin = existing.stage?.type === 'ROUND_ROBIN';
        const tournamentConfig = existing.tournament?.tournamentConfig as
          | Record<string, unknown>
          | undefined;
        const isDraw = team1Goals === team2Goals;

        // A two-legged football tie is decided only after both legs. A draw
        // in leg 1 is a valid completed leg (no shootout yet); on leg 2 the
        // aggregate, not the individual leg score, decides whether a
        // shootout is required.
        const isTwoLegTie = Boolean(existing.tieId && existing.leg);
        if (isTwoLegTie) {
          const currentLeg = {
            ...existing,
            scoreDetails,
            status: 'COMPLETED',
          };
          const otherLeg = await this.matchesRepository.findCompletedTieLeg(
            existing.tieId!,
            existing.id,
          );

          const currentLegWinner = isDraw
            ? null
            : (team1Goals as number) > (team2Goals as number)
              ? existing.participant1Id
              : existing.participant2Id;

          if (!otherLeg) {
            return this.finalizeCompletedMatch(
              existing,
              id,
              currentLegWinner,
              user.sub,
            );
          }

          const leg1 = existing.leg === 1 ? currentLeg : otherLeg;
          const leg2 = existing.leg === 2 ? currentLeg : otherLeg;
          const aggregate = aggregateFootballTwoLegs(leg1, leg2);
          if (aggregate.winnerId) {
            return this.finalizeCompletedMatch(
              existing,
              id,
              currentLegWinner,
              user.sub,
            );
          }

          if (tournamentConfig?.penaltyShootout !== true) {
            throw new BadRequestException(
              'Tổng tỷ số hai lượt đang hòa; giải chưa bật luân lưu.',
            );
          }
          const shootoutWinner = this.validateFootballShootout(
            existing,
            scoreDetails,
            {
              aggregateTie: true,
            },
          );
          return this.finalizeCompletedMatch(
            existing,
            id,
            shootoutWinner,
            user.sub,
          );
        }

        if (isDraw) {
          if (isRoundRobin) {
            return this.finalizeCompletedMatch(existing, id, null, user.sub);
          }
          if (tournamentConfig?.penaltyShootout !== true) {
            throw new BadRequestException(
              'Trận bóng đá loại trực tiếp đang hòa; giải chưa bật luân lưu.',
            );
          }
          const shootoutWinner = this.validateFootballShootout(
            existing,
            scoreDetails,
          );
          return this.finalizeCompletedMatch(
            existing,
            id,
            shootoutWinner,
            user.sub,
          );
        }

        const winnerId =
          (team1Goals as number) > (team2Goals as number)
            ? existing.participant1Id
            : existing.participant2Id;
        if (!winnerId) {
          throw new BadRequestException(
            'Trận bóng đá chưa xác định đủ đội thắng.',
          );
        }
        return this.finalizeCompletedMatch(existing, id, winnerId, user.sub);
      }

      // Validate that we have a winner for non-football formats.
      let winnerId = existing.winnerId;
      if (!winnerId) {
        // Try to determine winner based on sets won
        const setsToWin = resolvedConfig.setsToWin;

        if (existing.p1SetsWon >= setsToWin) {
          winnerId = existing.participant1Id;
        } else if (existing.p2SetsWon >= setsToWin) {
          winnerId = existing.participant2Id;
        }
      }

      if (!winnerId) {
        throw new BadRequestException(
          'Chưa xác định được người chiến thắng. Vui lòng cập nhật tỉ số trước.',
        );
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
      this.liveScoreGateway.broadcastMatchStatus(
        id,
        this.withBroadcastContext(updatedMatch, existing),
        existing.tournamentId,
      );

      // Invalidate matches list cache
      try {
        await this.redisService.delByPattern('matches:list:*');
      } catch (err) {
        console.error('Failed to invalidate matches list cache:', err);
      }

      return updatedMatch;
    }
  }

  async operateMatch(id: string, user: JwtPayload, data: OperateMatchDto) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');
    if (existing.status === 'COMPLETED') {
      throw new BadRequestException(
        'Trận đấu đã kết thúc, không thể áp dụng quyết định lần nữa.',
      );
    }

    if (!(await this.isTournamentManager(existing, user))) {
      throw new ForbiddenException(
        'Bạn không có quyền áp dụng quyết định nghiệp vụ cho trận này',
      );
    }

    if (
      !MATCH_OPERATION_ACTIONS.includes(data.action as MatchOperationAction)
    ) {
      throw new BadRequestException('Hành động nghiệp vụ không hợp lệ.');
    }

    // A postponed fixture is returned to the scheduling queue. It must not
    // enter completion, standings, bracket advancement, or ELO processing.
    // An abandoned fixture is marked DISPUTED so a manager/admin must resolve
    // it before the tournament can advance; it likewise never creates a rank
    // result by itself.
    if (data.action === 'POSTPONE' || data.action === 'ABANDON') {
      if (data.action === 'POSTPONE' && existing.status !== 'SCHEDULED') {
        throw new BadRequestException(
          'Chỉ có thể hoãn trận chưa bắt đầu. Trận đang diễn ra cần xử lý bỏ trận hoặc chốt kết quả.',
        );
      }
      if (
        data.action === 'ABANDON' &&
        existing.status !== 'SCHEDULED' &&
        existing.status !== 'ONGOING'
      ) {
        throw new BadRequestException(
          'Chỉ có thể bỏ trận khi trận đang chờ hoặc đang diễn ra.',
        );
      }

      const currentScoreDetails =
        existing.scoreDetails && typeof existing.scoreDetails === 'object'
          ? (existing.scoreDetails as Record<string, unknown>)
          : {};
      const specialResult = {
        action: data.action,
        reason: data.reason.trim(),
        decidedAt: new Date().toISOString(),
        decidedBy: user.sub,
        ...(data.action === 'POSTPONE'
          ? { requiresReschedule: true }
          : { requiresResolution: true }),
      };
      const updated = await this.matchesRepository.recordNonFinalOperation(
        id,
        user.sub,
        {
          status: data.action === 'POSTPONE' ? 'SCHEDULED' : 'DISPUTED',
          scoreDetails:
            data.action === 'POSTPONE'
              ? { specialResult }
              : { ...currentScoreDetails, specialResult },
          ...(data.action === 'POSTPONE' ? { p1SetsWon: 0, p2SetsWon: 0 } : {}),
          scheduledAt: null,
          startedAt: null,
          winnerId: null,
        },
      );
      if (!updated) {
        throw new NotFoundException(
          'Không tìm thấy trận sau khi ghi quyết định.',
        );
      }

      this.liveScoreGateway.broadcastMatchStatus(
        id,
        this.withBroadcastContext(updated, existing),
        existing.tournamentId,
      );
      this.liveScoreGateway.broadcastScoreUpdate(
        id,
        this.withBroadcastContext(updated, existing),
        existing.tournamentId,
      );
      try {
        const participantIds = [
          existing.participant1Id,
          existing.participant2Id,
        ].filter((participantId): participantId is string =>
          Boolean(participantId),
        );
        if (participantIds.length > 0) {
          const rosters =
            await this.matchesRepository.getRostersForParticipants(
              participantIds,
            );
          for (const roster of rosters) {
            await this.notificationsService.sendNotification(
              data.action === 'POSTPONE'
                ? buildMatchScheduledNotification({
                    matchId: id,
                    receiverId: roster.userId,
                    tournamentId: existing.tournamentId,
                    tournamentName: existing.tournament?.name || 'giải đấu',
                    scheduledTime: 'chưa xác định',
                    court: 'Chưa xếp sân',
                    divisionId:
                      existing.participant1?.tournamentDivisionId ||
                      existing.participant2?.tournamentDivisionId ||
                      undefined,
                    bracketBranch: existing.bracketBranch,
                    roundNumber: existing.roundNumber,
                  })
                : {
                    receiverId: roster.userId,
                    type: 'MATCH_DISPUTED',
                    title: 'Trận đấu cần được xử lý',
                    content: `Trận đấu trong giải ${existing.tournament?.name || 'giải đấu'} đã bị bỏ và đang chờ BTC phân xử.`,
                    redirectUrl: `/tournaments/${existing.tournamentId}`,
                  },
            );
          }
        }
      } catch (err) {
        console.error('Failed to send match operation notifications:', err);
      }
      try {
        await this.redisService.del(`match:live:${id}`);
        await this.redisService.delByPattern('matches:list:*');
      } catch (err) {
        console.error('Failed to invalidate match operation cache:', err);
      }

      return updated;
    }

    const winnerId = this.resolveOperationalWinner(existing, data.winnerId);
    const isParticipant1Winner = winnerId === existing.participant1Id;
    const resolvedConfig = this.resolveMatchConfig(existing);

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

    const isFootball = resolvedConfig.kind === 'FOOTBALL';
    const usesFootballForfeitScore =
      isFootball &&
      ['WALKOVER', 'NO_SHOW', 'DISQUALIFICATION'].includes(data.action);
    const currentFootball =
      currentScoreDetails.football &&
      typeof currentScoreDetails.football === 'object' &&
      !Array.isArray(currentScoreDetails.football)
        ? (currentScoreDetails.football as Record<string, unknown>)
        : {};
    const footballForfeitGoals = usesFootballForfeitScore
      ? this.resolveFootballForfeitGoals(existing)
      : null;

    let scoreDetails: Record<string, unknown> = {
      ...currentScoreDetails,
      ...(usesFootballForfeitScore
        ? {
            football: {
              ...currentFootball,
              team1Goals: isParticipant1Winner ? footballForfeitGoals : 0,
              team2Goals: isParticipant1Winner ? 0 : footballForfeitGoals,
              phase: 'COMPLETED',
            },
          }
        : {}),
      specialResult,
    };

    let nextP1SetsWon = isParticipant1Winner
      ? Math.max(existing.p1SetsWon, resolvedConfig.setsToWin)
      : 0;
    let nextP2SetsWon = isParticipant1Winner
      ? 0
      : Math.max(existing.p2SetsWon, resolvedConfig.setsToWin);

    // Operational football decisions must retain a canonical goal payload.
    // WALKOVER/NO_SHOW/DISQUALIFICATION synthesize the configured score above;
    // RETIREMENT/OVERRIDE_RESULT must validate the score already recorded by
    // the live scorer instead of finalizing with generic set counters. Mark
    // the retained regulation score terminal so standings/brackets consume a
    // completed football snapshot consistently.
    if (isFootball && !usesFootballForfeitScore) {
      if (
        !currentFootball ||
        typeof currentFootball.team1Goals !== 'number' ||
        typeof currentFootball.team2Goals !== 'number'
      ) {
        throw new BadRequestException(
          'Quyết định bóng đá này cần scoreDetails.football hợp lệ trước khi chốt trận.',
        );
      }
      scoreDetails = {
        ...scoreDetails,
        football: {
          ...currentFootball,
          phase: 'COMPLETED',
        },
      };
      const validation = validateScoreDetails(scoreDetails, resolvedConfig);
      nextP1SetsWon = validation.p1SetsWon;
      nextP2SetsWon = validation.p2SetsWon;
    }

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

    const userId = user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Bạn cần đăng nhập để bình luận');
    }

    const comment = await this.matchesRepository.createComment(
      id,
      userId,
      createMatchCommentDto.commentText.trim(),
    );

    this.liveScoreGateway.broadcastComment(id, comment);

    return comment;
  }

  async updateSchedule(
    id: string,
    user: JwtPayload,
    data: {
      courtId?: string;
      courtName?: string;
      courtAddress?: string;
      refereeId?: string;
      scheduledAt?: string;
      matchConfig?: Record<string, unknown>;
    },
  ) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    // Object-level authorization: tournament manager or admin only.
    if (!(await this.isTournamentManager(existing, user))) {
      throw new ForbiddenException(
        'Bạn không có quyền chỉnh lịch thi đấu của giải này',
      );
    }

    if (data.courtId) {
      const allowedCourt =
        await this.matchesRepository.findAllowedCourtForMatch(
          existing,
          data.courtId,
        );
      if (!allowedCourt) {
        throw new BadRequestException(
          'Sân được chọn không thuộc địa điểm thi đấu của giải này hoặc đang không hoạt động.',
        );
      }
    }

    if (data.refereeId) {
      const isAccepted = await this.matchesRepository.isRefereeAccepted(
        existing.tournamentId,
        data.refereeId,
      );
      if (!isAccepted) {
        throw new BadRequestException(
          'Trọng tài được chọn chưa xác nhận tham gia giải đấu này (status ACCEPTED)',
        );
      }
    }

    if (data.matchConfig) {
      const expectedKind = resolveEffectiveSportRules({
        tournamentSportRules: existing.tournament?.sportRules as
          | Record<string, unknown>
          | null
          | undefined,
        categoryName: existing.tournament?.categoryName,
        categorySlug: existing.tournament?.categorySlug,
        stageRoundConfig: existing.stage?.roundConfig as
          | Record<string, unknown>
          | null
          | undefined,
        groupConfig: existing.group?.roundConfig as
          | Record<string, unknown>
          | null
          | undefined,
        roundNumber: existing.roundNumber,
      }).kind;

      validateSportRuleConfig(data.matchConfig, {
        expectedKind,
        sourceLabel: 'matchConfig',
        allowRoundMetadata: true,
      });
    }

    const updatedMatch = await this.matchesRepository.updateSchedule(
      id,
      user.sub,
      data,
    );
    if (updatedMatch) {
      this.liveScoreGateway.broadcastScoreUpdate(
        id,
        this.withBroadcastContext(updatedMatch, existing),
        existing.tournamentId,
      );
    }

    if (data.refereeId && data.refereeId !== existing.refereeId) {
      try {
        const matchName = `${existing.participant1?.teamName || 'TBD'} vs ${existing.participant2?.teamName || 'TBD'}`;
        const scheduledTime = data.scheduledAt
          ? new Date(data.scheduledAt).toLocaleString('vi-VN')
          : existing.scheduledAt
            ? new Date(existing.scheduledAt).toLocaleString('vi-VN')
            : 'chưa xác định';

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

    // Compare the persisted before/after values rather than truthy request
    // fields. Clearing a court or time is a real schedule change and must
    // notify participants just like assigning one.
    const toIsoOrNull = (value: Date | string | null | undefined) =>
      value ? new Date(value).toISOString() : null;
    const isScheduleChanged =
      Boolean(updatedMatch) &&
      (toIsoOrNull(updatedMatch?.scheduledAt) !==
        toIsoOrNull(existing.scheduledAt) ||
        (updatedMatch?.courtName ?? null) !== (existing.courtName ?? null) ||
        (updatedMatch?.courtAddress ?? null) !==
          (existing.courtAddress ?? null));

    if (isScheduleChanged) {
      try {
        const participantIds: string[] = [];
        if (existing.participant1Id)
          participantIds.push(existing.participant1Id);
        if (existing.participant2Id)
          participantIds.push(existing.participant2Id);

        if (participantIds.length > 0) {
          const rosters =
            await this.matchesRepository.getRostersForParticipants(
              participantIds,
            );

          const scheduledTime = updatedMatch?.scheduledAt
            ? new Date(updatedMatch.scheduledAt).toLocaleString('vi-VN')
            : 'chưa xác định';
          const court = updatedMatch?.courtName || 'Chưa xếp sân';

          for (const roster of rosters) {
            await this.notificationsService.sendNotification(
              buildMatchScheduledNotification({
                matchId: id,
                receiverId: roster.userId,
                tournamentId: existing.tournamentId,
                tournamentName: existing.tournament?.name || 'giải đấu',
                scheduledTime,
                court,
                divisionId:
                  existing.participant1?.tournamentDivisionId ||
                  existing.participant2?.tournamentDivisionId ||
                  undefined,
                bracketBranch: existing.bracketBranch,
                roundNumber: existing.roundNumber,
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

    if (!(await this.isTournamentManager(existing, user))) {
      throw new ForbiddenException(
        'Bạn không có quyền phân công trọng tài cho trận đấu này',
      );
    }

    if (refereeId) {
      const isAccepted = await this.matchesRepository.isRefereeAccepted(
        existing.tournamentId,
        refereeId,
      );
      if (!isAccepted) {
        throw new BadRequestException(
          'Trọng tài được chọn chưa xác nhận tham gia giải đấu này (status ACCEPTED)',
        );
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
      throw new ForbiddenException(
        'Bạn không có quyền quản lý bình luận trận đấu này',
      );
    }

    await this.matchesRepository.muteUser(
      id,
      targetUserId,
      type,
      reason ?? null,
      user.sub,
    );
    this.liveScoreGateway.broadcastComment(id, {
      type: 'MUTE_UPDATE',
      userId: targetUserId,
      action: type,
    });

    return {
      message:
        type === 'BAN' ? 'Đã cấm người dùng này' : 'Đã mute người dùng này',
    };
  }

  async unmuteUser(id: string, targetUserId: string, user: JwtPayload) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    // Object-level authorization: admin or tournament creator only (NOTE-4)
    const isCreator = existing.tournament?.createdBy === user.sub;
    const isAdmin = this.isAdmin(user);
    if (!isAdmin && !isCreator) {
      throw new ForbiddenException(
        'Bạn không có quyền quản lý bình luận trận đấu này',
      );
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
      throw new ForbiddenException(
        'Bạn không có quyền xem danh sách người dùng bị hạn chế',
      );
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
