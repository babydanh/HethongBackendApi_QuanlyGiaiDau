import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { TournamentsRepository } from './tournaments.repository';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { RegisterTournamentDto } from './dto/register-tournament.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { CreateParentTournamentDto } from './dto/create-parent-tournament.dto';
import { UpdateParentTournamentDto } from './dto/update-parent-tournament.dto';
import { BracketGeneratorService } from './bracket-generator.service';
import { CategoryConfig, TournamentConfig } from './interfaces/tournament-config.interface';
import { EloCapViolationException } from './exceptions/elo-cap-violation.exception';
import * as schema from '../../database/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CreateDivisionDto } from './dto/create-division.dto';
import { UpdateDivisionDto } from './dto/update-division.dto';

@Injectable()
export class TournamentsService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly bracketGeneratorService: BracketGeneratorService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private mapTournamentFormat<T extends { format?: string | null; tournamentConfig?: unknown }>(tournament: T): T {
    if (
      tournament &&
      tournament.tournamentConfig &&
      typeof tournament.tournamentConfig === 'object' &&
      'bracketType' in tournament.tournamentConfig &&
      typeof (tournament.tournamentConfig as Record<string, unknown>).bracketType === 'string'
    ) {
      tournament.format = (tournament.tournamentConfig as Record<string, unknown>).bracketType as string;
    }
    return tournament;
  }

  async findAll(query: QueryTournamentDto) {
    const result = await this.tournamentsRepository.findAll(query);
    result.data = result.data.map(t => this.mapTournamentFormat(t));
    return result;
  }

  async findPublic(query: QueryTournamentDto) {
    const result = await this.tournamentsRepository.findAll({
      ...query,
      tournamentType: 'PUBLIC',
    });
    result.data = result.data
      .filter((t) => t.status !== 'DRAFT' && t.status !== 'CANCELLED')
      .map(t => this.mapTournamentFormat(t));
    return result;
  }

  async findMy(userId: string) {
    const result = await this.tournamentsRepository.findMyTournaments(userId);
    return result.map(t => this.mapTournamentFormat(t));
  }

  async findOne(id: string, userId?: string | null, inviteCode?: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (tournament.visibility === 'PRIVATE') {
      const isOwner = userId && tournament.createdBy === userId;
      const isInviteMatch = inviteCode && tournament.inviteCode === inviteCode;
      if (!isOwner && !isInviteMatch) {
        throw new ForbiddenException('Giải đấu này yêu cầu mã mời');
      }
    }

    return this.mapTournamentFormat(tournament);
  }

  async create(userId: string, createTournamentDto: CreateTournamentDto, systemRoles: string[] = []) {
    // 1. Validate category existence and sportRules default fallback
    const category = await this.tournamentsRepository.findCategory(createTournamentDto.categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (!createTournamentDto.sportRules) {
      const config = category.categoryConfig as CategoryConfig;
      if (config && config.defaultSportRules) {
        createTournamentDto.sportRules = config.defaultSportRules as unknown as Record<string, unknown>;
      } else {
        createTournamentDto.sportRules = {};
      }
    }

    // 2. Validate dates
    if (createTournamentDto.registrationStartDate && createTournamentDto.registrationEndDate) {
      const regStart = new Date(createTournamentDto.registrationStartDate);
      const regEnd = new Date(createTournamentDto.registrationEndDate);
      if (regEnd <= regStart) {
        throw new BadRequestException('Registration end date must be after registration start date');
      }
    }
    if (createTournamentDto.startDate && createTournamentDto.endDate) {
      const tStart = new Date(createTournamentDto.startDate);
      const tEnd = new Date(createTournamentDto.endDate);
      if (tEnd <= tStart) {
        throw new BadRequestException('Tournament end date must be after start date');
      }
    }
    if (createTournamentDto.registrationEndDate && createTournamentDto.startDate) {
      const regEnd = new Date(createTournamentDto.registrationEndDate);
      const tStart = new Date(createTournamentDto.startDate);
      if (tStart < regEnd) {
        throw new BadRequestException('Tournament start date must be after or equal to registration end date');
      }
    }

    // 3. CLUB vs PUBLIC validation rules & authorization
    const isSystemAuthorized = systemRoles.includes('ADMIN') || systemRoles.includes('ORGANIZER');
    const isChildTournament = !!createTournamentDto.parentId;

    if (createTournamentDto.tournamentType === 'CLUB') {
      if (!createTournamentDto.communityId) {
        throw new BadRequestException('Club tournaments must belong to a community');
      }
      if (createTournamentDto.entryFee && createTournamentDto.entryFee > 0) {
        throw new BadRequestException('Club tournaments must be free');
      }
      if (createTournamentDto.galleryImages && createTournamentDto.galleryImages.length > 0) {
        throw new BadRequestException('Club tournaments cannot have gallery images at creation');
      }

      // Authorization for club tournament creation: System Admin/Organizer OR community Owner/Admin/Moderator
      if (!isSystemAuthorized) {
        const member = await this.tournamentsRepository.findCommunityMember(
          createTournamentDto.communityId,
          userId,
        );
        if (
          !member ||
          !['OWNER', 'ADMIN', 'MODERATOR'].includes(member.role) ||
          member.status !== 'JOINED'
        ) {
          throw new ForbiddenException(
            'Bạn phải là Quản trị viên hoặc Điều hành viên của câu lạc bộ mới có thể tạo giải đấu nội bộ.'
          );
        }
      }
    } else {
      // PUBLIC tournament
      if (createTournamentDto.entryFee && createTournamentDto.entryFee > 0 && createTournamentDto.entryFee < 100000) {
        throw new BadRequestException('Minimum entry fee for paid public tournaments is 100,000đ');
      }
      // Only require ORGANIZER role for parent/standalone tournaments, not for child tournaments
      if (!isSystemAuthorized && !isChildTournament) {
        throw new ForbiddenException('Bạn cần có quyền Ban tổ chức để tạo giải đấu công khai.');
      }
    }

    // 4. Validate duplicate division if parentId exists
    if (createTournamentDto.parentId) {
      const siblings = await this.tournamentsRepository.findByParentId(createTournamentDto.parentId);
      const isDuplicate = siblings.some((div) => div.matchType === createTournamentDto.matchType);
      if (isDuplicate) {
        throw new BadRequestException('Hình thức thi đấu này đã tồn tại trong giải đấu');
      }
    }

    const record = await this.tournamentsRepository.create(userId, createTournamentDto);
    return this.mapTournamentFormat(record);
  }

  async update(id: string, userId: string, updateTournamentDto: UpdateTournamentDto, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Tournament not found');

    // System ADMIN can update anything
    let canUpdate = systemRoles.includes('ADMIN');

    // Creator can update
    if (!canUpdate && existing.createdBy === userId) {
      canUpdate = true;
    }

    // Community OWNER/MODERATOR can update
    if (!canUpdate && existing.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        existing.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        canUpdate = true;
      }
    }

    if (!canUpdate) {
      throw new ForbiddenException('You do not have permission to update this tournament');
    }

    // Validations during update based on tournament lifecycle status
    if (existing.status !== 'DRAFT') {
      const lockedCoreFields: (keyof UpdateTournamentDto)[] = [
        'matchType', 'categoryId', 'entryFee', 'platformFeePercentage', 'isRanked'
      ];
      for (const field of lockedCoreFields) {
        if (updateTournamentDto[field] !== undefined && updateTournamentDto[field] !== (existing as Record<string, unknown>)[field]) {
          throw new BadRequestException(`Cannot modify core field '${field}' after tournament is published`);
        }
      }
      // Check tournamentConfig core fields
      if (updateTournamentDto.tournamentConfig) {
        const existingConfig = (existing.tournamentConfig || {}) as Record<string, unknown>;
        const incomingConfig = updateTournamentDto.tournamentConfig as Record<string, unknown>;
        const configCoreFields = ['bracketType', 'minElo', 'maxElo', 'maxCombinedElo', 'maxTeammateGap'];
        for (const key of configCoreFields) {
          if (incomingConfig[key] !== undefined && incomingConfig[key] !== existingConfig[key]) {
            throw new BadRequestException(`Cannot modify tournament configuration key '${key}' after tournament is published`);
          }
        }
      }
    }

    if (existing.status === 'IN_PROGRESS' || existing.status === 'COMPLETED') {
      const unsafeFields: (keyof UpdateTournamentDto)[] = [
        'matchType', 'maxParticipants', 'categoryId', 'tournamentConfig', 
        'entryFee', 'platformFeePercentage', 'registrationStartDate', 'registrationEndDate',
        'sportRules', 'isRanked'
      ];
      for (const field of unsafeFields) {
        if (updateTournamentDto[field] !== undefined && updateTournamentDto[field] !== (existing as Record<string, unknown>)[field]) {
          throw new BadRequestException(`Cannot modify field '${field}' when tournament is in progress or completed`);
        }
      }
    }

    const regStartVal = updateTournamentDto.registrationStartDate !== undefined
      ? (updateTournamentDto.registrationStartDate ? new Date(updateTournamentDto.registrationStartDate) : null)
      : (existing.registrationStartDate ? new Date(existing.registrationStartDate) : null);

    const regEndVal = updateTournamentDto.registrationEndDate !== undefined
      ? (updateTournamentDto.registrationEndDate ? new Date(updateTournamentDto.registrationEndDate) : null)
      : (existing.registrationEndDate ? new Date(existing.registrationEndDate) : null);

    if (regStartVal && regEndVal && regEndVal <= regStartVal) {
      throw new BadRequestException('Registration end date must be after registration start date');
    }

    const tStartVal = updateTournamentDto.startDate !== undefined
      ? (updateTournamentDto.startDate ? new Date(updateTournamentDto.startDate) : null)
      : (existing.startDate ? new Date(existing.startDate) : null);

    const tEndVal = updateTournamentDto.endDate !== undefined
      ? (updateTournamentDto.endDate ? new Date(updateTournamentDto.endDate) : null)
      : (existing.endDate ? new Date(existing.endDate) : null);

    if (tStartVal && tEndVal && tEndVal <= tStartVal) {
      throw new BadRequestException('Tournament end date must be after start date');
    }

    if (updateTournamentDto.entryFee && existing.tournamentType === 'CLUB' && updateTournamentDto.entryFee > 0) {
      throw new BadRequestException('Club tournaments must remain free');
    }

    if (updateTournamentDto.entryFee && existing.tournamentType === 'PUBLIC' && updateTournamentDto.entryFee > 0 && updateTournamentDto.entryFee < 100000) {
      throw new BadRequestException('Minimum entry fee for paid public tournaments is 100,000đ');
    }

    const updated = await this.tournamentsRepository.update(id, userId, updateTournamentDto);

    if (existing.parentId) {
      const siblings = await this.tournamentsRepository.findByParentId(existing.parentId);
      const sharedFields: Record<string, unknown> = {};
      const fieldsToCheck = [
        'categoryId', 'description', 'bannerUrl', 'logoUrl',
        'prizeDescription', 'contactInfo', 'visibility', 'venueId', 'city',
        'startDate', 'endDate', 'registrationStartDate', 'registrationEndDate',
        'entryFee', 'platformFeePercentage'
      ];
      for (const field of fieldsToCheck) {
        if (updateTournamentDto[field] !== undefined) {
          sharedFields[field] = updateTournamentDto[field];
        }
      }
      if (Object.keys(sharedFields).length > 0) {
        for (const sibling of siblings) {
          if (sibling.id !== id) {
            await this.tournamentsRepository.update(sibling.id, userId, sharedFields);
          }
        }
      }
    }

    return this.mapTournamentFormat(updated);
  }

  async remove(id: string, userId: string, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Tournament not found');

    if (existing.parentId) {
      const siblings = await this.tournamentsRepository.findByParentId(existing.parentId);
      if (siblings.length <= 1) {
        throw new BadRequestException(
          'Không thể xóa hình thức thi đấu cuối cùng của giải đấu. Nếu muốn xóa toàn bộ giải đấu, vui lòng xóa Giải đấu lớn.'
        );
      }
    }

    // Bypass status check for developer testing convenience
    // if (existing.status !== 'DRAFT') {
    //   throw new BadRequestException('Chỉ cho phép xóa giải đấu ở trạng thái nháp (DRAFT).');
    // }

    // System ADMIN can delete
    if (systemRoles.includes('ADMIN')) {
      return this.tournamentsRepository.softDelete(id, userId);
    }

    // Creator can delete
    if (existing.createdBy === userId) {
      return this.tournamentsRepository.softDelete(id, userId);
    }

    // Community OWNER can delete
    if (existing.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        existing.communityId,
        userId,
      );
      if (member && member.role === 'OWNER') {
        return this.tournamentsRepository.softDelete(id, userId);
      }
    }

    throw new ForbiddenException('You do not have permission to delete this tournament');
  }

  async removeParent(id: string, userId: string, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findParentById(id);
    if (!existing) throw new NotFoundException('Parent tournament not found');

    // System ADMIN or creator can delete parent tournament
    const canDelete = systemRoles.includes('ADMIN') || existing.createdBy === userId;
    if (!canDelete) {
      throw new ForbiddenException('You do not have permission to delete this parent tournament');
    }

    return this.tournamentsRepository.softDeleteParent(id, userId);
  }

  async generateBracket(id: string, userId: string, systemRoles: string[] = [], divisionId?: string) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Tournament not found');

    if (existing.status === 'IN_PROGRESS' || existing.status === 'COMPLETED') {
      throw new BadRequestException('Cannot regenerate bracket for an ongoing or completed tournament');
    }

    // After REGISTRATION_CLOSED, only allow reset bracket once
    if (existing.status === 'REGISTRATION_CLOSED' || existing.status === 'UPCOMING') {
      try {
        const bracket = await this.tournamentsRepository.findBracket(id, divisionId);
        if (bracket && bracket.stages && bracket.stages.length > 0) {
          throw new BadRequestException('Bracket for this division has been locked. Cannot regenerate after registration closed.');
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        // If bracket query fails, allow reset (no existing bracket)
      }
    }

    let isAuthorized = systemRoles.includes('ADMIN') ||
                       systemRoles.includes('ORGANIZER') ||
                       existing.createdBy === userId;

    if (!isAuthorized && existing.parentId) {
      const parent = await this.tournamentsRepository.findParentById(existing.parentId);
      if (parent && parent.createdBy === userId) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized && existing.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        existing.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        isAuthorized = true;
      }
    }

    let division: typeof schema.tournamentDivisions.$inferSelect | undefined;
    if (divisionId) {
      const divisions = await this.tournamentsRepository.getDivisionsByTournament(id);
      division = divisions.find((item) => item.id === divisionId);
      if (!division) {
        throw new NotFoundException('Division not found for this tournament');
      }
    }

    const config = (existing.tournamentConfig || {}) as Record<string, unknown>;
    const bracketType = division?.bracketType || (config.bracketType as string) || 'SINGLE_ELIMINATION';

    if (bracketType === 'DOUBLE_ELIMINATION') {
      return this.bracketGeneratorService.generateDoubleElimination(id, userId, divisionId);
    } else if (bracketType === 'ROUND_ROBIN') {
      return this.bracketGeneratorService.generateRoundRobin(id, userId, divisionId);
    } else {
      return this.bracketGeneratorService.generateSingleElimination(id, userId, divisionId);
    }
  }

  private async validateEloLimits(
    tournament: typeof schema.tournaments.$inferSelect,
    userIds: string[],
  ): Promise<void> {
    const config = tournament.tournamentConfig as TournamentConfig;
    if (!config) return;

    const minElo = config.minElo !== undefined && config.minElo !== null ? Number(config.minElo) : null;
    const maxElo = config.maxElo !== undefined && config.maxElo !== null ? Number(config.maxElo) : null;
    const maxCombinedElo = config.maxCombinedElo !== undefined && config.maxCombinedElo !== null ? Number(config.maxCombinedElo) : null;
    const maxTeammateGap = config.maxTeammateGap !== undefined && config.maxTeammateGap !== null ? Number(config.maxTeammateGap) : null;

    if (minElo === null && maxElo === null && maxCombinedElo === null && maxTeammateGap === null) {
      return;
    }

    const elos: number[] = [];
    for (const uId of userIds) {
      const elo = await this.tournamentsRepository.getUserElo(uId, tournament.categoryId, tournament.matchType);
      elos.push(elo);
    }

    for (let i = 0; i < userIds.length; i++) {
      const elo = elos[i];
      if (minElo !== null && elo < minElo) {
        throw new EloCapViolationException(
          `Điểm ELO của bạn (${elo}) thấp hơn mức tối thiểu cho phép (${minElo}) của giải đấu này.`
        );
      }
      if (maxElo !== null && elo > maxElo) {
        throw new EloCapViolationException(
          `Điểm ELO của bạn (${elo}) vượt quá giới hạn tối đa cho phép (${maxElo}) của giải đấu này.`
        );
      }
    }

    if (elos.length === 2) {
      const sumElo = elos[0] + elos[1];
      if (maxCombinedElo !== null && sumElo > maxCombinedElo) {
        throw new EloCapViolationException(
          `Tổng điểm ELO của cả đội (${sumElo}) vượt quá giới hạn tối đa cho phép (${maxCombinedElo}) của giải đấu này.`
        );
      }

      const gap = Math.abs(elos[0] - elos[1]);
      if (maxTeammateGap !== null && gap > maxTeammateGap) {
        throw new EloCapViolationException(
          `Chênh lệch điểm ELO giữa hai đồng đội (${gap}) vượt quá mức chênh lệch tối đa cho phép (${maxTeammateGap}).`
        );
      }
    }
  }

  private async validateProfileComplete(userId: string): Promise<void> {
    const profile = await this.tournamentsRepository.findUserProfile(userId);
    if (!profile?.fullName || !profile.phoneNumber || !profile.gender) {
      throw new BadRequestException('Vui lòng cập nhật đầy đủ họ tên, số điện thoại và giới tính trước khi đăng ký giải đấu.');
    }
  }

  async register(id: string, userId: string, registerTournamentDto: RegisterTournamentDto, inviteCode?: string) {
    await this.validateProfileComplete(userId);

    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new BadRequestException('Tournament registration is closed');
    }

    if (tournament.registrationEndDate && new Date() > new Date(tournament.registrationEndDate)) {
      throw new BadRequestException('Hạn đăng ký giải đấu đã kết thúc');
    }

    if (tournament.isRegistrationLocked) {
      throw new BadRequestException('Đăng ký giải đấu đã tạm thời bị khóa bởi Ban tổ chức');
    }

    const userIds = [userId];
    if (registerTournamentDto.partnerEmailOrPhone) {
      const partnerUser = await this.tournamentsRepository.findUserByEmailOrPhone(registerTournamentDto.partnerEmailOrPhone);
      if (partnerUser) {
        userIds.push(partnerUser.id);
      }
    }

    await this.validateEloLimits(tournament, userIds);

    const result = await this.tournamentsRepository.registerParticipant(id, userId, registerTournamentDto, inviteCode);

    try {
      const canceledLeaders = await this.tournamentsRepository.cancelPendingRegistrationsIfFull(id);
      for (const leaderId of canceledLeaders) {
        await this.notificationsService.sendNotification({
          receiverId: leaderId,
          type: 'TOURNAMENT_KICKED',
          title: 'Hủy đăng ký do giải đấu đã đầy',
          content: `Đơn đăng ký Đôi của bạn đã bị hủy vì giải đấu đã đạt số lượng slot tối đa.`,
          redirectUrl: `/tournaments/${id}`,
        });
      }
    } catch (err) {
      console.error('Failed to cancel pending registrations on full:', err);
    }

    return result;
  }

  async joinTeam(tournamentId: string, userId: string, participantId: string, teamInviteToken: string) {
    // Đồng đội cũng phải có hồ sơ đầy đủ trước khi join team
    await this.validateProfileComplete(userId);

    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new BadRequestException('Tournament registration is closed');
    }

    if (tournament.registrationEndDate && new Date() > new Date(tournament.registrationEndDate)) {
      throw new BadRequestException('Hạn đăng ký giải đấu đã kết thúc');
    }

    if (tournament.isRegistrationLocked) {
      throw new BadRequestException('Đăng ký giải đấu đã tạm thời bị khóa bởi Ban tổ chức');
    }

    const leaderRoster = await this.tournamentsRepository.findLeaderByParticipantId(participantId);
    const userIds = [userId];
    if (leaderRoster) {
      userIds.push(leaderRoster.userId);
    }

    await this.validateEloLimits(tournament, userIds);

    const result = await this.tournamentsRepository.joinTeam(tournamentId, userId, participantId, teamInviteToken);

    try {
      const canceledLeaders = await this.tournamentsRepository.cancelPendingRegistrationsIfFull(tournamentId);
      for (const leaderId of canceledLeaders) {
        await this.notificationsService.sendNotification({
          receiverId: leaderId,
          type: 'TOURNAMENT_KICKED',
          title: 'Hủy đăng ký do giải đấu đã đầy',
          content: `Đơn đăng ký Đôi của bạn đã bị hủy vì giải đấu đã đạt số lượng slot tối đa.`,
          redirectUrl: `/tournaments/${tournamentId}`,
        });
      }
    } catch (err) {
      console.error('Failed to cancel pending registrations on full:', err);
    }

    return result;
  }

  async withdraw(tournamentId: string, userId: string) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Tournament not found');

    const now = new Date();
    if (
      tournament.status !== 'REGISTRATION_OPEN' ||
      (tournament.registrationEndDate && now > new Date(tournament.registrationEndDate))
    ) {
      throw new BadRequestException('Hạn đăng ký đã qua hoặc danh sách đã chốt, không thể tự hủy đăng ký.');
    }

    return this.tournamentsRepository.withdraw(tournamentId, userId);
  }

  async myRegistration(tournamentId: string, userId: string) {
    return this.tournamentsRepository.myRegistration(tournamentId, userId);
  }

  async findParticipants(id: string, divisionId?: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    return this.tournamentsRepository.findParticipants(id, tournament.categoryId, divisionId);
  }

  async findBracket(id: string, divisionId?: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    if (divisionId) {
      const divisions = await this.tournamentsRepository.getDivisionsByTournament(id);
      const exists = divisions.some((division) => division.id === divisionId);
      if (!exists) {
        throw new NotFoundException('Division not found for this tournament');
      }
    }
    return this.tournamentsRepository.findBracket(id, divisionId);
  }

  async findByInviteCode(inviteCode: string) {
    const tournament = await this.tournamentsRepository.findByInviteCode(inviteCode);
    if (!tournament) {
      throw new NotFoundException('Tournament not found for this invite code');
    }
    return this.mapTournamentFormat(tournament);
  }

  async joinByInviteCode(inviteCode: string, userId: string, registerTournamentDto: RegisterTournamentDto) {
    // Bắt buộc điền đầy đủ hồ sơ trước khi đăng ký qua link mời
    await this.validateProfileComplete(userId);

    const tournament = await this.tournamentsRepository.findByInviteCode(inviteCode);
    if (!tournament) {
      throw new NotFoundException('Tournament not found for this invite code');
    }

    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new BadRequestException('Tournament registration is closed');
    }

    if (tournament.registrationEndDate && new Date() > new Date(tournament.registrationEndDate)) {
      throw new BadRequestException('Hạn đăng ký giải đấu đã kết thúc');
    }

    if (tournament.isRegistrationLocked) {
      throw new BadRequestException('Đăng ký giải đấu đã tạm thời bị khóa bởi Ban tổ chức');
    }

    const userIds = [userId];
    if (registerTournamentDto.partnerEmailOrPhone) {
      const partnerUser = await this.tournamentsRepository.findUserByEmailOrPhone(registerTournamentDto.partnerEmailOrPhone);
      if (partnerUser) {
        userIds.push(partnerUser.id);
      }
    }

    await this.validateEloLimits(tournament, userIds);

    return this.tournamentsRepository.registerParticipant(tournament.id, userId, registerTournamentDto);
  }

  async regenerateInviteCode(id: string, userId: string, systemRoles: string[] = []) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    // Check authorization: Admin or Creator
    const isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to regenerate invite code');
    }

    const updated = await this.tournamentsRepository.regenerateInviteCode(id, userId);
    return this.mapTournamentFormat(updated);
  }

  async getGallery(id: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    if (tournament.tournamentType !== 'PUBLIC') {
      throw new BadRequestException('Gallery is only available for public tournaments');
    }
    return tournament.galleryImages || [];
  }

  async addGalleryImage(id: string, userId: string, url: string, systemRoles: string[] = []) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    if (tournament.tournamentType !== 'PUBLIC') {
      throw new BadRequestException('Gallery is only available for public tournaments');
    }

    const isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to add gallery image');
    }

    const galleryImages = [...(tournament.galleryImages || []), url];
    const updated = await this.tournamentsRepository.update(id, userId, { galleryImages });
    return this.mapTournamentFormat(updated);
  }

  async removeGalleryImage(id: string, userId: string, index: number, systemRoles: string[] = []) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    if (tournament.tournamentType !== 'PUBLIC') {
      throw new BadRequestException('Gallery is only available for public tournaments');
    }

    const isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to remove gallery image');
    }

    const currentImages = tournament.galleryImages || [];
    if (index < 0 || index >= currentImages.length) {
      throw new BadRequestException('Invalid gallery image index');
    }

    const galleryImages = currentImages.filter((_, idx) => idx !== index);
    const updated = await this.tournamentsRepository.update(id, userId, { galleryImages });
    return this.mapTournamentFormat(updated);
  }

  async publish(id: string, userId: string, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Tournament not found');

    let isAuthorized = systemRoles.includes('ADMIN') || existing.createdBy === userId;

    if (!isAuthorized && existing.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        existing.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to publish this tournament');
    }

    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Tournament is not in DRAFT status');
    }

    if (existing.entryFee === undefined || existing.entryFee === null) {
      throw new BadRequestException('Vui lòng cấu hình lệ phí tham gia trước khi công bố giải đấu.');
    }

    const publishFee = await this.getPublishFee(existing.tournamentType, existing.isRanked);
    if (publishFee > 0) {
      throw new BadRequestException(`Vui lòng thanh toán phí công bố giải đấu ${publishFee.toLocaleString('vi-VN')}đ trước khi công bố.`);
    }

    const targetStatus = existing.isRanked ? 'PENDING_APPROVAL' : 'REGISTRATION_OPEN';
    const updated = await this.tournamentsRepository.update(id, userId, { status: targetStatus });
    return this.mapTournamentFormat(updated);
  }

  async lock(id: string, userId: string, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Tournament not found');

    let isAuthorized = systemRoles.includes('ADMIN') || existing.createdBy === userId;

    if (!isAuthorized && existing.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        existing.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to lock this tournament');
    }

    if (existing.status !== 'REGISTRATION_OPEN' && existing.status !== 'REGISTRATION_CLOSED') {
      throw new BadRequestException('Tournament registration must be open or closed to lock');
    }

    const participants = await this.tournamentsRepository.findParticipants(id, existing.categoryId);
    if (participants.length < 2) {
      throw new BadRequestException('Need at least 2 participants to lock and generate bracket');
    }

    const totalPlayers = participants.reduce((sum, p) => sum + (p.members?.length || 0), 0);
    const entryFee = Number(existing.entryFee || 0);
    const platformFeePercentage = Number(existing.platformFeePercentage || 0);
    const totalPlatformFee = totalPlayers * entryFee * (platformFeePercentage / 100);

    const isClubOrFree = existing.tournamentType === 'CLUB' || entryFee === 0 || totalPlatformFee === 0;
    const targetStatus = isClubOrFree ? 'UPCOMING' : 'REGISTRATION_CLOSED';

    const updated = await this.tournamentsRepository.update(id, userId, { status: targetStatus });

    let bracket: { message: string; stageId: string; totalMatches: number } | null = null;
    try {
      bracket = await this.generateBracket(id, userId, systemRoles);
    } catch (err) {
      throw new BadRequestException('Failed to generate tournament bracket: ' + err.message);
    }

    return {
      tournament: this.mapTournamentFormat(updated),
      summary: {
        totalParticipants: participants.length,
        totalPlayers,
        platformFeePercentage,
        totalPlatformFee,
      },
      bracket,
    };
  }

  async updateStage(stageId: string, userId: string, data: UpdateStageDto, systemRoles: string[] = []) {
    const stage = await this.tournamentsRepository.findStageById(stageId);
    if (!stage) throw new NotFoundException('Stage not found');

    const tournament = await this.tournamentsRepository.findById(stage.tournamentId);
    if (!tournament) throw new NotFoundException('Tournament not found');

    // System ADMIN or Tournament creator can update
    let isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;

    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        tournament.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to update this stage');
    }

    return this.tournamentsRepository.updateStage(stageId, userId, data);
  }

  async validateInvite(id: string, inviteCode: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament || tournament.inviteCode !== inviteCode) {
      throw new BadRequestException('Mã mời không hợp lệ');
    }
    return {
      id: tournament.id,
      name: tournament.name,
      startDate: tournament.startDate,
      entryFee: tournament.entryFee,
      matchType: tournament.matchType,
      genderRestriction: tournament.genderRestriction,
    };
  }

  async createParent(userId: string, data: CreateParentTournamentDto) {
    return this.tournamentsRepository.createParent(userId, data);
  }

  async updateParent(id: string, userId: string, data: UpdateParentTournamentDto, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findParentById(id);
    if (!existing) throw new NotFoundException('Parent tournament not found');

    const canUpdate = systemRoles.includes('ADMIN') || existing.createdBy === userId;
    if (!canUpdate) {
      throw new ForbiddenException('You do not have permission to update this parent tournament');
    }

    return this.tournamentsRepository.updateParent(id, userId, data);
  }

  async findParentById(id: string) {
    const parent = await this.tournamentsRepository.findParentById(id);
    if (!parent) throw new NotFoundException('Parent tournament not found');
    return parent;
  }

  async findParentsByUser(userId: string) {
    return this.tournamentsRepository.findParentsByUser(userId);
  }

  async getParentWithAggregation(parentId: string) {
    const aggregation = await this.tournamentsRepository.getParentWithAggregation(parentId);
    return aggregation;
  }

  async seedMockParticipants(
    tournamentId: string,
    userId: string,
    names: string[],
    systemRoles: string[] = [],
    divisionId?: string,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Tournament not found');

    if (tournament.status !== 'DRAFT' && tournament.status !== 'REGISTRATION_OPEN') {
      throw new BadRequestException('Chỉ có thể tạo dữ liệu ảo ở trạng thái Nháp hoặc Đang mở đăng ký.');
    }

    const isAuthorized =
      systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to seed mock data');
    }

    return this.tournamentsRepository.seedMockParticipants(tournamentId, names, divisionId);
  }

  async clearMockParticipants(
    tournamentId: string,
    userId: string,
    systemRoles: string[] = [],
    divisionId?: string,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Tournament not found');

    if (tournament.status !== 'DRAFT' && tournament.status !== 'REGISTRATION_OPEN') {
      throw new BadRequestException('Chỉ có thể xóa dữ liệu ảo ở trạng thái Nháp hoặc Đang mở đăng ký.');
    }

    const isAuthorized =
      systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to clear mock data');
    }

    return this.tournamentsRepository.clearMockParticipants(tournamentId, divisionId);
  }

  async updateParticipantStatus(
    tournamentId: string,
    participantId: string,
    status: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Tournament not found');

    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new BadRequestException('Giải đấu đã chốt danh sách, không thể duyệt hoặc từ chối vận động viên.');
    }

    const isAuthorized =
      systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to update status');
    }

    const updated = await this.tournamentsRepository.updateParticipantStatus(participantId, status);

    try {
      const rosters = await this.tournamentsRepository.getParticipantRosters(participantId);
      for (const roster of rosters) {
        if (status === 'COMPLETE') {
          await this.notificationsService.sendNotification({
            receiverId: roster.userId,
            type: 'TOURNAMENT_REGISTER_SUCCESS',
            title: 'Đăng ký giải đấu thành công',
            content: `Bạn đã đăng ký thành công giải đấu ${tournament.name}.`,
            redirectUrl: `/tournaments/${tournament.id}`,
          });
        } else if (status === 'REJECTED') {
          await this.notificationsService.sendNotification({
            receiverId: roster.userId,
            type: 'TOURNAMENT_KICKED',
            title: 'Đơn đăng ký bị từ chối',
            content: `Đơn đăng ký tham gia giải đấu ${tournament.name} của bạn đã bị từ chối.`,
            redirectUrl: `/tournaments/${tournament.id}`,
          });
        }
      }
    } catch (err) {
      console.error('Failed to send notification for updateParticipantStatus:', err);
    }

    return updated;
  }

  async assignReservedSlot(
    tournamentId: string,
    userEmailOrPhone: string,
    teamName: string,
    userId: string,
    systemRoles: string[] = [],
    partnerEmailOrPhone?: string,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Tournament not found');

    const isAuthorized =
      systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to assign wildcard');
    }

    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new BadRequestException('Giải đấu đã chốt danh sách, không thể gán slot giữ chỗ.');
    }

    const foundUser = await this.tournamentsRepository.findUserByEmailOrPhone(userEmailOrPhone);
    if (!foundUser) {
      throw new NotFoundException('Không tìm thấy tài khoản Baseline cho người chơi thứ nhất');
    }

    let foundPartnerId: string | undefined = undefined;
    if (partnerEmailOrPhone) {
      const foundPartner = await this.tournamentsRepository.findUserByEmailOrPhone(partnerEmailOrPhone);
      if (!foundPartner) {
        throw new NotFoundException('Không tìm thấy tài khoản Baseline cho đồng đội (người thứ 2)');
      }
      if (foundPartner.id === foundUser.id) {
        throw new BadRequestException('Tài khoản đồng đội phải khác tài khoản người chơi thứ nhất');
      }
      foundPartnerId = foundPartner.id;
    }

    return this.tournamentsRepository.assignReservedSlot(tournamentId, foundUser.id, teamName, foundPartnerId);
  }

  async kickParticipant(
    tournamentId: string,
    participantId: string,
    userId: string,
    reason?: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Tournament not found');

    let isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;

    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        tournament.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to kick this participant');
    }

    const rosters = await this.tournamentsRepository.getParticipantRosters(participantId);
    const result = await this.tournamentsRepository.kickParticipant(tournamentId, participantId, userId, reason);

    try {
      for (const roster of rosters) {
        await this.notificationsService.sendNotification({
          receiverId: roster.userId,
          type: 'TOURNAMENT_KICKED',
          title: 'Bị loại khỏi giải đấu',
          content: `Đơn đăng ký tham gia giải đấu ${tournament.name} của bạn đã bị từ chối. Lý do: ${reason || 'Không có lý do cụ thể'}.`,
          redirectUrl: `/tournaments/${tournament.id}`,
        });
      }
    } catch (err) {
      console.error('Failed to send notification for kickParticipant:', err);
    }

    return result;
  }

  async cancelTournament(id: string, userId: string, systemRoles: string[] = []) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Tournament not found');

    let isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;

    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        tournament.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to cancel this tournament');
    }

    if (tournament.status === 'CANCELLED' || tournament.status === 'COMPLETED') {
      throw new BadRequestException('Giải đấu đã bị hủy hoặc đã hoàn thành, không thể hủy.');
    }

    return await this.tournamentsRepository.cancelTournament(id, userId);
  }

  async getFeesConfig() {
    return this.tournamentsRepository.getFeesConfig();
  }

  private async getPublishFee(tournamentType?: string | null, isRanked?: boolean | null) {
    const fees = await this.getFeesConfig();
    if (tournamentType === 'CLUB') return fees.feeClub;
    return isRanked ? fees.feePublicRanked : fees.feePublicUnranked;
  }

  @Cron('0 * * * * *')
  async handleRegistrationsTimeout() {
    try {
      const expiredList = await this.tournamentsRepository.processPendingRegistrationsTimeout();
      for (const item of expiredList) {
        await this.notificationsService.sendNotification({
          receiverId: item.leaderId,
          type: 'TOURNAMENT_KICKED',
          title: 'Hủy đăng ký Đôi do hết hạn xác nhận',
          content: `Đăng ký Đôi của bạn tại giải đấu ${item.tournamentName} đã bị hủy do đồng đội không xác nhận tham gia sau 30 phút.`,
          redirectUrl: `/tournaments/${item.tournamentId}`,
        });
      }
    } catch (err) {
      console.error('Error handling registrations timeout cron:', err);
    }
  }

  async findReferees(id: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    return this.tournamentsRepository.findReferees(id);
  }

  async updateSeeds(
    id: string,
    seeds: { participantId: string; seed: number }[],
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Tournament not found');

    const isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to update seeds');
    }

    if (tournament.status === 'IN_PROGRESS' || tournament.status === 'COMPLETED') {
      throw new BadRequestException('Cannot update seeds for an ongoing or completed tournament');
    }

    return this.tournamentsRepository.updateSeeds(id, seeds);
  }

  async createDivision(
    tournamentId: string,
    createDivisionDto: CreateDivisionDto,
    userId: string,
    systemRoles: string[] = [],
  ) {
    try {
      const tournament = await this.tournamentsRepository.findById(tournamentId);
      if (!tournament) {
        throw new NotFoundException('Tournament not found');
      }

      const isOwner = tournament.createdBy === userId;
      const isSystemAuthorized = systemRoles.includes('ADMIN') || systemRoles.includes('ORGANIZER');
      if (!isOwner && !isSystemAuthorized) {
        throw new ForbiddenException('Bạn không có quyền tạo bảng thi đấu cho giải này');
      }

      return await this.tournamentsRepository.createDivision(
        {
          name: createDivisionDto.name,
          matchType: createDivisionDto.matchType,
          genderRestriction: createDivisionDto.genderRestriction,
          maxParticipants: createDivisionDto.maxParticipants ?? tournament.maxParticipants ?? undefined,
          entryFee: createDivisionDto.entryFee ?? (tournament.entryFee ? Number(tournament.entryFee) : 0),
          isConfigOverride: createDivisionDto.isConfigOverride,
          venueId: createDivisionDto.venueId,
          bracketType: createDivisionDto.bracketType,
          roundConfig: createDivisionDto.roundConfig,
          startDate: createDivisionDto.startDate,
          registrationEndDate: createDivisionDto.registrationEndDate,
          minElo: createDivisionDto.minElo,
          maxElo: createDivisionDto.maxElo,
          prizeDescription: createDivisionDto.prizeDescription,
          tournamentId,
        },
        userId,
      );
    } catch (error) {
      console.error(`Failed to create division for tournament ${tournamentId}:`, error);
      throw error;
    }
  }

  async getDivisionsForTournament(tournamentId: string) {
    try {
      const tournament = await this.tournamentsRepository.findById(tournamentId);
      if (!tournament) {
        throw new NotFoundException('Tournament not found');
      }

      return await this.tournamentsRepository.getDivisionsByTournament(tournamentId);
    } catch (error) {
      console.error(`Failed to get divisions for tournament ${tournamentId}:`, error);
      throw error;
    }
  }

  async updateDivision(
    divisionId: string,
    updateDivisionDto: UpdateDivisionDto,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const isSystemAuthorized = systemRoles.includes('ADMIN') || systemRoles.includes('ORGANIZER');
    if (!isSystemAuthorized && !userId) {
      throw new ForbiddenException('Bạn không có quyền cập nhật bảng thi đấu này');
    }

    return this.tournamentsRepository.updateDivision(divisionId, updateDivisionDto, userId);
  }

  async updateDivisionConfig(
    tournamentId: string,
    divisionId: string,
    updateDivisionDto: UpdateDivisionDto,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const isOwner = tournament.createdBy === userId;
    const isSystemAuthorized = systemRoles.includes('ADMIN') || systemRoles.includes('ORGANIZER');
    if (!isOwner && !isSystemAuthorized) {
      throw new ForbiddenException('Bạn không có quyền cập nhật cấu hình hình thức này');
    }

    return this.tournamentsRepository.updateDivisionConfig(divisionId, updateDivisionDto, userId);
  }

  async deleteDivision(
    divisionId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const isSystemAuthorized = systemRoles.includes('ADMIN') || systemRoles.includes('ORGANIZER');
    if (!isSystemAuthorized && !userId) {
      throw new ForbiddenException('Bạn không có quyền xóa bảng thi đấu này');
    }

    return this.tournamentsRepository.deleteDivision(divisionId, userId);
  }

  async getParticipantsByDivision(tournamentId: string, divisionId: string) {
    const divisions = await this.tournamentsRepository.getDivisionsByTournament(tournamentId);
    const exists = divisions.some((division) => division.id === divisionId);
    if (!exists) {
      throw new NotFoundException('Division not found for this tournament');
    }

    return this.tournamentsRepository.getParticipantsByDivision(divisionId);
  }

  async updateParentAggregation(parentId: string) {
    try {
      return await this.tournamentsRepository.getParentWithAggregation(parentId);
    } catch (error) {
      console.error(`Failed to update parent aggregation for ${parentId}:`, error);
      throw error;
    }
  }
}
