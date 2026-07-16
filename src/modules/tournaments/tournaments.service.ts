import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { TournamentsRepository } from './tournaments.repository';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { CreateLiteTournamentDto } from './dto/create-lite-tournament.dto';
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
import { Cron } from '@nestjs/schedule';
import { calcPlatformFee } from '../../common/helpers/platform-fee.helper';
import { CreateDivisionDto } from './dto/create-division.dto';
import { UpdateDivisionDto } from './dto/update-division.dto';
import { resolveEffectiveSportRules } from './utils/sport-rules/resolve-effective-sport-rules';
import {
  inferAllowedSportRuleKinds,
  inferExpectedSportRuleKind,
  validateSportRuleConfig,
} from './utils/sport-rules/validate-sport-rules-config';
import {
  buildOrganizerNewRegistrationNotification,
  buildOrganizerTeamCompletedNotification,
  buildParticipantKickedNotification,
  buildParticipantPendingTeammateNotification,
  buildParticipantRegistrationPendingNotification,
  buildParticipantRegistrationRejectedNotification,
  buildParticipantRegistrationSuccessNotification,
  buildParticipantTeammateJoinedNotification,
  buildParticipantWithdrawnNotification,
  buildRefereeInviteAcceptedNotification,
  buildRefereeInviteDeclinedNotification,
  buildRefereeInviteNotification,
  buildRefereeInviteRevokedNotification,
  buildReservedSlotAssignedNotification,
  buildRegistrationCancelledFullNotification,
  buildRegistrationTimeoutNotification,
  buildTournamentCancelledNotification,
} from '../notifications/notification-builder';
import { StorageService } from '../../providers/storage/storage.service';
import { isStoredImageUrl, extractStoredImagePublicId } from '../../common/helpers/cloudinary.helper';

