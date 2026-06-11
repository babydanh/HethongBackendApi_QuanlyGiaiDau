import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { SeriesRepository } from './series.repository';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';
import { QuerySeriesDto } from './dto/query-series.dto';
import { CreateLegDto, LinkEventDto } from './dto/leg.dto';
import { ExclusionRuleException } from './exceptions/exclusion-rule.exception';

export interface PsrPointConfig {
  pointsByRank: Record<number, number>;
  directEntryThreshold: number;
  wildcardCount: number;
  exclusionRule: boolean;
  exclusionScope: 'CATEGORY' | 'ALL';
  description: string;
}

@Injectable()
export class SeriesService {
  constructor(private readonly seriesRepository: SeriesRepository) {}

  // ─── Series CRUD ──────────────────────────────────────────────

  async create(userId: string, data: CreateSeriesDto) {
    return this.seriesRepository.create(userId, data);
  }

  async update(id: string, userId: string, data: UpdateSeriesDto, roles: string[]) {
    const existing = await this.seriesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy chuỗi giải đấu.');
    }

    const isAuthorized = roles.includes('ADMIN') || existing.organizerId === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa chuỗi giải đấu này.');
    }

    return this.seriesRepository.update(id, data);
  }

  async remove(id: string, userId: string, roles: string[]) {
    const existing = await this.seriesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy chuỗi giải đấu.');
    }

    const isAuthorized = roles.includes('ADMIN') || existing.organizerId === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền xóa chuỗi giải đấu này.');
    }

    return this.seriesRepository.softDelete(id);
  }

  async findOne(idOrSlug: string) {
    // Check if UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let result;
    if (uuidRegex.test(idOrSlug)) {
      const series = await this.seriesRepository.findById(idOrSlug);
      if (series) {
        result = { series };
      }
    } else {
      result = await this.seriesRepository.findBySlug(idOrSlug);
    }

    if (!result) {
      throw new NotFoundException('Không tìm thấy chuỗi giải đấu.');
    }

    // Load legs as well
    const legs = await this.seriesRepository.findLegsBySeriesId(result.series.id);
    return {
      ...result,
      legs,
    };
  }

  async findAll(query: QuerySeriesDto) {
    return this.seriesRepository.findAll(query);
  }

  // ─── Leg Operations ───────────────────────────────────────────

  async createLeg(seriesId: string, userId: string, data: CreateLegDto, roles: string[]) {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) {
      throw new NotFoundException('Không tìm thấy chuỗi giải đấu.');
    }

    const isAuthorized = roles.includes('ADMIN') || series.organizerId === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền thêm chặng vào chuỗi giải đấu này.');
    }

    return this.seriesRepository.createLeg(seriesId, data);
  }

  async updateLeg(seriesId: string, legId: string, userId: string, data: Partial<CreateLegDto> & { status?: 'UPCOMING' | 'ONGOING' | 'COMPLETED' }, roles: string[]) {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) {
      throw new NotFoundException('Không tìm thấy chuỗi giải đấu.');
    }

    const isAuthorized = roles.includes('ADMIN') || series.organizerId === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền cập nhật chặng thuộc chuỗi giải đấu này.');
    }

    const leg = await this.seriesRepository.findLegById(legId);
    if (!leg || leg.seriesId !== seriesId) {
      throw new NotFoundException('Không tìm thấy chặng đấu trong chuỗi này.');
    }

    return this.seriesRepository.updateLeg(legId, data);
  }

  async deleteLeg(seriesId: string, legId: string, userId: string, roles: string[]) {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) {
      throw new NotFoundException('Không tìm thấy chuỗi giải đấu.');
    }

    const isAuthorized = roles.includes('ADMIN') || series.organizerId === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền xóa chặng thuộc chuỗi giải đấu này.');
    }

    const leg = await this.seriesRepository.findLegById(legId);
    if (!leg || leg.seriesId !== seriesId) {
      throw new NotFoundException('Không tìm thấy chặng đấu trong chuỗi này.');
    }

    return this.seriesRepository.deleteLeg(legId);
  }

  async findLegs(seriesId: string) {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) {
      throw new NotFoundException('Không tìm thấy chuỗi giải đấu.');
    }
    return this.seriesRepository.findLegsBySeriesId(seriesId);
  }

  // ─── Event Operations ─────────────────────────────────────────

  async linkTournament(seriesId: string, legId: string, userId: string, data: LinkEventDto, roles: string[]) {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) {
      throw new NotFoundException('Không tìm thấy chuỗi giải đấu.');
    }

    const isAuthorized = roles.includes('ADMIN') || series.organizerId === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền liên kết giải đấu vào chuỗi này.');
    }

    const leg = await this.seriesRepository.findLegById(legId);
    if (!leg || leg.seriesId !== seriesId) {
      throw new NotFoundException('Không tìm thấy chặng đấu trong chuỗi này.');
    }

    // Check if tournament already linked
    const existingLink = await this.seriesRepository.findEventByTournamentId(data.tournamentId);
    if (existingLink) {
      throw new BadRequestException('Giải đấu đã được liên kết với một chuỗi giải khác.');
    }

    return this.seriesRepository.linkTournament(legId, data);
  }

  async unlinkTournament(seriesId: string, eventId: string, userId: string, roles: string[]) {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) {
      throw new NotFoundException('Không tìm thấy chuỗi giải đấu.');
    }

    const isAuthorized = roles.includes('ADMIN') || series.organizerId === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền hủy liên kết giải đấu khỏi chuỗi này.');
    }

    return this.seriesRepository.unlinkTournament(eventId);
  }

  async findEvents(legId: string) {
    return this.seriesRepository.findEventsByLegId(legId);
  }

  // ─── Standings ────────────────────────────────────────────────

  async getStandings(seriesId: string, query: { legId: string; categoryId?: string; limit?: number; page?: number }) {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) {
      throw new NotFoundException('Không tìm thấy chuỗi giải đấu.');
    }
    return this.seriesRepository.getStandings(query.legId, query.categoryId, query.limit, query.page);
  }

  // ─── PSR Computation ──────────────────────────────────────────

  async computePsrForTournament(tournamentId: string): Promise<void> {
    const eventInfo = await this.seriesRepository.findEventByTournamentId(tournamentId);
    if (!eventInfo) {
      // Standalone tournament, do nothing
      return;
    }

    const { event, leg, series, tournament } = eventInfo;
    const rules = (leg.rulesOverride || series.rules) as PsrPointConfig;
    if (!rules || !rules.pointsByRank) {
      return;
    }

    const rankings = await this.seriesRepository.getTournamentRosterRankings(tournamentId);
    if (rankings.length === 0) {
      return;
    }

    const pointsByRank = rules.pointsByRank;
    const directEntryThreshold = rules.directEntryThreshold || 2;
    const exclusionRule = rules.exclusionRule ?? true;

    // Sort keys descending to search rank brackets
    const sortedRankKeys = Object.keys(pointsByRank)
      .map(Number)
      .sort((a, b) => b - a);

    for (const ranking of rankings) {
      const { userId, participantId, rank } = ranking;

      // Find or create standing
      let standing = await this.seriesRepository.getStandingForUser(leg.id, userId, tournament.categoryId);
      if (!standing) {
        standing = await this.seriesRepository.createStanding(leg.id, userId, tournament.categoryId);
      }

      // If already locked out by exclusion rule, skip giving points or processing
      if (standing.lockedOut) {
        continue;
      }

      // Find points mapping
      let basePoints = 0;
      for (const k of sortedRankKeys) {
        if (rank >= k) {
          basePoints = pointsByRank[k];
          break;
        }
      }

      const multiplier = event.pointMultiplier || 1.0;
      const totalPoints = Math.round(basePoints * multiplier);
      const isDirectEntry = rank <= directEntryThreshold;

      // Update standing total points, events played, best rank, directEntry, lockout status
      await this.seriesRepository.updateStandingPoints(
        standing.id,
        totalPoints,
        rank,
        isDirectEntry,
        isDirectEntry ? event.id : null,
      );

      // Log point log entry
      await this.seriesRepository.createPointLog(
        standing.id,
        event.id,
        participantId,
        rank,
        basePoints,
        multiplier,
        totalPoints,
        isDirectEntry,
      );
    }
  }
}
