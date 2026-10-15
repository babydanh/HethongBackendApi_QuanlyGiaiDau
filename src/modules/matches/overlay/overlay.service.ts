import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RedisService } from '../../../providers/redis/redis.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { MatchesRepository } from '../matches.repository';
import {
  OverlayRepository,
  type OverlayMatchContext,
  type OverlayMatchRow,
} from './overlay.repository';
import { buildOverlayContent } from './overlay-view';
import type {
  OverlayContent,
  OverlayExpectedMembers,
  OverlayMatchInput,
  OverlayPayload,
} from './overlay.types';

const CACHE_TTL_SECONDS = 3;
const SINGLE_ELIMINATION = 'SINGLE_ELIMINATION';
const DOUBLES_TYPES = new Set(['DOUBLES', 'MIXED_DOUBLES']);

const cacheKey = (matchId: string): string => `match:overlay:${matchId}`;

function pickMatchRow(context: OverlayMatchContext): OverlayMatchRow {
  return {
    id: context.id,
    stageId: context.stageId,
    participant1Id: context.participant1Id,
    participant2Id: context.participant2Id,
    winnerId: context.winnerId,
    status: context.status,
    isBye: context.isBye,
    p1SetsWon: context.p1SetsWon,
    p2SetsWon: context.p2SetsWon,
    roundNumber: context.roundNumber,
    matchOrder: context.matchOrder,
    nextMatchId: context.nextMatchId,
    bracketBranch: context.bracketBranch,
  };
}

@Injectable()
export class OverlayService {
  private readonly logger = new Logger(OverlayService.name);

  constructor(
    private readonly overlayRepository: OverlayRepository,
    private readonly matchesRepository: MatchesRepository,
    private readonly redisService: RedisService,
  ) {}

  /**
   * View-model overlay của một trận. Quyền xem giống `GET /matches/:id`; không tồn tại hoặc
   * không được xem đều trả 404 như nhau. Hai cờ hiện/ẩn luôn lấy mới, chỉ phần nội dung được cache.
   */
  async getOverlay(matchId: string, user?: JwtPayload): Promise<OverlayPayload> {
    const context = await this.overlayRepository.findContext(matchId);
    if (!context) throw new NotFoundException('Match not found');

    const systemRoles = [
      ...(user?.roles ?? []),
      ...(user?.role ? [user.role] : []),
    ];
    const canAccess = await this.matchesRepository.canAccessLiveMatch(
      matchId,
      user?.sub,
      systemRoles,
    );
    if (!canAccess) throw new NotFoundException('Match not found');

    const content =
      (await this.readCache(matchId)) ?? (await this.buildContent(context));
    return {
      h2hVisible: context.h2hOverlayVisible,
      bracketVisible: context.bracketOverlayVisible,
      ...content,
    };
  }

  private async buildContent(
    context: OverlayMatchContext,
  ): Promise<OverlayContent> {
    const isSingleElimination = context.stageType === SINGLE_ELIMINATION;
    const mainRows = isSingleElimination
      ? await this.overlayRepository.findStageMainMatches(context.stageId)
      : [];
    const currentRow = pickMatchRow(context);
    const mainIds = new Set(mainRows.map((row) => row.id));
    const rows = mainIds.has(currentRow.id)
      ? mainRows
      : [...mainRows, currentRow];

    const liveRows = await Promise.all(rows.map((row) => this.withLiveScore(row)));
    const participantIds = [
      ...new Set(
        liveRows.flatMap((row) =>
          [row.participant1Id, row.participant2Id].filter(
            (id): id is string => id !== null,
          ),
        ),
      ),
    ];
    const participants =
      await this.overlayRepository.findParticipants(participantIds);

    const toInput = (row: OverlayMatchRow): OverlayMatchInput => ({
      id: row.id,
      roundNumber: row.roundNumber,
      matchOrder: row.matchOrder,
      nextMatchId: row.nextMatchId,
      winnerId: row.winnerId,
      status: row.status,
      isBye: row.isBye,
      p1SetsWon: row.p1SetsWon,
      p2SetsWon: row.p2SetsWon,
      participant1: row.participant1Id
        ? (participants.get(row.participant1Id) ?? null)
        : null,
      participant2: row.participant2Id
        ? (participants.get(row.participant2Id) ?? null)
        : null,
    });
    const inputs = liveRows.map(toInput);
    const current = inputs.find((input) => input.id === context.id);
    if (!current) throw new NotFoundException('Match not found');

    const matchType = context.divisionMatchType ?? context.tournamentMatchType;
    const expectedMembers: OverlayExpectedMembers = DOUBLES_TYPES.has(matchType)
      ? 2
      : 1;

    const content = buildOverlayContent({
      current,
      branch: context.bracketBranch,
      stageType: context.stageType,
      stageMatches: inputs.filter((input) => mainIds.has(input.id)),
      tournamentName: context.tournamentName,
      sportName: context.categoryName ?? '',
      expectedMembers,
    });
    await this.writeCache(context.id, content);
    return content;
  }

  /** Trận đang đánh lấy điểm mới nhất từ Redis, giống cách `GET /matches/:id` làm. */
  private async withLiveScore(row: OverlayMatchRow): Promise<OverlayMatchRow> {
    if (row.status !== 'ONGOING') return row;
    try {
      const live = await this.redisService.hgetall(`match:live:${row.id}`);
      if (!live || Object.keys(live).length === 0) return row;
      return {
        ...row,
        p1SetsWon:
          live.p1SetsWon !== undefined ? Number(live.p1SetsWon) : row.p1SetsWon,
        p2SetsWon:
          live.p2SetsWon !== undefined ? Number(live.p2SetsWon) : row.p2SetsWon,
        winnerId: live.winnerId ? live.winnerId : row.winnerId,
      };
    } catch (error) {
      this.logger.warn(`Không đọc được điểm live của trận ${row.id}: ${String(error)}`);
      return row;
    }
  }

  private async readCache(matchId: string): Promise<OverlayContent | null> {
    try {
      const raw = await this.redisService.get(cacheKey(matchId));
      return raw ? (JSON.parse(raw) as OverlayContent) : null;
    } catch {
      return null;
    }
  }

  private async writeCache(
    matchId: string,
    content: OverlayContent,
  ): Promise<void> {
    try {
      await this.redisService.set(
        cacheKey(matchId),
        JSON.stringify(content),
        CACHE_TTL_SECONDS,
      );
    } catch {
      // Redis lỗi: bỏ qua cache, vẫn trả kết quả.
    }
  }
}