@Injectable()
export class TournamentsService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly bracketGeneratorService: BracketGeneratorService,
    private readonly notificationsService: NotificationsService,
    private readonly storageService: StorageService,
  ) {}

  private async sendNotificationBatch(notifications: Array<Promise<unknown>>) {
    await Promise.all(notifications);
  }

  private async cleanupTournamentImages(tournament: { galleryImages?: string[] | null; bannerUrl?: string | null; logoUrl?: string | null }) {
    const urls: string[] = [];

    if (tournament.bannerUrl) urls.push(tournament.bannerUrl);
    if (tournament.logoUrl) urls.push(tournament.logoUrl);
    if (tournament.galleryImages) urls.push(...tournament.galleryImages);

    for (const url of urls) {
      if (isStoredImageUrl(url)) {
        try {
          const publicId = extractStoredImagePublicId(url);
          if (publicId) {
            await this.storageService.deleteFile(publicId);
          }
        } catch (err) {
          console.error('Failed to delete tournament image from storage:', err);
        }
      }
    }
  }

  private readSupportedMatchTypes(categoryConfig: CategoryConfig | null | undefined) {
    return Array.isArray(categoryConfig?.supportedMatchTypes)
      ? categoryConfig.supportedMatchTypes
      : null;
  }

  private validateMatchTypeAgainstCategory(
    categoryConfig: CategoryConfig | null | undefined,
    matchType: string | null | undefined,
    sourceLabel: string,
  ) {
    if (!matchType) {
      return;
    }

    const supportedMatchTypes = this.readSupportedMatchTypes(categoryConfig);
    if (supportedMatchTypes && !supportedMatchTypes.includes(matchType as 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES')) {
      throw new BadRequestException(
        `${sourceLabel}: môn này không hỗ trợ hình thức ${matchType}. Cho phép: ${supportedMatchTypes.join(', ')}.`,
      );
    }
  }

  private validateMatchTypeGenderRestriction(
    matchType: string | null | undefined,
    genderRestriction: string | null | undefined,
    sourceLabel: string,
  ) {
    if (!matchType) {
      return;
    }

    if (matchType === 'MIXED_DOUBLES' && genderRestriction !== 'MIXED') {
      throw new BadRequestException(`${sourceLabel}: MIXED_DOUBLES phải đi cùng genderRestriction = MIXED.`);
    }

    if ((matchType === 'SINGLES' || matchType === 'DOUBLES') && genderRestriction === 'MIXED') {
      throw new BadRequestException(`${sourceLabel}: chỉ MIXED_DOUBLES mới được dùng genderRestriction = MIXED.`);
    }
  }

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

  private validateRegistrationMode(config: unknown) {
    if (!config || typeof config !== 'object') return;

    const registrationMode = (config as Record<string, unknown>).registrationMode;
    if (registrationMode !== undefined) {
      if (typeof registrationMode !== 'string' || !['OPEN', 'APPROVAL', 'INVITE_ONLY'].includes(registrationMode)) {
        throw new BadRequestException(
          'registrationMode must be OPEN, APPROVAL, or INVITE_ONLY',
        );
      }
    }
  }

  async findAll(query: QueryTournamentDto) {
    const result = await this.tournamentsRepository.findAll({
      ...query,
      visibility: 'PUBLIC',
      createdBy: undefined,
    }, {
      defaultTournamentType: null,
      defaultVisibility: 'PUBLIC',
    });
    result.data = result.data.map(t => this.mapTournamentFormat(t));
    return result;
  }

  async findPublic(query: QueryTournamentDto) {
    // Lấy tất cả tournament hiển thị công khai trên app/web:
    // Mặc định lọc các giải đấu PUBLIC để ẩn giải đấu PRIVATE khỏi trang chủ
    const result = await this.tournamentsRepository.findAll({
      ...query,
      visibility: 'PUBLIC',
      createdBy: undefined,
    }, {
      defaultTournamentType: null,
      defaultVisibility: 'PUBLIC',
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

  async getMyWorkspace(userId: string) {
    const workspace = await this.tournamentsRepository.findMyWorkspace(userId);

    return {
      ...workspace,
      organizedTournaments: workspace.organizedTournaments.map((tournament) => this.mapTournamentFormat(tournament)),
      participatingTournaments: workspace.participatingTournaments.map((tournament) => this.mapTournamentFormat(tournament)),
      coOrganizerTournaments: workspace.coOrganizerTournaments.map((tournament) => this.mapTournamentFormat(tournament)),
    };
  }

  async findOne(
    id: string,
    userId?: string | null,
    inviteCode?: string,
    systemRoles: string[] = [],
    participantId?: string,
    teamInviteToken?: string,
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const isOwner = userId && tournament.createdBy === userId;
    const isAdmin = systemRoles.includes('ADMIN');

    if (['DRAFT', 'PENDING_APPROVAL'].includes(tournament.status) && !isOwner && !isAdmin) {
      throw new NotFoundException('Tournament not found');
    }

    if (tournament.status === 'SUSPENDED' && !isOwner && !isAdmin) {
      throw new ForbiddenException('Giải đấu đang bị tạm đình chỉ do vi phạm điều khoản dịch vụ');
    }
    if (tournament.status === 'CANCELLED' && !isOwner && !isAdmin) {
      throw new ForbiddenException('Giải đấu đã bị cấm hoặc hủy vĩnh viễn');
    }

    if (tournament.visibility === 'PRIVATE') {
      const isInviteMatch = inviteCode && tournament.inviteCode === inviteCode;
      const isValidTeamInvite =
        !!participantId &&
        !!teamInviteToken &&
        await (async () => {
          const participant = await this.tournamentsRepository.findParticipantById(participantId);
          return !!participant &&
            participant.tournamentId === id &&
            participant.teamInviteToken === teamInviteToken;
        })();
      let isCommunityMember = false;
      if (userId && tournament.communityId) {
        const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
        if (member && member.status === 'JOINED') {
          isCommunityMember = true;
        }
      }
      if (!isOwner && !isInviteMatch && !isValidTeamInvite && !isAdmin && !isCommunityMember) {
        throw new ForbiddenException('Giải đấu này yêu cầu mã mời');
      }
    }

    return this.mapTournamentFormat(tournament);
  }

  async create(userId: string, createTournamentDto: CreateTournamentDto, systemRoles: string[] = []) {
    this.validateRegistrationMode(createTournamentDto.tournamentConfig);

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

    const categoryConfig = category.categoryConfig as CategoryConfig | null | undefined;
    this.validateMatchTypeAgainstCategory(categoryConfig, createTournamentDto.matchType, 'tournament');
    this.validateMatchTypeGenderRestriction(
      createTournamentDto.matchType,
      createTournamentDto.genderRestriction,
      'tournament',
    );

    validateSportRuleConfig(createTournamentDto.sportRules, {
      expectedKind: inferExpectedSportRuleKind({
        categoryConfig: category.categoryConfig as Record<string, unknown> | null | undefined,
        categoryName: category.name,
        categorySlug: category.slug,
      }),
      allowedKinds: inferAllowedSportRuleKinds({
        categoryConfig: category.categoryConfig as Record<string, unknown> | null | undefined,
        categoryName: category.name,
        categorySlug: category.slug,
      }),
      sourceLabel: 'sportRules',
    });

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
      // Public tournaments, including child tournaments, still require organizer-level permission.
      if (!isSystemAuthorized) {
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

    // 5. Validate venueId
    if (createTournamentDto.venueId) {
      const venue = await this.tournamentsRepository.findByIdVenue(createTournamentDto.venueId);
      if (!venue) {
        throw new BadRequestException('Địa điểm không tồn tại');
      }
    }

    const record = await this.tournamentsRepository.create(userId, createTournamentDto);
    return this.mapTournamentFormat(record);
  }

  async createLite(userId: string, dto: CreateLiteTournamentDto, systemRoles: string[] = []) {
    // 1. Map sport slug → category
    const category = await this.tournamentsRepository.findCategoryBySlug(dto.sport);
    if (!category) {
      throw new BadRequestException(`Môn thể thao "${dto.sport}" không được hỗ trợ`);
    }

    // 2. Resolve matchType
    const format = dto.format || 'singles';
    const matchType = format === 'doubles' ? 'DOUBLES' : 'SINGLES';

    // 3. Validate matchType against category
    this.validateMatchTypeAgainstCategory(
      category.categoryConfig as CategoryConfig | null | undefined,
      matchType,
      'tournament',
    );

    // 4. Resolve bracketType
    const bracketType = dto.bracketType || 'single_elimination';
    const bracketTypeMap: Record<string, string> = {
      'single_elimination': 'SINGLE_ELIMINATION',
      'double_elimination': 'DOUBLE_ELIMINATION',
      'round_robin': 'ROUND_ROBIN',
    };
    const finalBracketType = bracketTypeMap[bracketType] || 'SINGLE_ELIMINATION';

    // 5. Build sportRules mặc định
    const config = category.categoryConfig as CategoryConfig | null | undefined;
    const defaultSportRules = config?.defaultSportRules || {};
    const sportRules = {
      ...defaultSportRules,
      kind: dto.sport === 'badminton' ? 'BADMINTON'
        : dto.sport === 'tennis' ? 'TENNIS'
        : dto.sport === 'pickleball' ? 'PICKLEBALL'
        : dto.sport === 'table_tennis' ? 'TABLE_TENNIS'
        : 'BADMINTON',
    };

    // 6. Build tournamentConfig
    const maxTeams = dto.maxTeams || 16;
    const tournamentConfig = {
      bracketType: finalBracketType,
      maxTeams,
    };

    // 7. Check authorization: must be community member (JOINED)
    const isSystemAuthorized = systemRoles.includes('ADMIN') || systemRoles.includes('ORGANIZER');
    if (!isSystemAuthorized) {
      const member = await this.tournamentsRepository.findCommunityMember(dto.communityId, userId);
      if (!member || member.status !== 'JOINED') {
        throw new ForbiddenException('Bạn phải là thành viên của câu lạc bộ để tạo giải đấu.');
      }
    }

    // 8. Tạo CreateTournamentDto từ dữ liệu Lite
    const fullDto = new CreateTournamentDto();
    Object.assign(fullDto, {
      name: dto.name,
      tournamentType: 'CLUB',
      visibility: 'PUBLIC',
      communityId: dto.communityId,
      categoryId: category.id,
      matchType,
      description: dto.description || '',
      maxParticipants: maxTeams,
      entryFee: 0,
      isRanked: false,
      sportRules,
      tournamentConfig,
    });

    // 9. Gọi repository.create() — dùng chung logic insert
    const record = await this.tournamentsRepository.create(userId, fullDto);

    // 10. Auto-publish: set status REGISTRATION_OPEN để đăng ký & bracket được luôn
    await this.tournamentsRepository.update(record.id, userId, {
      status: 'REGISTRATION_OPEN',
    });

    // 11. Trả về response gọn
    return {
      id: record.id,
      name: record.name,
      status: 'REGISTRATION_OPEN',
    };
  }

  async update(id: string, userId: string, updateTournamentDto: UpdateTournamentDto, systemRoles: string[] = []) {
    this.validateRegistrationMode(updateTournamentDto.tournamentConfig);

    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Tournament not found');

    const categoryId = updateTournamentDto.categoryId ?? existing.categoryId;
    const category = await this.tournamentsRepository.findCategory(categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

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
        const incomingConfig = updateTournamentDto.tournamentConfig;
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

    if (tStartVal && regEndVal && tStartVal < regEndVal) {
      throw new BadRequestException('Tournament start date must be after or equal to registration end date');
    }

    if (updateTournamentDto.entryFee && existing.tournamentType === 'CLUB' && updateTournamentDto.entryFee > 0) {
      throw new BadRequestException('Club tournaments must remain free');
    }

    if (updateTournamentDto.entryFee && existing.tournamentType === 'PUBLIC' && updateTournamentDto.entryFee > 0 && updateTournamentDto.entryFee < 100000) {
      throw new BadRequestException('Minimum entry fee for paid public tournaments is 100,000đ');
    }

    const categoryConfig = category.categoryConfig as CategoryConfig | null | undefined;
    this.validateMatchTypeAgainstCategory(
      categoryConfig,
      updateTournamentDto.matchType ?? existing.matchType,
      'tournament',
    );
    this.validateMatchTypeGenderRestriction(
      updateTournamentDto.matchType ?? existing.matchType,
      updateTournamentDto.genderRestriction ?? existing.genderRestriction,
      'tournament',
    );

    if (updateTournamentDto.sportRules) {
      validateSportRuleConfig(updateTournamentDto.sportRules, {
        expectedKind: inferExpectedSportRuleKind({
          categoryConfig: category.categoryConfig as Record<string, unknown> | null | undefined,
          categoryName: category.name,
          categorySlug: category.slug,
        }),
        allowedKinds: inferAllowedSportRuleKinds({
          categoryConfig: category.categoryConfig as Record<string, unknown> | null | undefined,
          categoryName: category.name,
          categorySlug: category.slug,
        }),
        sourceLabel: 'sportRules',
      });
    }

    // Clean up old banner/logo from Cloudinary if they are being replaced
    if (updateTournamentDto.bannerUrl !== undefined && existing.bannerUrl && existing.bannerUrl !== updateTournamentDto.bannerUrl) {
      if (isStoredImageUrl(existing.bannerUrl)) {
        try {
          const publicId = extractStoredImagePublicId(existing.bannerUrl);
          if (publicId) {
            await this.storageService.deleteFile(publicId);
          }
        } catch (err) {
          console.error('Failed to delete old banner from storage:', err);
        }
      }
    }

    if (updateTournamentDto.logoUrl !== undefined && existing.logoUrl && existing.logoUrl !== updateTournamentDto.logoUrl) {
      if (isStoredImageUrl(existing.logoUrl)) {
        try {
          const publicId = extractStoredImagePublicId(existing.logoUrl);
          if (publicId) {
            await this.storageService.deleteFile(publicId);
          }
        } catch (err) {
          console.error('Failed to delete old logo from storage:', err);
        }
      }
    }

    const updated = await this.tournamentsRepository.update(id, userId, updateTournamentDto);

    // Thông báo cho người theo dõi khi dời lịch
    const dateChanged =
      (updateTournamentDto.startDate && updateTournamentDto.startDate !== (existing.startDate?.toISOString() ?? null)) ||
      (updateTournamentDto.endDate && updateTournamentDto.endDate !== (existing.endDate?.toISOString() ?? null)) ||
      (updateTournamentDto.registrationStartDate && updateTournamentDto.registrationStartDate !== (existing.registrationStartDate?.toISOString() ?? null)) ||
      (updateTournamentDto.registrationEndDate && updateTournamentDto.registrationEndDate !== (existing.registrationEndDate?.toISOString() ?? null));

    if (dateChanged && existing.status !== 'DRAFT') {
      const followers = await this.tournamentsRepository.getFollowerUserIds(id);
      for (const followerId of followers) {
        await this.notificationsService.sendNotification({
          receiverId: followerId,
          type: 'TOURNAMENT_SCHEDULE_CHANGED',
          title: `${existing.name} đã thay đổi lịch thi đấu`,
          content: `Giải đấu "${existing.name}" vừa được dời lịch. Kiểm tra ngay để cập nhật thời gian mới.`,
          redirectUrl: `/tournaments/${id}`,
        });
      }
    }

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

    // Check permissions
    let hasPermission = false;
    if (systemRoles.includes('ADMIN')) {
      hasPermission = true;
    } else if (existing.createdBy === userId) {
      hasPermission = true;
    } else if (existing.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        existing.communityId,
        userId,
      );
      if (member && member.role === 'OWNER') {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      throw new ForbiddenException('You do not have permission to delete this tournament');
    }

    // If System ADMIN, delete immediately
    if (systemRoles.includes('ADMIN')) {
      await this.cleanupTournamentImages(existing);
      return this.tournamentsRepository.softDelete(id, userId);
    }

    // Non-draft tournaments with participants or locked/live states must go through admin review
    if (existing.status !== 'DRAFT') {
      const activeParticipants = await this.tournamentsRepository.countActiveParticipants(id);
      const requiresReview =
        activeParticipants > 0 ||
        existing.isRegistrationLocked ||
        ['REGISTRATION_CLOSED', 'UPCOMING', 'IN_PROGRESS', 'ONGOING', 'COMPLETED'].includes(existing.status);

      if (requiresReview) {
        await this.tournamentsRepository.updateStatus(id, 'PENDING_DELETE');
        return {
          pendingDelete: true,
          message: 'Giải đấu đã có người tham gia hoặc đã bước vào giai đoạn chốt danh sách/thi đấu. Yêu cầu xóa đã được gửi tới Quản trị viên để xét duyệt.',
        };
      }
    }

    await this.cleanupTournamentImages(existing);
    return this.tournamentsRepository.softDelete(id, userId);
  }

  async removeParent(id: string, userId: string, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findParentById(id);
    if (!existing) throw new NotFoundException('Parent tournament not found');

    // System ADMIN or creator can delete parent tournament
    const canDelete = systemRoles.includes('ADMIN') || existing.createdBy === userId;
    if (!canDelete) {
      throw new ForbiddenException('You do not have permission to delete this parent tournament');
    }

    // If System ADMIN, delete immediately
    if (systemRoles.includes('ADMIN')) {
      return this.tournamentsRepository.softDeleteParent(id, userId);
    }

    // Parent tournaments with participants or locked/live child divisions must go through admin review
    const divisions = await this.tournamentsRepository.findByParentId(id);
    for (const div of divisions) {
      if (div.status !== 'DRAFT') {
        const activeParticipants = await this.tournamentsRepository.countActiveParticipants(div.id);
        const requiresReview =
          activeParticipants > 0 ||
          div.isRegistrationLocked ||
          ['REGISTRATION_CLOSED', 'UPCOMING', 'IN_PROGRESS', 'ONGOING', 'COMPLETED'].includes(div.status);

        if (requiresReview) {
          for (const d of divisions) {
            await this.tournamentsRepository.updateStatus(d.id, 'PENDING_DELETE');
          }
          return {
            pendingDelete: true,
            message: 'Giải đấu đã có người tham gia hoặc đã bước vào giai đoạn chốt danh sách/thi đấu. Yêu cầu xóa đã được gửi tới Quản trị viên để xét duyệt.',
          };
        }
      }
    }

    return this.tournamentsRepository.softDeleteParent(id, userId);
  }

  async generateBracket(
    id: string,
    userId: string,
    systemRoles: string[] = [],
    divisionId?: string,
    seedingType?: 'SEEDED' | 'RANDOM',
  ) {
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
    const bracketType = (division?.bracketType || (config.bracketType as string) || 'SINGLE_ELIMINATION').toUpperCase();

    if (bracketType === 'DOUBLE_ELIMINATION') {
      return this.bracketGeneratorService.generateDoubleElimination(id, userId, divisionId, seedingType);
    } else if (bracketType === 'ROUND_ROBIN') {
      return this.bracketGeneratorService.generateRoundRobin(id, userId, divisionId, seedingType);
    } else if (bracketType === 'GROUP_STAGE_KNOCKOUT') {
      return this.bracketGeneratorService.generateGroupStageKnockout(id, userId, divisionId, seedingType);
    } else {
      return this.bracketGeneratorService.generateSingleElimination(id, userId, divisionId, seedingType);
    }
  }

  async autoSeedFromElo(
    tournamentId: string,
    userId: string,
    systemRoles: string[] = [],
    divisionId?: string,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Tournament not found');

    let isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) isAuthorized = true;
    }
    if (!isAuthorized) throw new ForbiddenException();

    const participants = await this.tournamentsRepository.findParticipantsForSeeding(tournament.id, divisionId);

    // Get matchType from tournament/division
    let matchType = tournament.matchType || 'DOUBLES';
    if (divisionId) {
      const division = await this.tournamentsRepository.findDivisionById(divisionId);
      if (division) {
        matchType = division.matchType || matchType;
      }
    }

    // Calculate ELO for each participant
    const eloEntries: Array<{ participantId: string; elo: number }> = [];
    for (const p of participants) {
      const members = (p as any).members || [];
      if (members.length === 0) {
        eloEntries.push({ participantId: p.id, elo: 1000 });
        continue;
      }

      const elos = await Promise.all(
        members.map((m: { userId: string }) =>
          this.tournamentsRepository.getUserElo(m.userId, tournament.categoryId, matchType),
        ),
      );

      const effectiveElo = elos.length > 0
        ? Math.round(elos.reduce((a: number, b: number) => a + b, 0) / elos.length)
        : 1000;

      eloEntries.push({ participantId: p.id, elo: effectiveElo });
    }

    // Sort by ELO descending, assign seeds
    eloEntries.sort((a, b) => b.elo - a.elo);
    const seeds = eloEntries.map((entry, index) => ({
      participantId: entry.participantId,
      seed: index + 1,
    }));

    await this.tournamentsRepository.updateSeeds(tournamentId, seeds);

    return { message: 'Auto seeding completed', seeds };
  }

  private async validateEloLimits(
    tournament: typeof schema.tournaments.$inferSelect,
    userIds: string[],
    options?: {
      division?: {
        matchType?: string | null;
        minElo?: number | null;
        maxElo?: number | null;
      } | null;
    },
  ): Promise<void> {
    const config = tournament.tournamentConfig as TournamentConfig;
    const division = options?.division;

    const minElo = division?.minElo !== undefined && division?.minElo !== null
      ? Number(division.minElo)
      : config?.minElo !== undefined && config?.minElo !== null
        ? Number(config.minElo)
        : null;
    const maxElo = division?.maxElo !== undefined && division?.maxElo !== null
      ? Number(division.maxElo)
      : config?.maxElo !== undefined && config?.maxElo !== null
        ? Number(config.maxElo)
        : null;
    const maxCombinedElo = config?.maxCombinedElo !== undefined && config?.maxCombinedElo !== null ? Number(config.maxCombinedElo) : null;
    const maxTeammateGap = config?.maxTeammateGap !== undefined && config?.maxTeammateGap !== null ? Number(config.maxTeammateGap) : null;
    const effectiveMatchType = division?.matchType || tournament.matchType || 'SINGLES';

    if (minElo === null && maxElo === null && maxCombinedElo === null && maxTeammateGap === null) {
      return;
    }

    const elos: number[] = [];
    for (const uId of userIds) {
      const elo = await this.tournamentsRepository.getUserElo(uId, tournament.categoryId, effectiveMatchType);
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

  private assertRegistrationAccessible(
    tournament: {
      status?: string | null;
      inviteCode?: string | null;
      registrationEndDate?: Date | string | null;
      isRegistrationLocked?: boolean | null;
    },
    options?: {
      inviteCode?: string;
      allowDraft?: boolean;
    },
  ) {
    const status = tournament.status || '';
    const allowDraft = options?.allowDraft === true;
    const inviteCode = options?.inviteCode;
    const matchesDraftInvite =
      status === 'DRAFT' &&
      !!inviteCode &&
      !!tournament.inviteCode &&
      tournament.inviteCode === inviteCode;

    if (
      status !== 'REGISTRATION_OPEN' &&
      status !== 'UPCOMING' &&
      !allowDraft &&
      !matchesDraftInvite
    ) {
      throw new BadRequestException('Tournament registration is closed');
    }

    if (
      tournament.registrationEndDate &&
      new Date() > new Date(tournament.registrationEndDate)
    ) {
      throw new BadRequestException('Hạn đăng ký giải đấu đã kết thúc');
    }

    if (tournament.isRegistrationLocked) {
      throw new BadRequestException('Đăng ký giải đấu đã tạm thời bị khóa bởi Ban tổ chức');
    }
  }

  async register(id: string, userId: string, registerTournamentDto: RegisterTournamentDto, inviteCode?: string) {
    await this.validateProfileComplete(userId);

    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    this.assertRegistrationAccessible(tournament, { inviteCode });

    const userIds = [userId];
    if (registerTournamentDto.partnerEmailOrPhone) {
      const partnerUser = await this.tournamentsRepository.findUserByEmailOrPhone(registerTournamentDto.partnerEmailOrPhone);
      if (partnerUser) {
        userIds.push(partnerUser.id);
      }
    }

    const requestedDivisionId = registerTournamentDto.tournamentDivisionId ?? registerTournamentDto.divisionId;
    const requestedDivision = requestedDivisionId
      ? await this.tournamentsRepository.findDivisionById(requestedDivisionId)
      : null;

    await this.validateEloLimits(tournament, userIds, { division: requestedDivision });

    const result = await this.tournamentsRepository.registerParticipant(id, userId, registerTournamentDto, inviteCode);

    try {
      const canceledLeaders = await this.tournamentsRepository.cancelPendingRegistrationsIfFull(id);
      for (const canceledLeader of canceledLeaders) {
        await this.notificationsService.sendNotification(
          buildRegistrationCancelledFullNotification({
            receiverId: canceledLeader.leaderId,
            tournamentId: id,
            divisionId: canceledLeader.divisionId,
          }),
        );
      }
    } catch (err) {
      console.error('Failed to cancel pending registrations on full:', err);
    }

    try {
      const notifications: Array<Promise<unknown>> = [];

      if (tournament.createdBy !== userId) {
        notifications.push(
          this.notificationsService.sendNotification(
            buildOrganizerNewRegistrationNotification({
              receiverId: tournament.createdBy,
              tournamentId: id,
              tournamentName: tournament.name,
              teamName: result.participant.teamName,
              divisionId: result.participant.tournamentDivisionId,
            }),
          ),
        );
      }

      if (result.teamInviteLink) {
        notifications.push(
          this.notificationsService.sendNotification(
            buildParticipantPendingTeammateNotification({
              receiverId: userId,
              tournamentId: id,
              tournamentName: tournament.name,
              divisionId: result.participant.tournamentDivisionId,
            }),
          ),
        );
      } else if (result.participant.teamStatus === 'PENDING_APPROVAL') {
        notifications.push(
          this.notificationsService.sendNotification(
            buildParticipantRegistrationPendingNotification({
              receiverId: userId,
              tournamentId: id,
              tournamentName: tournament.name,
              divisionId: result.participant.tournamentDivisionId,
            }),
          ),
        );
      } else if (result.participant.teamStatus === 'COMPLETE' && result.participant.isPaid) {
        notifications.push(
          this.notificationsService.sendNotification(
            buildParticipantRegistrationSuccessNotification({
              receiverId: userId,
              tournamentId: id,
              tournamentName: tournament.name,
              divisionId: result.participant.tournamentDivisionId,
            }),
          ),
        );
      }

      await this.sendNotificationBatch(notifications);
    } catch (err) {
      console.error('Failed to send registration notifications:', err);
    }

    // Auto seed by ELO if configured
    try {
      const config = (tournament.tournamentConfig || {}) as Record<string, unknown>;
      if (config.seedingMethod === 'ELO') {
        const divisionId = result.participant.tournamentDivisionId;
        await this.autoSeedFromElo(id, userId, [], divisionId ?? undefined);
      }
    } catch (err) {
      console.error('Failed to auto-seed after registration:', err);
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

    this.assertRegistrationAccessible(tournament, { allowDraft: true });

    const leaderRoster = await this.tournamentsRepository.findLeaderByParticipantId(participantId);
    const userIds = [userId];
    if (leaderRoster) {
      userIds.push(leaderRoster.userId);
    }

    const participant = await this.tournamentsRepository.findParticipantById(participantId);
    const division = participant?.tournamentDivisionId
      ? await this.tournamentsRepository.findDivisionById(participant.tournamentDivisionId)
      : null;

    await this.validateEloLimits(tournament, userIds, { division });

    const result = await this.tournamentsRepository.joinTeam(tournamentId, userId, participantId, teamInviteToken);

    try {
      const canceledLeaders = await this.tournamentsRepository.cancelPendingRegistrationsIfFull(tournamentId);
      for (const canceledLeader of canceledLeaders) {
        await this.notificationsService.sendNotification(
          buildRegistrationCancelledFullNotification({
            receiverId: canceledLeader.leaderId,
            tournamentId,
            divisionId: canceledLeader.divisionId,
          }),
        );
      }
    } catch (err) {
      console.error('Failed to cancel pending registrations on full:', err);
    }

    try {
      const participantRosters = await this.tournamentsRepository.getParticipantRosters(
        result.participant.id,
      );
      const notifications: Array<Promise<unknown>> = [];

      if (leaderRoster && leaderRoster.userId !== userId) {
        notifications.push(
          this.notificationsService.sendNotification(
            buildParticipantTeammateJoinedNotification({
              receiverId: leaderRoster.userId,
              tournamentId,
              tournamentName: tournament.name,
              divisionId: result.participant.tournamentDivisionId,
            }),
          ),
        );
      }

      if (tournament.createdBy !== userId) {
        notifications.push(
          this.notificationsService.sendNotification(
            buildOrganizerTeamCompletedNotification({
              receiverId: tournament.createdBy,
              tournamentId,
              tournamentName: tournament.name,
              teamName: result.participant.teamName,
              divisionId: result.participant.tournamentDivisionId,
            }),
          ),
        );
      }

      for (const roster of participantRosters) {
        if (result.participant.teamStatus === 'PENDING_APPROVAL') {
          notifications.push(
            this.notificationsService.sendNotification(
              buildParticipantRegistrationPendingNotification({
                receiverId: roster.userId,
                tournamentId,
                tournamentName: tournament.name,
                divisionId: result.participant.tournamentDivisionId,
              }),
            ),
          );
        } else if (result.participant.teamStatus === 'COMPLETE' && result.participant.isPaid) {
          notifications.push(
            this.notificationsService.sendNotification(
              buildParticipantRegistrationSuccessNotification({
                receiverId: roster.userId,
                tournamentId,
                tournamentName: tournament.name,
                divisionId: result.participant.tournamentDivisionId,
              }),
            ),
          );
        }
      }

      await this.sendNotificationBatch(notifications);
    } catch (err) {
      console.error('Failed to send joinTeam notifications:', err);
    }

    return result;
  }

  async withdraw(
    tournamentId: string,
    userId: string,
    bankData?: { bankName?: string; bankAccountNumber?: string; bankAccountName?: string },
    divisionId?: string,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Tournament not found');

    const now = new Date();
    if (
      tournament.status !== 'REGISTRATION_OPEN' ||
      (tournament.registrationEndDate && now > new Date(tournament.registrationEndDate))
    ) {
      throw new BadRequestException('Hạn đăng ký đã qua hoặc danh sách đã chốt, không thể tự hủy đăng ký.');
    }

    const currentRegistration = await this.tournamentsRepository.myRegistration(tournamentId, userId, divisionId);
    const result = await this.tournamentsRepository.withdraw(tournamentId, userId, bankData, divisionId);

    try {
      if (
        tournament.createdBy !== userId &&
        currentRegistration.registered &&
        currentRegistration.participant
      ) {
        await this.notificationsService.sendNotification(
          buildParticipantWithdrawnNotification({
            receiverId: tournament.createdBy,
            tournamentId,
            tournamentName: tournament.name,
            teamName: currentRegistration.participant.teamName,
          }),
        );
      }
    } catch (err) {
      console.error('Failed to send withdraw notification:', err);
    }

    return result;
  }

  async myRegistration(tournamentId: string, userId: string, divisionId?: string) {
    return this.tournamentsRepository.myRegistration(tournamentId, userId, divisionId);
  }

  async findParticipants(id: string, divisionId?: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    return this.tournamentsRepository.findPublicParticipants(id, tournament.categoryId, divisionId);
  }

  async findParticipantsForOrganizer(id: string, divisionId?: string) {
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
    const tournament = await this.tournamentsRepository.findByInviteCode(inviteCode);
    if (!tournament) {
      throw new NotFoundException('Tournament not found for this invite code');
    }

    return this.register(tournament.id, userId, registerTournamentDto, inviteCode);
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

    const removedUrl = currentImages[index];

    // Delete the image from Cloudinary before removing from DB
    if (isStoredImageUrl(removedUrl)) {
      try {
        const publicId = extractStoredImagePublicId(removedUrl);
        if (publicId) {
          await this.storageService.deleteFile(publicId);
        }
      } catch (err) {
        // Log error but don't stop the removal process
        console.error('Failed to delete gallery image from storage:', err);
      }
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

    // Ràng buộc thông tin cơ bản trước khi công bố
    if (!existing.description || existing.description.trim().length < 10) {
      throw new BadRequestException('Mô tả giải đấu phải có ít nhất 10 ký tự trước khi công bố.');
    }

    // Tự động gán banner và logo mặc định nếu chưa có
    const defaultBanner = 'https://qlgiaidau.vndcsport.vn/default-banner.png';
    const defaultLogo = 'https://qlgiaidau.vndcsport.vn/default-logo.png';
    const updateData: Record<string, unknown> = {};
    if (!existing.bannerUrl) updateData.bannerUrl = defaultBanner;
    if (!existing.logoUrl) updateData.logoUrl = defaultLogo;

    if (!existing.startDate) {
      throw new BadRequestException('Vui lòng cấu hình ngày bắt đầu giải đấu trước khi công bố.');
    }

    if (!existing.endDate) {
      throw new BadRequestException('Vui lòng cấu hình ngày kết thúc giải đấu trước khi công bố.');
    }

    // Ràng buộc logic ngày tháng
    if (existing.startDate && existing.endDate &&
        new Date(existing.startDate) >= new Date(existing.endDate)) {
      throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc giải đấu.');
    }

    if (!existing.registrationStartDate) {
      throw new BadRequestException('Vui lòng cấu hình ngày bắt đầu đăng ký trước khi công bố.');
    }

    if (!existing.registrationEndDate) {
      throw new BadRequestException('Vui lòng cấu hình ngày kết thúc đăng ký trước khi công bố.');
    }

    if (existing.registrationStartDate && existing.registrationEndDate &&
        new Date(existing.registrationStartDate) >= new Date(existing.registrationEndDate)) {
      throw new BadRequestException('Ngày mở đăng ký phải trước ngày đóng đăng ký.');
    }

    if (existing.registrationEndDate && existing.startDate &&
        new Date(existing.registrationEndDate) > new Date(existing.startDate)) {
      throw new BadRequestException('Ngày đóng đăng ký phải trước ngày khởi tranh.');
    }

    if (!existing.venueId) {
      throw new BadRequestException('Vui lòng cấu hình địa điểm thi đấu (sân đấu) trước khi công bố.');
    }

    // Kiểm tra có ít nhất 1 thông tin liên hệ (email hoặc số điện thoại)
    const contactInfo = existing.contactInfo as Record<string, unknown> | null | undefined;
    const hasContact = contactInfo && (
      (contactInfo.phone && typeof contactInfo.phone === 'string' && contactInfo.phone.trim() !== '') ||
      (contactInfo.email && typeof contactInfo.email === 'string' && contactInfo.email.trim() !== '') ||
      (contactInfo.phone && typeof contactInfo.phone === 'number')
    );
    if (!hasContact) {
      throw new BadRequestException('Vui lòng cập nhật ít nhất 1 thông tin liên hệ (email hoặc số điện thoại) trước khi công bố.');
    }

    if (existing.entryFee === undefined || existing.entryFee === null) {
      throw new BadRequestException('Vui lòng cấu hình lệ phí tham gia trước khi công bố giải đấu.');
    }

    // Kiểm tra có ít nhất 1 division
    const divisions = await this.tournamentsRepository.getDivisionsByTournament(id);
    if (!divisions || divisions.length === 0) {
      throw new BadRequestException('Vui lòng tạo ít nhất 1 nội dung thi đấu trước khi công bố.');
    }

    // Cập nhật banner/logo mặc định nếu thiếu
    if (Object.keys(updateData).length > 0) {
      await this.tournamentsRepository.update(id, userId, updateData);
    }

    const publishFee = await this.getPublishFee(existing.tournamentType, existing.isRanked);
    if (publishFee > 0) {
      throw new BadRequestException(`Vui lòng thanh toán phí công bố giải đấu ${publishFee.toLocaleString('vi-VN')}đ trước khi công bố.`);
    }

    // Xóa dữ liệu mock trước khi mở đăng ký
    await this.tournamentsRepository.clearMockParticipants(id);

    // Nếu chưa tới ngày mở đăng ký → UPCOMING, nếu tới rồi → REGISTRATION_OPEN
    const notYetOpen = existing.registrationStartDate && new Date(existing.registrationStartDate) > new Date();
    const targetStatus = existing.isRanked
      ? 'PENDING_APPROVAL'
      : notYetOpen
        ? 'UPCOMING'
        : 'REGISTRATION_OPEN';
    const updated = await this.tournamentsRepository.update(id, userId, { status: targetStatus });

    // Gửi thông báo cho người theo dõi khi giải mở đăng ký
    if (targetStatus === 'REGISTRATION_OPEN') {
      const followers = await this.tournamentsRepository.getFollowerUserIds(id);
      for (const followerId of followers) {
        await this.notificationsService.sendNotification({
          receiverId: followerId,
          type: 'TOURNAMENT_REGISTRATION_OPEN',
          title: `${existing.name} đã mở đăng ký`,
          content: `Giải đấu "${existing.name}" đã được công bố và mở đăng ký tham gia.`,
          redirectUrl: `/tournaments/${id}`,
        });
      }
    }

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

    // Kiem tra da co cau hinh mac dinh cho division chua
    const allDivs = await this.tournamentsRepository.getDivisionsByTournament(id);
    const category = await this.tournamentsRepository.findCategory(existing.categoryId);
    for (const d of allDivs) {
      if (!category) {
        throw new NotFoundException('Category not found');
      }

      const resolvedRules = resolveEffectiveSportRules({
        tournamentSportRules: existing.sportRules as Record<string, unknown> | null | undefined,
        categoryConfig: category.categoryConfig as Record<string, unknown> | null | undefined,
        categoryName: category.name,
        categorySlug: category.slug,
        stageRoundConfig: d.roundConfig as Record<string, unknown> | null | undefined,
      });
      if (resolvedRules.setsToWin < 1 || resolvedRules.pointsPerSet < 1) {
        throw new BadRequestException(
          'Vui lòng cấu hình luật thi đấu hợp lệ cho "' + d.name + '" trước khi chốt danh sách.',
        );
      }
    }

    const participants = await this.tournamentsRepository.findPublicParticipants(
      id,
      existing.categoryId,
    );
    if (participants.length < 2) {
      throw new BadRequestException('Need at least 2 participants to lock and generate bracket');
    }

    const totalPlayers = participants.reduce((sum, p) => sum + (p.members?.length || 0), 0);
    const entryFee = Number(existing.entryFee || 0);
    const platformFeePercentage = Number(existing.platformFeePercentage || 0);
    
    // 2-tier charging fee structure:
    // If entryFee >= 100k, charge platformFeePercentage (default 5%) of the entry fee.
    // If entryFee < 100k (including free tournaments), charge flat 5k.
    const feePerPlayer = calcPlatformFee(entryFee, platformFeePercentage);
    const totalPlatformFee = totalPlayers * feePerPlayer;

    const isClubOrFree = existing.tournamentType === 'CLUB' || totalPlatformFee === 0;
    const targetStatus = isClubOrFree ? 'UPCOMING' : 'REGISTRATION_CLOSED';

    // Sinh bracket trước, chỉ update status khi bracket generation thành công
    let bracket: unknown = null;
    try {
      bracket = await this.generateBracket(id, userId, systemRoles);
    } catch (err) {
      throw new BadRequestException('Failed to generate tournament bracket: ' + err.message);
    }

    const updated = await this.tournamentsRepository.update(id, userId, { status: targetStatus });

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

    if (data.roundConfig) {
      const category = await this.tournamentsRepository.findCategory(tournament.categoryId);
      if (!category) {
        throw new NotFoundException('Category not found');
      }

        validateSportRuleConfig(data.roundConfig as Record<string, unknown>, {
          expectedKind: inferExpectedSportRuleKind({
            categoryConfig: category.categoryConfig as Record<string, unknown> | null | undefined,
            categoryName: category.name,
            categorySlug: category.slug,
          }),
          allowedKinds: inferAllowedSportRuleKinds({
            categoryConfig: category.categoryConfig as Record<string, unknown> | null | undefined,
            categoryName: category.name,
            categorySlug: category.slug,
          }),
          sourceLabel: 'roundConfig',
          allowRoundMetadata: true,
        });
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

    if (tournament.status !== 'DRAFT') {
      throw new BadRequestException('Chỉ có thể tạo dữ liệu ảo khi giải đấu đang ở trạng thái Nháp.');
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

  async deleteMockParticipant(
    tournamentId: string,
    participantId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Tournament not found');

    if (tournament.status !== 'DRAFT' && tournament.status !== 'REGISTRATION_OPEN') {
      throw new BadRequestException('Chỉ có thể xoá dữ liệu giả lập ở trạng thái Nháp hoặc Đang mở đăng ký.');
    }

    const isAuthorized =
      systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to delete mock participants');
    }

    return this.tournamentsRepository.deleteMockParticipant(tournamentId, participantId);
  }

  async createPlayoffMatch(
    tournamentId: string,
    dto: { stageId: string; participant1Id: string; participant2Id: string },
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Tournament not found');

    let isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) isAuthorized = true;
    }
    if (!isAuthorized) throw new ForbiddenException();

    const stage = await this.tournamentsRepository.findStageById(dto.stageId);
    if (!stage || stage.tournamentId !== tournamentId) throw new NotFoundException('Stage not found');
    if (stage.type !== 'ROUND_ROBIN') throw new BadRequestException('Playoff only available for Round Robin stages');

    const { maxRound, maxOrder } = await this.tournamentsRepository.getMaxRoundAndMatchOrder(dto.stageId);
    const firstGroup = await this.tournamentsRepository.getGroupByStageId(dto.stageId);
    if (!firstGroup) throw new BadRequestException('No group found in this stage');

    return this.tournamentsRepository.createPlayoffMatch({
      tournamentId,
      stageId: dto.stageId,
      groupId: firstGroup.id,
      participant1Id: dto.participant1Id,
      participant2Id: dto.participant2Id,
      roundNumber: maxRound + 1,
      matchOrder: maxOrder + 1,
    });
  }

  async finalizeStage(
    tournamentId: string,
    stageId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Tournament not found');

    let isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) isAuthorized = true;
    }
    if (!isAuthorized) throw new ForbiddenException();

    const stage = await this.tournamentsRepository.findStageById(stageId);
    if (!stage || stage.tournamentId !== tournamentId) throw new NotFoundException('Stage not found');

    await this.tournamentsRepository.cancelScheduledMatchesInStage(stageId);
    return { message: 'Stage finalized successfully' };
  }

  async advanceStandings(
    tournamentId: string,
    divisionId: string,
    stageId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Tournament not found');

    let isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) isAuthorized = true;
    }
    if (!isAuthorized) throw new ForbiddenException();

    return this.bracketGeneratorService.advanceStandings(tournamentId, divisionId, stageId);
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

    if (status !== 'COMPLETE' && status !== 'REJECTED') {
      throw new BadRequestException('Chỉ hỗ trợ duyệt hoặc từ chối hồ sơ đăng ký.');
    }

    const participant = await this.tournamentsRepository.findParticipantById(participantId);
    if (!participant || participant.tournamentId !== tournamentId) {
      throw new NotFoundException('Participant not found');
    }

    if (participant.teamStatus !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        'Chỉ hồ sơ đang chờ duyệt mới được phép duyệt hoặc từ chối.',
      );
    }

    if (status === 'COMPLETE') {
      const division = participant.tournamentDivisionId
        ? await this.tournamentsRepository.findDivisionById(participant.tournamentDivisionId)
        : null;
      const entryFeeAmount = Number(division?.entryFee ?? tournament.entryFee ?? '0');

      if (entryFeeAmount > 0 && !participant.isPaid) {
        throw new BadRequestException(
          'Hồ sơ có lệ phí chưa thanh toán, không thể duyệt hoàn tất.',
        );
      }
    }

    const updated = await this.tournamentsRepository.updateParticipantStatus(participantId, status);
    if (!updated) {
      throw new NotFoundException('Participant not found');
    }

    try {
      const rosters = await this.tournamentsRepository.getParticipantRosters(participantId);
      for (const roster of rosters) {
        if (status === 'COMPLETE') {
          await this.notificationsService.sendNotification(
            buildParticipantRegistrationSuccessNotification({
              receiverId: roster.userId,
              tournamentId: tournament.id,
              tournamentName: tournament.name,
              divisionId: updated.tournamentDivisionId,
            }),
          );
        } else if (status === 'REJECTED') {
          await this.notificationsService.sendNotification(
            buildParticipantRegistrationRejectedNotification({
              receiverId: roster.userId,
              tournamentId: tournament.id,
              tournamentName: tournament.name,
              divisionId: updated.tournamentDivisionId,
            }),
          );
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
    divisionId?: string,
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
      throw new NotFoundException('Không tìm thấy tài khoản VNDC Sport cho người chơi thứ nhất');
    }

    let foundPartnerId: string | undefined = undefined;
    if (partnerEmailOrPhone) {
      const foundPartner = await this.tournamentsRepository.findUserByEmailOrPhone(partnerEmailOrPhone);
      if (!foundPartner) {
        throw new NotFoundException('Không tìm thấy tài khoản VNDC Sport cho đồng đội (người thứ 2)');
      }
      if (foundPartner.id === foundUser.id) {
        throw new BadRequestException('Tài khoản đồng đội phải khác tài khoản người chơi thứ nhất');
      }
      foundPartnerId = foundPartner.id;
    }

    const assignedParticipant = await this.tournamentsRepository.assignReservedSlot(
      tournamentId,
      foundUser.id,
      teamName,
      foundPartnerId,
      divisionId,
    );

    try {
      await this.notificationsService.sendNotification(
        buildReservedSlotAssignedNotification({
          receiverId: foundUser.id,
          tournamentId,
          tournamentName: tournament.name,
          divisionId: assignedParticipant.tournamentDivisionId,
        }),
      );

      if (foundPartnerId) {
        await this.notificationsService.sendNotification(
          buildReservedSlotAssignedNotification({
            receiverId: foundPartnerId,
            tournamentId,
            tournamentName: tournament.name,
            divisionId: assignedParticipant.tournamentDivisionId,
          }),
        );
      }
    } catch (err) {
      console.error('Failed to send reserved slot notification:', err);
    }

    return assignedParticipant;
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
    const result = await this.tournamentsRepository.kickParticipant(tournamentId, participantId, userId);

    try {
      for (const roster of rosters) {
        await this.notificationsService.sendNotification(
          buildParticipantKickedNotification({
            receiverId: roster.userId,
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            reason,
          }),
        );
      }
    } catch (err) {
      console.error('Failed to send notification for kickParticipant:', err);
    }

    return result;
  }

  async getOpsAuditLogs(
    tournamentId: string,
    userId: string,
    systemRoles: string[] = [],
    divisionId?: string,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    let isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;

    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to view operations audit logs');
    }

    return this.tournamentsRepository.findOpsAuditLogs(tournamentId, divisionId);
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

    const updatedTournament = await this.tournamentsRepository.cancelTournament(id);

    try {
      const participants = await this.tournamentsRepository.findParticipants(
        id,
        tournament.categoryId,
      );
      const notifications: Array<Promise<unknown>> = [];

      for (const participant of participants) {
        for (const member of participant.members || []) {
          notifications.push(
            this.notificationsService.sendNotification(
              buildTournamentCancelledNotification({
                receiverId: member.userId,
                tournamentId: id,
                tournamentName: tournament.name,
                divisionId: participant.tournamentDivisionId,
              }),
            ),
          );
        }
      }

      await this.sendNotificationBatch(notifications);
    } catch (err) {
      console.error('Failed to send cancelTournament notifications:', err);
    }

    return updatedTournament;
  }

  async getFeesConfig() {
    return this.tournamentsRepository.getFeesConfig();
  }

  private async getPublishFee(tournamentType?: string | null, isRanked?: boolean | null) {
    const fees = await this.getFeesConfig();
    if (tournamentType === 'CLUB') return fees.feeClub;
    return isRanked ? fees.feePublicRanked : fees.feePublicUnranked;
  }

  @Cron('*/5 * * * *')
  async handleRegistrationsTimeout() {
    try {
      const expiredList = await this.tournamentsRepository.processPendingRegistrationsTimeout();
      for (const item of expiredList) {
        await this.notificationsService.sendNotification(
          buildRegistrationTimeoutNotification({
            receiverId: item.leaderId,
            tournamentId: item.tournamentId,
            tournamentName: item.tournamentName,
            divisionId: item.divisionId,
          }),
        );
      }
    } catch (err) {
      console.error('Error handling registrations timeout cron:', err);
    }
  }

  // ──────── Staff ────────

  async findStaffByTournament(id: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Tournament not found');
    return this.tournamentsRepository.findStaffByTournament(id);
  }

  async addStaffMember(
    id: string,
    email: string,
    role: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Tournament not found');
    const isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized) throw new ForbiddenException();
    const userToInvite = await this.tournamentsRepository.findUserByEmail(email);
    if (!userToInvite) throw new NotFoundException('Khong tim thay tai khoan voi email nay.');
    return this.tournamentsRepository.addStaffMember(id, userToInvite.id, role, userId);
  }

  async removeStaffMember(
    id: string,
    staffUserId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Tournament not found');
    const isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized) throw new ForbiddenException();
    return this.tournamentsRepository.removeStaffMember(id, staffUserId);
  }

  async findReferees(id: string, userId: string, systemRoles: string[] = []) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const isAuthorized =
      systemRoles.includes('ADMIN') ||
      systemRoles.includes('ORGANIZER') ||
      tournament.createdBy === userId;

    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền xem danh sách trọng tài của giải đấu này');
    }

    return this.tournamentsRepository.findReferees(id);
  }

  async followTournament(id: string, userId: string) {
    return this.tournamentsRepository.followTournament(id, userId);
  }

  async unfollowTournament(id: string, userId: string) {
    await this.tournamentsRepository.unfollowTournament(id, userId);
  }

  // Public để các service khác (matches) gọi
  async getFollowerUserIds(tournamentId: string): Promise<string[]> {
    return this.tournamentsRepository.getFollowerUserIds(tournamentId);
  }

  async getFollowedTournaments(userId: string) {
    const rows = await this.tournamentsRepository.getFollowedTournaments(userId);
    return rows.map(row => this.mapTournamentFormat(row.tournaments));
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

      // Không cho phép thêm hình thức mới khi đang mở đăng ký
      if (
        tournament.status === 'REGISTRATION_OPEN' ||
        tournament.status === 'REGISTRATION_CLOSED'
      ) {
        throw new BadRequestException('Không thể thêm hình thức thi đấu khi giải đấu đang mở đăng ký');
      }

      const category = await this.tournamentsRepository.findCategory(tournament.categoryId);
      if (!category) {
        throw new NotFoundException('Category not found');
      }

      const categoryConfig = category.categoryConfig as CategoryConfig | null | undefined;
      this.validateMatchTypeAgainstCategory(categoryConfig, createDivisionDto.matchType, 'division');
      this.validateMatchTypeGenderRestriction(
        createDivisionDto.matchType,
        createDivisionDto.genderRestriction,
        'division',
      );

      if (createDivisionDto.roundConfig) {
        validateSportRuleConfig(createDivisionDto.roundConfig, {
          expectedKind: inferExpectedSportRuleKind({
            categoryConfig: category.categoryConfig as Record<string, unknown> | null | undefined,
            categoryName: category.name,
            categorySlug: category.slug,
          }),
          allowedKinds: inferAllowedSportRuleKinds({
            categoryConfig: category.categoryConfig as Record<string, unknown> | null | undefined,
            categoryName: category.name,
            categorySlug: category.slug,
          }),
          sourceLabel: 'roundConfig',
          allowRoundStructure: true,
          allowRoundMetadata: true,
        });
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
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
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

    const division = await this.tournamentsRepository.findDivisionById(divisionId);
    if (!division) {
      throw new NotFoundException('Division not found');
    }

    const tournament = await this.tournamentsRepository.findById(division.tournamentId);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const category = await this.tournamentsRepository.findCategory(tournament.categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const nextMatchType = updateDivisionDto.matchType ?? division.matchType;
    const nextGenderRestriction = updateDivisionDto.genderRestriction ?? division.genderRestriction;
    const categoryConfig = category.categoryConfig as CategoryConfig | null | undefined;
    this.validateMatchTypeAgainstCategory(categoryConfig, nextMatchType, 'division');
    this.validateMatchTypeGenderRestriction(nextMatchType, nextGenderRestriction, 'division');

    if (updateDivisionDto.roundConfig) {
      validateSportRuleConfig(updateDivisionDto.roundConfig, {
        expectedKind: inferExpectedSportRuleKind({
          categoryConfig: category.categoryConfig as Record<string, unknown> | null | undefined,
          categoryName: category.name,
          categorySlug: category.slug,
        }),
        allowedKinds: inferAllowedSportRuleKinds({
          categoryConfig: category.categoryConfig as Record<string, unknown> | null | undefined,
          categoryName: category.name,
          categorySlug: category.slug,
        }),
        sourceLabel: 'roundConfig',
        allowRoundStructure: true,
        allowRoundMetadata: true,
      });
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

    // Không cho đổi hình thức thi đấu khi đang mở đăng ký
    if (
      updateDivisionDto.matchType &&
      (tournament.status === 'REGISTRATION_OPEN' || tournament.status === 'REGISTRATION_CLOSED')
    ) {
      throw new BadRequestException('Không thể thay đổi hình thức thi đấu khi giải đấu đang mở đăng ký');
    }

    const currentDivision = await this.tournamentsRepository.findDivisionById(divisionId);
    if (!currentDivision) {
      throw new NotFoundException('Division not found');
    }

    const category = await this.tournamentsRepository.findCategory(tournament.categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const nextMatchType = updateDivisionDto.matchType ?? currentDivision.matchType;
    const nextGenderRestriction = updateDivisionDto.genderRestriction ?? currentDivision.genderRestriction;
    const categoryConfig = category.categoryConfig as CategoryConfig | null | undefined;
    this.validateMatchTypeAgainstCategory(categoryConfig, nextMatchType, 'division');
    this.validateMatchTypeGenderRestriction(nextMatchType, nextGenderRestriction, 'division');

    if (updateDivisionDto.roundConfig) {
      validateSportRuleConfig(updateDivisionDto.roundConfig, {
        expectedKind: inferExpectedSportRuleKind({
          categoryConfig: category.categoryConfig as Record<string, unknown> | null | undefined,
          categoryName: category.name,
          categorySlug: category.slug,
        }),
        allowedKinds: inferAllowedSportRuleKinds({
          categoryConfig: category.categoryConfig as Record<string, unknown> | null | undefined,
          categoryName: category.name,
          categorySlug: category.slug,
        }),
        sourceLabel: 'roundConfig',
        allowRoundStructure: true,
        allowRoundMetadata: true,
      });
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

  async addReferee(
    id: string,
    email: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const isAuthorized =
      systemRoles.includes('ADMIN') ||
      systemRoles.includes('ORGANIZER') ||
      tournament.createdBy === userId;

    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền mời trọng tài cho giải đấu này');
    }

    const userToInvite = await this.tournamentsRepository.findUserByEmail(email);
    if (!userToInvite) {
      throw new NotFoundException('Không tìm thấy tài khoản hệ thống với email đã nhập');
    }

    const existingReferee = await this.tournamentsRepository.findRefereeByTournamentAndUser(id, userToInvite.id);
    if (existingReferee?.status === 'INVITED') {
      throw new BadRequestException('Lời mời trọng tài này vẫn đang chờ người dùng phản hồi.');
    }
    if (existingReferee?.status === 'ACCEPTED') {
      throw new BadRequestException('Người dùng này đã là trọng tài đã xác nhận của giải.');
    }

    const invite = await this.tournamentsRepository.addReferee(id, userToInvite.id, userId);

    try {
      await this.notificationsService.sendNotification(
        buildRefereeInviteNotification({
          tournamentId: id,
          tournamentName: tournament.name,
          receiverId: userToInvite.id,
          refereeId: invite.id,
        }),
      );
    } catch (error) {
      console.error('Failed to send referee invite notification:', error);
    }

    return invite;
  }

  async respondToRefereeInvite(tournamentId: string, refereeId: string, userId: string, action: 'ACCEPT' | 'DECLINE') {
    const referee = await this.tournamentsRepository.findRefereeById(refereeId);
    if (!referee) throw new NotFoundException('Không tìm thấy lời mời trọng tài');
    if (referee.userId !== userId) throw new ForbiddenException('Bạn không phải người được mời');
    if (referee.status !== 'INVITED') throw new BadRequestException('Lời mời đã được phản hồi trước đó');

    const status = action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
    const [tournament, refereeUser] = await Promise.all([
      this.tournamentsRepository.findById(tournamentId),
      this.tournamentsRepository.findUserBasicById(userId),
    ]);

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const updatedReferee = await this.tournamentsRepository.updateRefereeStatus(refereeId, status);

    const organizerReceiverId = referee.assignedBy || tournament.createdBy;
    const refereeName = refereeUser?.fullName || refereeUser?.email || 'Trọng tài';

    if (organizerReceiverId) {
      try {
        await this.notificationsService.sendNotification(
          action === 'ACCEPT'
            ? buildRefereeInviteAcceptedNotification({
                tournamentId,
                tournamentName: tournament.name,
                receiverId: organizerReceiverId,
                refereeName,
              })
            : buildRefereeInviteDeclinedNotification({
                tournamentId,
                tournamentName: tournament.name,
                receiverId: organizerReceiverId,
                refereeName,
              }),
        );
      } catch (error) {
        console.error('Failed to send referee response notification:', error);
      }
    }

    return updatedReferee;
  }

  async revokeRefereeInvite(
    tournamentId: string,
    refereeId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const [tournament, referee] = await Promise.all([
      this.tournamentsRepository.findById(tournamentId),
      this.tournamentsRepository.findRefereeById(refereeId),
    ]);

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    if (!referee || referee.tournamentId !== tournamentId) {
      throw new NotFoundException('Không tìm thấy lời mời trọng tài');
    }

    const isAuthorized =
      systemRoles.includes('ADMIN') ||
      systemRoles.includes('ORGANIZER') ||
      tournament.createdBy === userId;

    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền thu hồi lời mời trọng tài của giải đấu này');
    }

    if (referee.status !== 'INVITED') {
      throw new BadRequestException('Chỉ có thể thu hồi lời mời đang chờ phản hồi.');
    }

    const removedInvite = await this.tournamentsRepository.removeRefereeInvite(refereeId);

    await this.notificationsService.deleteByReceiverTypeAndRedirect(
      referee.userId,
      'REFEREE_INVITED',
      `/notifications?action=referee-invite&tournamentId=${tournamentId}&refereeId=${refereeId}`,
    );

    try {
      await this.notificationsService.sendNotification(
        buildRefereeInviteRevokedNotification({
          tournamentId,
          tournamentName: tournament.name,
          receiverId: referee.userId,
        }),
      );
    } catch (error) {
      console.error('Failed to send referee revoked notification:', error);
    }

    return removedInvite;
  }
}
