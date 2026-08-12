import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { SeriesRepository } from './series.repository';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';
import { QuerySeriesDto } from './dto/query-series.dto';
import { CreateLegDto, LinkEventDto } from './dto/leg.dto';
import { ExclusionRuleException } from './exceptions/exclusion-rule.exception';
import { eq, and, desc } from 'drizzle-orm';
import * as schema from '../../database/schema';

import { PsrPointConfig } from './interfaces/psr-point-config.interface';

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

  async getStandings(seriesId: string, query: { legId: string; categoryId?: string; limit?: number; page?: number; cursor?: string }) {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) {
      throw new NotFoundException('Không tìm thấy chuỗi giải đấu.');
    }
    return this.seriesRepository.getStandings(query.legId, query.categoryId, query.limit, query.page, query.cursor);
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
      if (!ranking.isWalkover) {
        for (const k of sortedRankKeys) {
          if (rank >= k) {
            basePoints = pointsByRank[k];
            break;
          }
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

  async resetSeason(seriesId: string, userId: string, userRoles: string[]) {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) {
      throw new NotFoundException('Series not found');
    }

    const isOwner = series.organizerId === userId;
    const isAdmin = userRoles.includes('ADMIN');
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You do not have permission to reset this series season.');
    }

    await this.seriesRepository.resetSeason(seriesId);
    return { success: true, message: 'Season reset successfully.' };
  }

  async inviteStaff(
    seriesId: string,
    userId: string,
    inviteeEmailOrPhone: string,
    role: 'CO_ORGANIZER' | 'REFEREE' | 'CLERK',
    userRoles: string[]
  ) {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) {
      throw new NotFoundException('Không tìm thấy chuỗi giải đấu.');
    }

    const isAuthorized = userRoles.includes('ADMIN') || series.organizerId === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền mời nhân sự cho chuỗi giải đấu này.');
    }

    const user = await this.seriesRepository.findUserByEmailOrPhone(inviteeEmailOrPhone);
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người chơi với email hoặc số điện thoại này.');
    }

    const email = user.email || null;
    const phone = null;

    const managers = await this.seriesRepository.findManagers(seriesId);
    if (managers.some((m) => m.manager.userId === user.id)) {
      throw new BadRequestException('Người dùng này đã là quản trị viên hoặc nhân sự của chuỗi giải đấu.');
    }

    const invitations = await this.seriesRepository.findInvitations(seriesId);
    if (
      invitations.some(
        (inv) =>
          inv.status === 'PENDING' &&
          ((email && inv.email === email) || (phone && inv.phone === phone))
      )
    ) {
      throw new BadRequestException('Đã có một lời mời đang chờ xử lý dành cho người dùng này.');
    }

    return this.seriesRepository.createInvitation(seriesId, email, phone, role);
  }

  async listInvitations(seriesId: string, userId: string, userRoles: string[]) {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) {
      throw new NotFoundException('Không tìm thấy chuỗi giải đấu.');
    }

    const isAuthorized = userRoles.includes('ADMIN') || series.organizerId === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền xem danh sách lời mời của chuỗi giải đấu này.');
    }

    return this.seriesRepository.findInvitations(seriesId);
  }

  async acceptInvitation(
    invitationId: string,
    currentUser: { email?: string; phoneNumber?: string; sub?: string; id?: string },
  ) {
    const invitation = await this.seriesRepository.findInvitationById(invitationId);
    if (!invitation) {
      throw new NotFoundException('Không tìm thấy lời mời.');
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('Lời mời này đã được xử lý hoặc không còn hiệu lực.');
    }

    const matchesEmail = invitation.email && currentUser.email === invitation.email;
    const matchesPhone = invitation.phone && currentUser.phoneNumber === invitation.phone;
    if (!matchesEmail && !matchesPhone) {
      throw new ForbiddenException('Tài khoản của bạn không khớp với thông tin trên lời mời.');
    }

    const currentUserId = currentUser.sub || currentUser.id;
    if (!currentUserId) {
      throw new ForbiddenException('Không tìm thấy thông tin định danh người dùng.');
    }

    const db = this.seriesRepository.getDbInstance();
    return await db.transaction(async (tx) => {
      await tx
        .update(schema.seriesInvitations)
        .set({ status: 'ACCEPTED' })
        .where(eq(schema.seriesInvitations.id, invitationId));

      const [manager] = await tx
        .insert(schema.seriesManagers)
        .values({
          seriesId: invitation.seriesId,
          userId: currentUserId,
          role: invitation.role,
        })
        .returning();

      return manager;
    });
  }

  async rejectInvitation(
    invitationId: string,
    currentUser: { email?: string; phoneNumber?: string; sub?: string; id?: string },
  ) {
    const invitation = await this.seriesRepository.findInvitationById(invitationId);
    if (!invitation) {
      throw new NotFoundException('Không tìm thấy lời mời.');
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('Lời mời này đã được xử lý hoặc không còn hiệu lực.');
    }

    const matchesEmail = invitation.email && currentUser.email === invitation.email;
    const matchesPhone = invitation.phone && currentUser.phoneNumber === invitation.phone;
    if (!matchesEmail && !matchesPhone) {
      throw new ForbiddenException('Tài khoản của bạn không khớp với thông tin trên lời mời.');
    }

    return this.seriesRepository.updateInvitationStatus(invitationId, 'REJECTED');
  }

  async revokeManager(seriesId: string, managerUserId: string, userId: string, userRoles: string[]) {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) {
      throw new NotFoundException('Không tìm thấy chuỗi giải đấu.');
    }

    const isAuthorized = userRoles.includes('ADMIN') || series.organizerId === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền thu hồi nhân sự của chuỗi giải đấu này.');
    }

    if (series.organizerId === managerUserId) {
      throw new BadRequestException('Không thể thu hồi quyền của Chủ sở hữu chuỗi giải đấu.');
    }

    return this.seriesRepository.removeManager(seriesId, managerUserId);
  }

  async listManagers(seriesId: string) {
    const series = await this.seriesRepository.findById(seriesId);
    if (!series) {
      throw new NotFoundException('Không tìm thấy chuỗi giải đấu.');
    }

    return this.seriesRepository.findManagers(seriesId);
  }

  async calculateTourFinalsQualifiers(seriesId: string, legId: string, categoryId: string) {
    const leg = await this.seriesRepository.findLegById(legId);
    if (!leg || leg.seriesId !== seriesId) {
      throw new NotFoundException('Không tìm thấy chặng đấu trong chuỗi này.');
    }

    const series = await this.seriesRepository.findById(seriesId);
    if (!series) {
      throw new NotFoundException('Không tìm thấy chuỗi giải đấu.');
    }

    const rules = (leg.rulesOverride || series.rules) as PsrPointConfig;
    const minStagesRequired = rules.minStagesRequired || 1;

    const db = this.seriesRepository.getDbInstance();
    const standings = await db
      .select({
        standing: schema.seriesStandings,
        user: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
          email: schema.users.email,
        }
      })
      .from(schema.seriesStandings)
      .innerJoin(schema.users, eq(schema.seriesStandings.userId, schema.users.id))
      .innerJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(
        and(
          eq(schema.seriesStandings.legId, legId),
          eq(schema.seriesStandings.categoryId, categoryId)
        )
      )
      .orderBy(desc(schema.seriesStandings.totalPsrPoints));

    const events = await this.seriesRepository.findEventsByLegId(legId);
    const directEntryThreshold = rules?.directEntryThreshold || 2;
    const totalEventDirectSlots = events.length * directEntryThreshold;

    const validDirectQualifiers = standings.filter(
      (s) => s.standing.directEntry && s.standing.eventsPlayed >= minStagesRequired
    );

    const actualDirectQualifiersCount = validDirectQualifiers.length;
    const unusedSlots = Math.max(0, totalEventDirectSlots - actualDirectQualifiersCount);
    const finalWildcardSlots = leg.wildcardSlots + unusedSlots;

    const wildcardQualifiers = standings
      .filter((s) => !s.standing.directEntry && s.standing.eventsPlayed >= minStagesRequired)
      .slice(0, finalWildcardSlots);

    return {
      directQualifiers: validDirectQualifiers,
      wildcardQualifiers,
      rollDownDetails: {
        totalEventDirectSlots,
        actualDirectQualifiers: actualDirectQualifiersCount,
        unusedSlots,
        initialWildcardSlots: leg.wildcardSlots,
        finalWildcardSlots,
      }
    };
  }
}
