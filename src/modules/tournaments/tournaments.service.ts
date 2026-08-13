import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isDeepStrictEqual } from 'node:util';
import { TournamentsRepository } from './tournaments.repository';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { CreateLiteTournamentDto } from './dto/create-lite-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { RegisterTournamentDto } from './dto/register-tournament.dto';
import { PairLiteParticipantsDto } from './dto/pair-lite-participants.dto';
import { GenerateLitePairsDto } from './dto/generate-lite-pairs.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CreateParentTournamentDto } from './dto/create-parent-tournament.dto';
import { UpdateParentTournamentDto } from './dto/update-parent-tournament.dto';
import { BracketGeneratorService } from './bracket-generator.service';
import { CategoryConfig, TournamentConfig } from './interfaces/tournament-config.interface';
import { EloCapViolationException } from './exceptions/elo-cap-violation.exception';
import * as schema from '../../database/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { Cron } from '@nestjs/schedule';
import { calcPlatformFee } from '../../common/helpers/platform-fee.helper';
import { CreateDivisionDto, GenderRestriction } from './dto/create-division.dto';
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
  buildPartnerInviteAcceptedNotification,
  buildPartnerInviteCancelledNotification,
  buildPartnerInviteReceivedNotification,
  buildPartnerInviteRejectedNotification,
  buildRefereeInviteAcceptedNotification,
  buildRefereeInviteDeclinedNotification,
  buildRefereeInviteNotification,
  buildRefereeInviteRevokedNotification,
  buildReservedSlotAssignedNotification,
  buildRegistrationCancelledFullNotification,
  buildRegistrationTimeoutNotification,
  buildStaffAddedNotification,
  buildTournamentCancelledNotification,
} from '../notifications/notification-builder';
import { RedisService } from '../../providers/redis/redis.service';
import { StorageService } from '../../providers/storage/storage.service';
import { isStoredImageUrl, extractStoredImagePublicId } from '../../common/helpers/cloudinary.helper';

@Injectable()
export class TournamentsService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly bracketGeneratorService: BracketGeneratorService,
    private readonly notificationsService: NotificationsService,
    private readonly storageService: StorageService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Kiểm tra quyền quản lý giải đấu: ADMIN / ORGANIZER hệ thống,
   * chủ giải (createdBy) hoặc đồng tổ chức (CO_ORGANIZER trong tournamentStaff).
   */
  private async isManager(
    tournament: { id: string; createdBy: string | null; communityId?: string | null },
    userId: string,
    systemRoles: string[] = [],
  ): Promise<boolean> {
    if (systemRoles.includes('ADMIN')) return true;
    if (tournament.createdBy === userId) return true;
    if (await this.tournamentsRepository.isCoOrganizer(tournament.id, userId)) return true;
    if (!tournament.communityId) return false;
    const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
    return member?.status === 'JOINED' && ['OWNER', 'MODERATOR'].includes(member.role);
  }

  private isSystemTournamentCreator(systemRoles: string[] = []): boolean {
    return systemRoles.includes('ADMIN') || systemRoles.includes('ORGANIZER');
  }

  private async assertCommunityTournamentCreator(communityId: string, userId: string, systemRoles: string[] = []) {
    if (systemRoles.includes('ADMIN')) return;
    const member = await this.tournamentsRepository.findCommunityMember(communityId, userId);
    if (!member || member.status !== 'JOINED' || !['OWNER', 'MODERATOR'].includes(member.role)) {
      throw new ForbiddenException('Chỉ Chủ CLB hoặc Quản trị viên CLB mới có thể tạo giải thuộc CLB.');
    }
  }

  private async sendNotificationBatch(notifications: Array<Promise<unknown>>) {
    await Promise.all(notifications);
  }

  private async assertEntryFeeAllowed(entryFee: number | null | undefined) {
    if (!entryFee || entryFee <= 0) {
      return;
    }

    const feesConfig = await this.tournamentsRepository.getFeesConfig();
    if (feesConfig.allowEntryFees === false) {
      throw new BadRequestException(
        'Hệ thống hiện không cho phép ban tổ chức đặt lệ phí đăng ký. Vui lòng để lệ phí là 0đ.',
      );
    }
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

  /** Keep the public banner flag stable for Web/App clients. */
  private mapPublicTournament<T extends { tournamentConfig?: unknown }>(
    tournament: T,
  ): T & { hideFeaturedCardText: boolean } {
    const config = tournament.tournamentConfig;
    const hideFeaturedCardText =
      typeof config === 'object' && config !== null && !Array.isArray(config)
        ? (config as Record<string, unknown>).hideFeaturedCardText === true
        : false;

    return { ...tournament, hideFeaturedCardText };
  }

  private validateRegistrationMode(config: unknown) {
    if (!config || typeof config !== 'object') return;

    const registrationMode = (config as Record<string, unknown>).registrationMode;
    if (registrationMode !== undefined) {
      if (typeof registrationMode !== 'string' || !['OPEN', 'APPROVAL', 'INVITE_ONLY'].includes(registrationMode)) {
        throw new BadRequestException(
          'Chế độ đăng ký phải là một trong: OPEN, APPROVAL, INVITE_ONLY',
        );
      }
    }
  }

  async findAll(query: QueryTournamentDto) {
    const cacheKey = `tournaments:list:${JSON.stringify(query)}`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      // Redis down — ignore cache, fall through to DB
    }

    const result = await this.tournamentsRepository.findAll({
      ...query,
      visibility: 'PUBLIC',
      createdBy: undefined,
    }, {
      defaultTournamentType: null,
      defaultVisibility: 'PUBLIC',
    });
    result.data = result.data
      .filter((t) => !['DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED', 'PENDING_DELETE'].includes(t.status))
      .map(t => this.mapTournamentFormat(t));

    try {
      await this.redisService.set(cacheKey, JSON.stringify(result), 60);
    } catch (e) {
      // Redis down — ignore
    }

    return result;
  }

  async findPublic(query: QueryTournamentDto) {
    // Lấy tất cả tournament hiển thị công khai trên app/web:
    // Mặc định lọc các giải đấu PUBLIC để ẩn giải đấu PRIVATE khỏi trang chủ
    const result = await this.tournamentsRepository.findAll({
      ...query,
      tournamentType: 'PUBLIC',
      visibility: 'PUBLIC',
      createdBy: undefined,
    }, {
      defaultTournamentType: 'PUBLIC',
      defaultVisibility: 'PUBLIC',
    });
    result.data = result.data
      .filter((t) => !['DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED', 'PENDING_DELETE'].includes(t.status))
      .map(t => this.mapPublicTournament(this.mapTournamentFormat(t)));
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
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    const isOwner = userId && tournament.createdBy === userId;
    const isAdmin = systemRoles.includes('ADMIN');

    if (['DRAFT', 'PENDING_APPROVAL', 'PENDING_DELETE'].includes(tournament.status) && !isOwner && !isAdmin) {
      throw new NotFoundException('Giải đấu không tồn tại');
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
    // 0. Hard limit check: Max 100 tournaments per creator (except ADMIN)
    const isAdmin = systemRoles.includes('ADMIN');
    if (!isAdmin) {
      const createdCount = await this.tournamentsRepository.countCreatedTournaments(userId);
      if (createdCount >= 100) {
        throw new BadRequestException('Bạn đã đạt giới hạn tối đa 100 giải đấu được phép tạo.');
      }
    }

    this.validateRegistrationMode(createTournamentDto.tournamentConfig);
    await this.assertEntryFeeAllowed(createTournamentDto.entryFee);

    // 1. Validate category existence and sportRules default fallback
    const category = await this.tournamentsRepository.findCategory(createTournamentDto.categoryId);
    if (!category) {
      throw new NotFoundException('Hạng đấu không tồn tại');
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
        throw new BadRequestException('Ngày kết thúc đăng ký phải sau ngày bắt đầu đăng ký');
      }
    }
    if (createTournamentDto.startDate && createTournamentDto.endDate) {
      const tStart = new Date(createTournamentDto.startDate);
      const tEnd = new Date(createTournamentDto.endDate);
      if (tEnd <= tStart) {
        throw new BadRequestException('Ngày kết thúc giải đấu phải sau ngày bắt đầu');
      }
    }
    if (createTournamentDto.registrationEndDate && createTournamentDto.startDate) {
      const regEnd = new Date(createTournamentDto.registrationEndDate);
      const tStart = new Date(createTournamentDto.startDate);
      if (tStart < regEnd) {
        throw new BadRequestException('Ngày bắt đầu giải đấu phải sau hoặc bằng ngày kết thúc đăng ký');
      }
    }

    if (createTournamentDto.communityId && createTournamentDto.tournamentType !== 'CLUB') {
      throw new BadRequestException('Giải gắn với CLB phải có loại CLUB.');
    }

    // 3. CLUB vs PUBLIC validation rules & authorization
    const isSystemAuthorized = this.isSystemTournamentCreator(systemRoles);

    if (createTournamentDto.tournamentType === 'CLUB') {
      if (!createTournamentDto.communityId) {
        throw new BadRequestException('Giải đấu của câu lạc bộ phải thuộc một cộng đồng');
      }
      if (createTournamentDto.entryFee && createTournamentDto.entryFee > 0) {
        throw new BadRequestException('Giải đấu của câu lạc bộ phải miễn phí');
      }
      if (createTournamentDto.galleryImages && createTournamentDto.galleryImages.length > 0) {
        throw new BadRequestException('Giải đấu của câu lạc bộ không được có ảnh thư viện khi tạo');
      }

      // Authorization for club tournament creation: System Admin/Organizer OR community Owner/Admin/Moderator
      if (!systemRoles.includes('ADMIN')) {
        const member = await this.tournamentsRepository.findCommunityMember(
          createTournamentDto.communityId,
          userId,
        );
        if (
          !member ||
          !['OWNER', 'MODERATOR'].includes(member.role) ||
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

    // Invalidate tournament list cache
    try {
      await this.redisService.delByPattern('tournaments:list:*');
      await this.redisService.delByPattern('matches:list:*');
    } catch (e) {
      // Redis down — ignore
    }

    return this.mapTournamentFormat(record);
  }


  private buildLiteSportPreset(sport: string): { sportPreset: string; sportRules: Record<string, unknown> } {
    switch (sport) {
      case 'pickleball':
        return { sportPreset: 'PICKLEBALL_STANDARD', sportRules: { kind: 'PICKLEBALL', setsToWin: 2, pointsPerSet: 11, winByTwo: true } };
      case 'badminton':
        return { sportPreset: 'BADMINTON_STANDARD', sportRules: { kind: 'BADMINTON', setsToWin: 2, pointsPerSet: 21, winByTwo: true } };
      case 'table_tennis':
        return { sportPreset: 'TABLE_TENNIS_STANDARD', sportRules: { kind: 'TABLE_TENNIS', setsToWin: 3, pointsPerSet: 11, winByTwo: true } };
      case 'tennis':
        return { sportPreset: 'TENNIS_SUPER_TIEBREAK', sportRules: { kind: 'TENNIS', setsToWin: 1, pointsPerSet: 10, winByTwo: true } };
      default:
        throw new BadRequestException('Môn thể thao không hợp lệ. Vui lòng chọn một môn được hỗ trợ.');
    }
  }

  async createLite(userId: string, dto: CreateLiteTournamentDto, systemRoles: string[] = []) {
    // 0. Hard limit check: Max 100 tournaments per creator (except ADMIN)
    const isAdmin = systemRoles.includes('ADMIN');
    if (!isAdmin) {
      const createdCount = await this.tournamentsRepository.countCreatedTournaments(userId);
      if (createdCount >= 100) {
        throw new BadRequestException('Bạn đã đạt giới hạn tối đa 100 giải đấu được phép tạo.');
      }
    }

    const sport = dto.sport?.trim().toLowerCase();
    if (!sport) {
      throw new BadRequestException('Vui lòng chọn môn thể thao trước khi tạo giải.');
    }

    // 1. Map sport slug → category
    const category = await this.tournamentsRepository.findCategoryBySlug(sport);
    if (!category) {
      throw new BadRequestException(`Môn thể thao "${sport}" không được hỗ trợ`);
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

    // 4. Resolve bracketType — only allow known Lite types, reject unknown with 400
    const bracketType = dto.bracketType || 'single_elimination';
    const bracketTypeMap: Record<string, string> = {
      'single_elimination': 'SINGLE_ELIMINATION',
      'double_elimination': 'DOUBLE_ELIMINATION',
      'round_robin': 'ROUND_ROBIN',
      'group_stage_knockout': 'GROUP_STAGE_KNOCKOUT',
    };
    const finalBracketType = bracketTypeMap[bracketType];
    if (!finalBracketType) {
      throw new BadRequestException(
        `Thể thức "${bracketType}" không được hỗ trợ. Chấp nhận: ${Object.keys(bracketTypeMap).join(', ')}.`,
      );
    }

    // 5. Build Lite sport preset + rules
    const litePreset = this.buildLiteSportPreset(sport);
    const sportRules = { ...litePreset.sportRules };

    // 6. Build Lite tournamentConfig shared by App/Web
    const maxTeams = dto.maxTeams || 16;
    const registrationMode = dto.registrationMode || 'OPEN';
    const tournamentConfig = {
      mode: 'LITE',
      // Cờ loại giải: giải lite thật (nhanh) — KHÁC với mode scoring LITE.
      // mode chỉ còn mang nghĩa cách tính điểm (LITE/STRICT).
      isLite: true,
      sportPreset: litePreset.sportPreset,
      registrationMode,
      liteJoinPolicy: 'COMMUNITY_MEMBERS',
      liteVisibility: 'COMMUNITY',
      bracketSetupMode: 'RANDOM',
      allowPlayerReferee: true,
      hideAdvancedSettings: true,
      bracketType: finalBracketType,
      maxTeams,
    };

    // 7. Check authorization: must be community member (JOINED)
    if (!systemRoles.includes('ADMIN')) {
      const member = await this.tournamentsRepository.findCommunityMember(dto.communityId, userId);
      if (!member || member.status !== 'JOINED' || !['OWNER', 'MODERATOR'].includes(member.role)) {
        throw new ForbiddenException('Bạn phải là thành viên của câu lạc bộ để tạo giải đấu.');
      }
    }

    // 8. Tạo CreateTournamentDto từ dữ liệu Lite
    const fullDto = new CreateTournamentDto();
    Object.assign(fullDto, {
      name: dto.name,
      tournamentType: 'CLUB',
      visibility: 'PRIVATE',
      communityId: dto.communityId,
      categoryId: category.id,
      matchType,
      description: dto.description || '',
      maxParticipants: maxTeams,
      entryFee: 0,
      isRanked: dto.isRanked ?? false,
      sportRules,
      tournamentConfig,
      startDate: dto.startDate || undefined,
      city: dto.location || undefined,
    });

    // 9. Gọi repository.create() — dùng chung logic insert
    const record = await this.tournamentsRepository.create(userId, fullDto);

    // 10. Auto-publish: set status REGISTRATION_OPEN để đăng ký & bracket được luôn
    const updated = await this.tournamentsRepository.update(record.id, userId, {
      status: 'REGISTRATION_OPEN',
    });

    const inviteCode = updated.inviteCode ?? record.inviteCode;

    // Invalidate tournament list cache
    try {
      await this.redisService.delByPattern('tournaments:list:*');
      await this.redisService.delByPattern('matches:list:*');
    } catch (e) {
      // Redis down — ignore
    }

    // Build absolute joinUrl + qrPayload using FRONTEND_URL
    const frontendUrl = (this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001').replace(/\/+$/, '');
    const joinPath = `/lite/tournaments/join/${inviteCode}`;

    return {
      id: record.id,
      name: record.name,
      status: 'REGISTRATION_OPEN',
      inviteCode,
      joinUrl: `${frontendUrl}${joinPath}`,
      qrPayload: `${frontendUrl}${joinPath}`,
    };
  }

  async getLiteJoinStatus(inviteCode: string, userId?: string) {
    const tournament = await this.tournamentsRepository.findByInviteCode(inviteCode);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    // Reject non-Lite invite codes
    const tCfg = (tournament.tournamentConfig || {}) as Record<string, unknown>;
    if (tCfg.isLite !== true) {
      throw new BadRequestException('Mã mời không phải của giải đấu Lite.');
    }

    if (tournament.status === 'DRAFT') throw new NotFoundException('Giải chưa được công bố');
    if (tournament.status === 'CANCELLED') throw new NotFoundException('Giải đã bị hủy');

    const t = this.mapTournamentFormat(tournament);

    // Lấy category name
    let categoryName: string | undefined;
    if (t.categoryId) {
      const cat = await this.tournamentsRepository.findCategory(t.categoryId);
      categoryName = cat?.name;
    }

    const base = {
      tournament: {
        id: t.id,
        name: t.name,
        status: t.status,
        category: categoryName,
        matchType: t.matchType,
        maxParticipants: t.maxParticipants,
      },
    };

    if (!userId) return { ...base, requiresAuth: true };

    // Registration date check
    const now = new Date();
    if (tournament.registrationStartDate && now < tournament.registrationStartDate) {
      return { ...base, registrationNotOpen: true };
    }
    if (tournament.registrationEndDate && now > tournament.registrationEndDate) {
      return { ...base, registrationClosed: true };
    }

    // Check club membership
    if (tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
      if (!member) {
        const community = await this.tournamentsRepository.findCommunityById(tournament.communityId);
        return {
          ...base,
          requiresClubJoin: true,
          communityId: tournament.communityId,
          communityName: community?.name || '',
          clubPolicy: community?.joinMode || 'OPEN',
        };
      }
      if (member.status === 'PENDING') {
        return { ...base, clubJoinPending: true };
      }
      if (member.status !== 'JOINED') {
        const community = await this.tournamentsRepository.findCommunityById(tournament.communityId);
        return {
          ...base,
          requiresClubJoin: true,
          communityId: tournament.communityId,
          communityName: community?.name || '',
          clubPolicy: community?.joinMode || 'OPEN',
        };
      }
    }

    // Already joined?
    const participant = await this.tournamentsRepository.findParticipantByTournamentAndUser(tournament.id, userId);
    if (participant) return { ...base, alreadyJoined: true, participantId: participant.id };

    // Registration closed?
    if (tournament.status === 'REGISTRATION_CLOSED' || tournament.status === 'UPCOMING' || tournament.status === 'IN_PROGRESS' || tournament.status === 'COMPLETED') {
      return { ...base, registrationClosed: true };
    }

    // Full — count active roster users; maxSlots depends on matchType
    if (tournament.maxParticipants) {
      const isDoubles = t.matchType === 'DOUBLES' || t.matchType === 'MIXED_DOUBLES';
      const maxSlots = isDoubles ? tournament.maxParticipants * 2 : tournament.maxParticipants;
      const activeUserCount = await this.tournamentsRepository.countLiteActiveRosterUsers(tournament.id);
      if (activeUserCount >= maxSlots) return { ...base, tournamentFull: true };
    }

    return { ...base, canJoin: true };
  }

  async joinLite(inviteCode: string, userId: string) {
    const tournament = await this.tournamentsRepository.findByInviteCode(inviteCode);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    // Reject non-Lite invite codes
    const tCfg = (tournament.tournamentConfig || {}) as Record<string, unknown>;
    if (tCfg.isLite !== true) {
      throw new BadRequestException('Mã mời không phải của giải đấu Lite.');
    }

    if (tournament.status !== 'REGISTRATION_OPEN') throw new BadRequestException('Giải không đang mở đăng ký');

    // Registration date check
    const now = new Date();
    if (tournament.registrationStartDate && now < tournament.registrationStartDate) {
      throw new BadRequestException('Thời gian đăng ký chưa bắt đầu.');
    }
    if (tournament.registrationEndDate && now > tournament.registrationEndDate) {
      throw new BadRequestException('Thời gian đăng ký đã kết thúc.');
    }

    // Check club membership
    if (tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
      if (!member) throw new ForbiddenException('Bạn chưa là thành viên câu lạc bộ');
      if (member.status === 'PENDING') throw new ForbiddenException('Yêu cầu vào CLB đang chờ duyệt');
      if (member.status !== 'JOINED') throw new ForbiddenException('Bạn chưa là thành viên câu lạc bộ');
    }

    // Already joined?
    const existing = await this.tournamentsRepository.findParticipantByTournamentAndUser(tournament.id, userId);
    if (existing) throw new BadRequestException('Bạn đã tham gia giải này');

    // Full — count active roster users; maxSlots depends on matchType
    if (tournament.maxParticipants) {
      const isDoubles = tournament.matchType === 'DOUBLES' || tournament.matchType === 'MIXED_DOUBLES';
      const maxSlots = isDoubles ? tournament.maxParticipants * 2 : tournament.maxParticipants;
      const activeUserCount = await this.tournamentsRepository.countLiteActiveRosterUsers(tournament.id);
      if (activeUserCount >= maxSlots) throw new BadRequestException('Giải đã đủ số lượng người tham gia.');
    }

    // Get user name
    const profile = await this.tournamentsRepository.findUserProfile(userId);
    const name = profile?.fullName || 'Vận động viên';

    // Register (capacity check is inside registerParticipant's transaction, FOR UPDATE)
    const result = await this.tournamentsRepository.registerParticipant(
      tournament.id, userId, { teamName: name }, inviteCode,
    );

    return { id: result.participant.id, name, status: result.participant.teamStatus, tournamentId: tournament.id };
  }

  async update(id: string, userId: string, updateTournamentDto: UpdateTournamentDto, systemRoles: string[] = []) {
    this.validateRegistrationMode(updateTournamentDto.tournamentConfig);

    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Giải đấu không tồn tại');
    const existingConfig = (existing.tournamentConfig || {}) as Record<string, unknown>;
    const incomingConfigPatch = updateTournamentDto.tournamentConfig;

    const categoryId = updateTournamentDto.categoryId ?? existing.categoryId;
    const category = await this.tournamentsRepository.findCategory(categoryId);
    if (!category) {
      throw new NotFoundException('Hạng đấu không tồn tại');
    }

    // ADMIN, ORGANIZER, chủ giải hoặc đồng tổ chức (CO_ORGANIZER) có thể cập nhật
    let canUpdate = await this.isManager(existing, userId, systemRoles);

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
      throw new ForbiddenException('Bạn không có quyền cập nhật giải đấu này');
    }

    const isAdmin = systemRoles.includes('ADMIN');
    if (updateTournamentDto.status !== undefined && !isAdmin) {
      throw new ForbiddenException('Trạng thái giải chỉ được thay đổi qua các thao tác nghiệp vụ hoặc bởi Quản trị viên.');
    }
    if (
      updateTournamentDto.visibility === 'PUBLIC' &&
      existing.visibility !== 'PUBLIC' &&
      existing.status !== 'DRAFT' &&
      !isAdmin
    ) {
      throw new BadRequestException('Muốn công khai giải nội bộ, hãy đưa giải về bản nháp và công bố để chờ Quản trị viên xét duyệt.');
    }

    await this.assertEntryFeeAllowed(updateTournamentDto.entryFee);

    // Validations during update based on tournament lifecycle status
    if (existing.status !== 'DRAFT') {
      const lockedCoreFields: (keyof UpdateTournamentDto)[] = [
        'matchType', 'categoryId', 'entryFee', 'platformFeePercentage', 'isRanked'
      ];
      for (const field of lockedCoreFields) {
        if (updateTournamentDto[field] !== undefined && updateTournamentDto[field] !== (existing as Record<string, unknown>)[field]) {
          throw new BadRequestException('Không thể thay đổi trường cốt lõi sau khi giải được xuất bản');
        }
      }
      // Check tournamentConfig core fields
      if (incomingConfigPatch) {
        const configCoreFields = ['bracketType', 'minElo', 'maxElo', 'maxCombinedElo', 'maxTeammateGap'];
        for (const key of configCoreFields) {
          if (
            incomingConfigPatch[key] !== undefined &&
            !isDeepStrictEqual(incomingConfigPatch[key], existingConfig[key])
          ) {
            throw new BadRequestException(`Không thể sửa khóa cấu hình giải đấu '${key}' sau khi giải được xuất bản`);
          }
        }
      }
    }

    if (existing.status === 'IN_PROGRESS' || existing.status === 'COMPLETED') {
      const unsafeFields: (keyof UpdateTournamentDto)[] = [
        'matchType', 'maxParticipants', 'categoryId',
        'entryFee', 'platformFeePercentage', 'registrationStartDate', 'registrationEndDate',
        'sportRules', 'isRanked'
      ];
      for (const field of unsafeFields) {
        if (updateTournamentDto[field] !== undefined && updateTournamentDto[field] !== (existing as Record<string, unknown>)[field]) {
          throw new BadRequestException(`Không thể sửa trường '${field}' khi giải đấu đang diễn ra hoặc đã kết thúc`);
        }
      }

      if (incomingConfigPatch) {
        const changedUnsafeConfigKey = Object.keys(incomingConfigPatch).find(
          (key) =>
            key !== 'hideFeaturedCardText' &&
            !isDeepStrictEqual(incomingConfigPatch[key], existingConfig[key]),
        );
        if (changedUnsafeConfigKey) {
          throw new BadRequestException(
            `Không thể sửa khóa cấu hình giải đấu '${changedUnsafeConfigKey}' khi giải đang diễn ra hoặc đã kết thúc`,
          );
        }
      }
    }

    if (incomingConfigPatch) {
      updateTournamentDto.tournamentConfig = {
        ...existingConfig,
        ...incomingConfigPatch,
      };
    }

    const regStartVal = updateTournamentDto.registrationStartDate !== undefined
      ? (updateTournamentDto.registrationStartDate ? new Date(updateTournamentDto.registrationStartDate) : null)
      : (existing.registrationStartDate ? new Date(existing.registrationStartDate) : null);

    const regEndVal = updateTournamentDto.registrationEndDate !== undefined
      ? (updateTournamentDto.registrationEndDate ? new Date(updateTournamentDto.registrationEndDate) : null)
      : (existing.registrationEndDate ? new Date(existing.registrationEndDate) : null);

    if (regStartVal && regEndVal && regEndVal <= regStartVal) {
      throw new BadRequestException('Ngày kết thúc đăng ký phải sau ngày bắt đầu đăng ký');
    }

    const tStartVal = updateTournamentDto.startDate !== undefined
      ? (updateTournamentDto.startDate ? new Date(updateTournamentDto.startDate) : null)
      : (existing.startDate ? new Date(existing.startDate) : null);

    const tEndVal = updateTournamentDto.endDate !== undefined
      ? (updateTournamentDto.endDate ? new Date(updateTournamentDto.endDate) : null)
      : (existing.endDate ? new Date(existing.endDate) : null);

    if (tStartVal && tEndVal && tEndVal <= tStartVal) {
      throw new BadRequestException('Ngày kết thúc giải đấu phải sau ngày bắt đầu');
    }

    if (tStartVal && regEndVal && tStartVal < regEndVal) {
      throw new BadRequestException('Ngày bắt đầu giải đấu phải sau hoặc bằng ngày kết thúc đăng ký');
    }

    if (updateTournamentDto.entryFee && existing.tournamentType === 'CLUB' && updateTournamentDto.entryFee > 0) {
      throw new BadRequestException('Giải đấu của câu lạc bộ phải luôn miễn phí');
    }

    if (updateTournamentDto.entryFee && existing.tournamentType === 'PUBLIC' && updateTournamentDto.entryFee > 0 && updateTournamentDto.entryFee < 100000) {
      throw new BadRequestException('Minimum entry fee for paid public tournaments is 100,000đ');
    }

    const categoryConfig = category.categoryConfig as CategoryConfig | null | undefined;
    const finalMatchType = updateTournamentDto.matchType ?? existing.matchType;
    let finalGenderRestriction = updateTournamentDto.genderRestriction !== undefined ? updateTournamentDto.genderRestriction : existing.genderRestriction;

    // Auto-heal corrupted gender restriction in database
    if (finalMatchType === 'MIXED_DOUBLES' && finalGenderRestriction !== 'MIXED') {
      finalGenderRestriction = GenderRestriction.MIXED;
      updateTournamentDto.genderRestriction = GenderRestriction.MIXED; // ensure it overwrites corrupted DB state
    } else if ((finalMatchType === 'SINGLES' || finalMatchType === 'DOUBLES') && finalGenderRestriction === 'MIXED') {
      finalGenderRestriction = null;
      updateTournamentDto.genderRestriction = null;
    }

    this.validateMatchTypeAgainstCategory(
      categoryConfig,
      finalMatchType,
      'tournament',
    );
    this.validateMatchTypeGenderRestriction(
      finalMatchType,
      finalGenderRestriction,
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

    // Invalidate tournament list cache
    try {
      await this.redisService.delByPattern('tournaments:list:*');
      await this.redisService.delByPattern('matches:list:*');
    } catch (e) {
      // Redis down — ignore
    }

    return this.mapTournamentFormat(updated);
  }

  async remove(id: string, userId: string, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Giải đấu không tồn tại');

    if (existing.parentId) {
      const siblings = await this.tournamentsRepository.findByParentId(existing.parentId);
      if (siblings.length <= 1) {
        throw new BadRequestException(
          'Không thể xóa hình thức thi đấu cuối cùng của giải đấu. Nếu muốn xóa toàn bộ giải đấu, vui lòng xóa Giải đấu lớn.'
        );
      }
    }

    // Check permissions
    let hasPermission = await this.isManager(existing, userId, systemRoles);

    if (!hasPermission && existing.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        existing.communityId,
        userId,
      );
      if (member && member.role === 'OWNER') {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      throw new ForbiddenException('Bạn không có quyền xóa giải đấu này');
    }

    // Check payment safety before allowing deletion
    const paidPayments = await this.tournamentsRepository.countPaidPayments(id);
    const pendingRefunds = await this.tournamentsRepository.countPendingRefunds(id);
    const fullyRefunded = await this.tournamentsRepository.isFullyRefunded(id);

    if (paidPayments > 0 && !fullyRefunded) {
      throw new BadRequestException(
        `Giải đấu có ${paidPayments} thanh toán đã thành công chưa được hoàn tiền. ` +
        `Vui lòng hoàn tiền trước khi xóa giải đấu.`,
      );
    }

    if (pendingRefunds > 0) {
      throw new BadRequestException(
        `Giải đấu có ${pendingRefunds} giao dịch đang chờ hoàn tiền. ` +
        `Vui lòng hoàn thành hoàn tiền trước khi xóa.`,
      );
    }

    // Completed tournaments remain available for club history and ELO audit.
    // Archive is intentionally non-destructive: matches and ELO history stay intact.
    if (existing.status === 'COMPLETED') {
      const archived = await this.tournamentsRepository.archive(id, userId);
      try {
        await this.redisService.delByPattern('tournaments:list:*');
      await this.redisService.delByPattern('matches:list:*');
      } catch (e) {
        // Redis down - ignore
      }
      return {
        ...archived,
        archived: true,
        message: 'Giải đã hoàn thành được lưu trữ để giữ lịch sử giải đấu và ELO.',
      };
    }

    // If System ADMIN, delete immediately
    if (systemRoles.includes('ADMIN')) {
      await this.cleanupTournamentImages(existing);
      const result = await this.tournamentsRepository.softDelete(id, userId);
      // Invalidate tournament list cache
      try {
        await this.redisService.delByPattern('tournaments:list:*');
      await this.redisService.delByPattern('matches:list:*');
      } catch (e) {
        // Redis down — ignore
      }
      return result;
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
    const result = await this.tournamentsRepository.softDelete(id, userId);

    // Invalidate tournament list cache
    try {
      await this.redisService.delByPattern('tournaments:list:*');
      await this.redisService.delByPattern('matches:list:*');
    } catch (e) {
      // Redis down — ignore
    }

    return result;
  }

  async removeParent(id: string, userId: string, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findParentById(id);
    if (!existing) throw new NotFoundException('Giải đấu cha không tồn tại');

    // System ADMIN or creator can delete parent tournament
    const canDelete = await this.isManager(existing, userId, systemRoles);
    if (!canDelete) {
      throw new ForbiddenException('Bạn không có quyền xóa giải đấu lớn này');
    }

    // Check payment safety across all child tournaments before allowing deletion
    const divisions = await this.tournamentsRepository.findByParentId(id);
    for (const div of divisions) {
      const paidPayments = await this.tournamentsRepository.countPaidPayments(div.id);
      const pendingRefunds = await this.tournamentsRepository.countPendingRefunds(div.id);
      const fullyRefunded = await this.tournamentsRepository.isFullyRefunded(div.id);

      if (paidPayments > 0 && !fullyRefunded) {
        throw new BadRequestException(
          `Hình thức "${div.name}" có ${paidPayments} thanh toán đã thành công chưa được hoàn tiền. ` +
          `Vui lòng hoàn tiền trước khi xóa giải đấu.`,
        );
      }

      if (pendingRefunds > 0) {
        throw new BadRequestException(
          `Hình thức "${div.name}" có ${pendingRefunds} giao dịch đang chờ hoàn tiền. ` +
          `Vui lòng hoàn thành hoàn tiền trước khi xóa.`,
        );
      }
    }

    // Never destroy a completed child division when deleting its parent.
    // Keep the parent and historical matches available for club/ELO history.
    const completedDivisions = divisions.filter((div) => div.status === 'COMPLETED');
    if (completedDivisions.length > 0) {
      for (const division of completedDivisions) {
        await this.tournamentsRepository.archive(division.id, userId);
      }
      try {
        await this.redisService.delByPattern('tournaments:list:*');
      await this.redisService.delByPattern('matches:list:*');
      } catch (e) {
        // Redis down - ignore
      }
      return {
        archived: true,
        archivedTournamentIds: completedDivisions.map((division) => division.id),
        message: 'Các giải đã hoàn thành được lưu trữ để giữ lịch sử giải đấu và ELO.',
      };
    }

    // If System ADMIN, delete immediately
    if (systemRoles.includes('ADMIN')) {
      const result = await this.tournamentsRepository.softDeleteParent(id, userId);
      // Invalidate tournament list cache
      try {
        await this.redisService.delByPattern('tournaments:list:*');
      await this.redisService.delByPattern('matches:list:*');
      } catch (e) {
        // Redis down — ignore
      }
      return result;
    }

    // Parent tournaments with participants or locked/live child divisions must go through admin review
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

    // Invalidate tournament list cache
    try {
      await this.redisService.delByPattern('tournaments:list:*');
      await this.redisService.delByPattern('matches:list:*');
    } catch (e) {
      // Redis down — ignore
    }

    return this.tournamentsRepository.softDeleteParent(id, userId);
  }

  async generateBracket(
    id: string,
    userId: string,
    systemRoles: string[] = [],
    divisionId?: string,
    seedingType?: 'SEEDED' | 'RANDOM',
    allowReset = false,
  ) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Giải đấu không tồn tại');

    if (existing.status === 'IN_PROGRESS' || existing.status === 'COMPLETED') {
      throw new BadRequestException('Không thể tạo lại sơ đồ thi đấu cho giải đang diễn ra hoặc đã kết thúc');
    }

    // After REGISTRATION_CLOSED, only allow reset bracket once
    if (!allowReset && (existing.status === 'REGISTRATION_CLOSED' || existing.status === 'UPCOMING')) {
      try {
        const bracket = await this.tournamentsRepository.findBracket(id, divisionId);
        if (bracket && bracket.stages && bracket.stages.length > 0) {
          throw new BadRequestException('Sơ đồ bảng đấu đã được chốt. Không thể tạo lại sau khi đăng ký đóng.');
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        // If bracket query fails, allow reset (no existing bracket)
      }
    }

    let isAuthorized = await this.isManager(existing, userId, systemRoles);

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

    if (!isAuthorized) throw new ForbiddenException('Bạn không có quyền tạo bảng thi đấu');
    let division: typeof schema.tournamentDivisions.$inferSelect | undefined;
    if (divisionId) {
      const divisions = await this.tournamentsRepository.getDivisionsByTournament(id);
      division = divisions.find((item) => item.id === divisionId);
      if (!division) {
        throw new NotFoundException('Không tìm thấy bảng đấu cho giải đấu này');
      }
    }

    const config = (existing.tournamentConfig || {}) as Record<string, unknown>;
    const bracketType = (division?.bracketType || (config.bracketType as string) || 'SINGLE_ELIMINATION').toUpperCase();

    if (bracketType === 'DOUBLE_ELIMINATION') {
      return this.bracketGeneratorService.generateDoubleElimination(id, userId, divisionId, seedingType);
    } else if (bracketType === 'ROUND_ROBIN') {
      return this.bracketGeneratorService.generateRoundRobin(id, userId, divisionId, seedingType);
    } else if (bracketType === 'GROUP_STAGE_KNOCKOUT') {
      // Keep the organizer's saved group configuration. The generator validates
      // the capacity and advancement rules against the eligible participants.
      const participants = await this.tournamentsRepository.findParticipantsForSeeding(id, divisionId);
      const actualTeams = participants.length;

      if (actualTeams < 4) {
        throw new BadRequestException('Cần ít nhất 4 đội để tạo vòng bảng + loại trực tiếp.');
      }

      return this.bracketGeneratorService.generateGroupStageKnockout(id, userId, divisionId, seedingType);
    } else {
      return this.bracketGeneratorService.generateSingleElimination(id, userId, divisionId, seedingType);
    }
  }

  async generateLiteBracket(
    id: string,
    userId: string,
    systemRoles: string[] = [],
    reset = false,
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const config = (tournament.tournamentConfig || {}) as Record<string, unknown>;
    if (config.isLite !== true) {
      throw new BadRequestException('Chỉ giải Lite mới dùng được luồng quản lý này.');
    }

    const bracket = reset ? await this.tournamentsRepository.findBracket(id) : null;
    const started = bracket?.stages.some((stage) =>
      stage.groups?.some((group) =>
        group.matches?.some((match) => match.status !== 'SCHEDULED'),
      ),
    ) ?? false;
    if (started) {
      throw new BadRequestException('Không thể reset bracket sau khi đã bắt đầu ít nhất một trận.');
    }

    // generateBracket performs the same BTC/community authorization and persists
    // stages, groups and matches in one generator transaction.
    return this.generateBracket(id, userId, systemRoles, undefined, 'RANDOM', reset);
  }

  async autoSeedFromElo(
    tournamentId: string,
    userId: string,
    systemRoles: string[] = [],
    divisionId?: string,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.isManager(tournament, userId, systemRoles);
    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) isAuthorized = true;
    }
    if (!isAuthorized) throw new ForbiddenException('Bạn không có quyền xếp hạt giống tự động');

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

  // ═══════════════ Ràng buộc GIỚI TÍNH khi ghép đôi ═══════════════
  // Gotcha: profile lưu giới tính tiếng Việt ('Nữ'/'Nam'), division lưu
  // 'FEMALE'/'MALE'/'MIXED' → phải normalize CẢ 2 PHÍA trước khi so sánh.
  private normalizeGenderValue(value?: string | null): 'MALE' | 'FEMALE' | null {
    const v = String(value ?? '')
      .trim()
      .toUpperCase()
      .replace(/[-–\s]/g, '_');
    if (['MALE', 'MEN', 'NAM'].includes(v)) return 'MALE';
    if (['FEMALE', 'WOMEN', 'NU', 'NỮ'].includes(v)) return 'FEMALE';
    return null; // không nhận biết → không block (tránh chặn oan)
  }

  /**
   * Chặn đội vi phạm genderRestriction của division.
   * - 'MALE'/'FEMALE': mọi thành viên ĐÃ BIẾT giới phải trùng.
   * - 'MIXED' (MIXED_DOUBLES): cặp phải đủ 1 nam + 1 nữ.
   * null/COED hoặc có thành viên giới không nhận biết → bỏ qua.
   */
  private async validateGenderRestriction(
    division: { genderRestriction?: string | null } | null,
    userIds: Array<string | null | undefined>,
  ): Promise<void> {
    if (!division?.genderRestriction) return;
    const restriction = String(division.genderRestriction).trim().toUpperCase();
    const knownUsers = userIds.filter(Boolean) as string[];

    if (restriction === 'MIXED') {
      let male = 0;
      let female = 0;
      let knownGenderCount = 0;
      for (const uid of knownUsers) {
        const profile = await this.tournamentsRepository.findUserProfile(uid);
        const g = this.normalizeGenderValue(profile?.gender);
        if (g === 'MALE') { male++; knownGenderCount++; }
        else if (g === 'FEMALE') { female++; knownGenderCount++; }
      }
      if (knownGenderCount === knownUsers.length && (male === 0 || female === 0)) {
        throw new BadRequestException('Division đôi nam nữ yêu cầu đúng 1 nam + 1 nữ.');
      }
      return;
    }

    if (restriction !== 'MALE' && restriction !== 'FEMALE') return;
    for (const uid of knownUsers) {
      const profile = await this.tournamentsRepository.findUserProfile(uid);
      const g = this.normalizeGenderValue(profile?.gender);
      if (g === null) continue;
      if (g !== restriction) {
        throw new BadRequestException(
          restriction === 'MALE'
            ? 'Division này chỉ dành cho Nam.'
            : 'Division này chỉ dành cho Nữ.',
        );
      }
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

    if (
      status !== 'REGISTRATION_OPEN' &&
      status !== 'UPCOMING' &&
      !allowDraft
    ) {
      throw new BadRequestException('Giải đấu chưa hoặc đã đóng đăng ký');
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
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    this.assertRegistrationAccessible(tournament, { inviteCode });

    // Nếu là giải nội bộ CLB, chỉ member mới đăng ký được
    if (tournament.communityId && tournament.tournamentType === 'CLUB') {
      const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
      if (!member || member.status !== 'JOINED') {
        throw new ForbiddenException('Giải đấu này chỉ dành cho thành viên của câu lạc bộ.');
      }
    }

    const userIds = [userId];
    let partnerUser: { id: string } | null = null;
    if (registerTournamentDto.partnerEmailOrPhone) {
      partnerUser = await this.tournamentsRepository.findUserByEmailOrPhone(registerTournamentDto.partnerEmailOrPhone);
      if (!partnerUser) {
        throw new BadRequestException(
          `Không tìm thấy tài khoản Sporto với email/SĐT "${registerTournamentDto.partnerEmailOrPhone}". Đồng đội cần đăng ký tài khoản trước khi tham gia.`
        );
      }
      userIds.push(partnerUser.id);
    }

    const requestedDivisionId = registerTournamentDto.tournamentDivisionId ?? registerTournamentDto.divisionId;
    const requestedDivision = requestedDivisionId
      ? await this.tournamentsRepository.findDivisionById(requestedDivisionId)
      : null;

    await this.validateEloLimits(tournament, userIds, { division: requestedDivision });
    // Khi mời partner ngay: chặn đội vi phạm genderRestriction của division
    await this.validateGenderRestriction(requestedDivision, [userId, partnerUser?.id]);

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
        // VĐV 1 chưa có partner — thông báo cho VĐV 1 chờ đồng đội join
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
      } else if (result.participant.teamStatus === 'PENDING_PARTNER' && partnerUser) {
        // VĐV 1 đã nhập email/SĐT VĐV 2 — gửi thông báo mời cho VĐV 2
        notifications.push(
          this.notificationsService.sendNotification(
            buildPartnerInviteReceivedNotification({
              tournamentId: id,
              tournamentName: tournament.name,
              receiverId: partnerUser.id,
              senderId: userId,
              teamName: result.participant.teamName,
              participantId: result.participant.id,
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
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    this.assertRegistrationAccessible(tournament, { allowDraft: true });

    // Nếu là giải nội bộ CLB, chỉ member mới join team được
    if (tournament.communityId && tournament.tournamentType === 'CLUB') {
      const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
      if (!member || member.status !== 'JOINED') {
        throw new ForbiddenException('Giải đấu này chỉ dành cho thành viên của câu lạc bộ.');
      }
    }

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
    // Partner bấm link/QR join: chặn đội vi phạm genderRestriction của division
    await this.validateGenderRestriction(division, [userId, leaderRoster?.userId]);

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
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const now = new Date();
    if (['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(tournament.status)) {
      throw new BadRequestException('Giải đấu đã bắt đầu hoặc kết thúc, không thể tự rút lui.');
    }
    if (tournament.registrationEndDate && now > new Date(tournament.registrationEndDate) && tournament.status !== 'UPCOMING') {
      throw new BadRequestException('Đã quá thời hạn rút lui của giải đấu.');
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

      // Nếu còn lời mời ghép đôi chưa xử lý — báo cho người được mời là lời mời đã bị thu hồi
      if (
        currentRegistration.registered &&
        currentRegistration.participant &&
        currentRegistration.participant.teamStatus === 'PENDING_PARTNER' &&
        currentRegistration.participant.partnerUserId
      ) {
        await this.notificationsService.sendNotification(
          buildPartnerInviteCancelledNotification({
            receiverId: currentRegistration.participant.partnerUserId,
            tournamentId,
            divisionId: currentRegistration.participant.tournamentDivisionId,
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
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    const config = (tournament.tournamentConfig || {}) as Record<string, unknown>;
    if (config.isLite === true) {
      return this.tournamentsRepository.findLiteParticipantsWithRosters(id);
    }
    return this.tournamentsRepository.findPublicParticipants(id, tournament.categoryId, divisionId);
  }

  async findParticipantsForOrganizer(id: string, divisionId?: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    return this.tournamentsRepository.findParticipants(id, tournament.categoryId, divisionId);
  }

  async findBracket(id: string, divisionId?: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    if (divisionId) {
      const divisions = await this.tournamentsRepository.getDivisionsByTournament(id);
      const exists = divisions.some((division) => division.id === divisionId);
      if (!exists) {
        throw new NotFoundException('Không tìm thấy bảng đấu cho giải đấu này');
      }
    }
    return this.tournamentsRepository.findBracket(id, divisionId);
  }

  async findByInviteCode(inviteCode: string) {
    const tournament = await this.tournamentsRepository.findByInviteCode(inviteCode);
    if (!tournament) {
      throw new NotFoundException('Không tìm thấy giải đấu cho mã mời này');
    }
    this.assertInviteReachable(tournament);
    return this.mapTournamentFormat(tournament);
  }

  async joinByInviteCode(inviteCode: string, userId: string, registerTournamentDto: RegisterTournamentDto) {
    const tournament = await this.tournamentsRepository.findByInviteCode(inviteCode);
    if (!tournament) {
      throw new NotFoundException('Không tìm thấy giải đấu cho mã mời này');
    }
    this.assertInviteReachable(tournament);

    return this.register(tournament.id, userId, registerTournamentDto, inviteCode);
  }

  /**
   * Mã mời chỉ có hiệu lực khi giải đã được công bố và không bị khóa.
   * Giải DRAFT/PENDING_APPROVAL ẩn hoàn toàn; SUSPENDED/CANCELLED chặn truy cập.
   */
  private assertInviteReachable(tournament: { status?: string | null }) {
    const status = tournament.status || '';
    if (['DRAFT', 'PENDING_APPROVAL', 'PENDING_DELETE'].includes(status)) {
      throw new NotFoundException('Không tìm thấy giải đấu cho mã mời này');
    }
    if (status === 'SUSPENDED') {
      throw new ForbiddenException('Giải đấu đang bị tạm đình chỉ do vi phạm điều khoản dịch vụ');
    }
    if (status === 'CANCELLED') {
      throw new ForbiddenException('Giải đấu đã bị cấm hoặc hủy vĩnh viễn');
    }
  }

  async regenerateInviteCode(id: string, userId: string, systemRoles: string[] = []) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    // Check authorization: Admin or Creator
    const isAuthorized = await this.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền tạo lại mã mời');
    }

    const updated = await this.tournamentsRepository.regenerateInviteCode(id, userId);
    return this.mapTournamentFormat(updated);
  }

  async getGallery(id: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    if (tournament.tournamentType !== 'PUBLIC') {
      throw new BadRequestException('Thư viện ảnh chỉ dành cho giải đấu công khai');
    }
    return tournament.galleryImages || [];
  }

  async addGalleryImage(id: string, userId: string, url: string, systemRoles: string[] = []) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    if (tournament.tournamentType !== 'PUBLIC') {
      throw new BadRequestException('Thư viện ảnh chỉ dành cho giải đấu công khai');
    }

    const isAuthorized = await this.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền thêm ảnh thư viện');
    }

    const galleryImages = [...(tournament.galleryImages || []), url];
    const updated = await this.tournamentsRepository.update(id, userId, { galleryImages });
    return this.mapTournamentFormat(updated);
  }

  async removeGalleryImage(id: string, userId: string, index: number, systemRoles: string[] = []) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    if (tournament.tournamentType !== 'PUBLIC') {
      throw new BadRequestException('Thư viện ảnh chỉ dành cho giải đấu công khai');
    }

    const isAuthorized = await this.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền xóa ảnh thư viện');
    }

    const currentImages = tournament.galleryImages || [];
    if (index < 0 || index >= currentImages.length) {
      throw new BadRequestException('Chỉ số ảnh thư viện không hợp lệ');
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
    if (!existing) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.isManager(existing, userId, systemRoles);

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
      throw new ForbiddenException('Bạn không có quyền xuất bản giải đấu này');
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

    // Tất cả giải đấu do Ban tổ chức/Người dùng tạo (không phải Admin) đều phải chuyển sang PENDING_APPROVAL để Admin phê duyệt
    const isAdmin = systemRoles.includes('ADMIN');
    const notYetOpen = existing.registrationStartDate && new Date(existing.registrationStartDate) > new Date();
    const requiresAdminApproval = !isAdmin && (
      existing.visibility === 'PUBLIC' || !existing.communityId
    );
    const targetStatus = requiresAdminApproval
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
    if (!existing) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.isManager(existing, userId, systemRoles);

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
      throw new ForbiddenException('Bạn không có quyền chốt giải đấu này');
    }

    if (existing.status !== 'REGISTRATION_OPEN' && existing.status !== 'REGISTRATION_CLOSED') {
      throw new BadRequestException('Đăng ký giải đấu phải mở hoặc đã đóng để có thể chốt');
    }

    // Kiem tra da co cau hinh mac dinh cho division chua
    const allDivs = await this.tournamentsRepository.getDivisionsByTournament(id);
    const category = await this.tournamentsRepository.findCategory(existing.categoryId);
    for (const d of allDivs) {
      if (!category) {
        throw new NotFoundException('Hạng đấu không tồn tại');
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
      throw new BadRequestException('Cần ít nhất 2 người tham gia để chốt và tạo sơ đồ thi đấu');
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
    if (!stage) throw new NotFoundException('Vòng đấu không tồn tại');

    const tournament = await this.tournamentsRepository.findById(stage.tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    // System ADMIN or Tournament creator can update
    let isAuthorized = await this.isManager(tournament, userId, systemRoles);

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
      throw new ForbiddenException('Bạn không có quyền cập nhật vòng đấu này');
    }

    if (data.roundConfig) {
      const category = await this.tournamentsRepository.findCategory(tournament.categoryId);
      if (!category) {
        throw new NotFoundException('Hạng đấu không tồn tại');
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
          allowRoundStructure: true,
          allowRoundMetadata: true,
        });
    }

    return this.tournamentsRepository.updateStage(stageId, userId, data);
  }

  async updateGroup(groupId: string, userId: string, data: UpdateGroupDto, systemRoles: string[] = []) {
    const group = await this.tournamentsRepository.findGroupById(groupId);
    if (!group) throw new NotFoundException('Bảng đấu không tồn tại');

    const tournament = await this.tournamentsRepository.findById(group.tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.isManager(tournament, userId, systemRoles);
    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
      isAuthorized = member?.role === 'OWNER' || member?.role === 'MODERATOR';
    }
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền cập nhật bảng đấu này');
    }

    if (data.roundConfig) {
      const category = await this.tournamentsRepository.findCategory(tournament.categoryId);
      if (!category) throw new NotFoundException('Hạng đấu không tồn tại');
      validateSportRuleConfig(data.roundConfig, {
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
        sourceLabel: 'group.roundConfig',
        allowRoundStructure: true,
        allowRoundMetadata: true,
      });
    }

    return this.tournamentsRepository.updateGroup(groupId, userId, data);
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

  async createParent(userId: string, data: CreateParentTournamentDto, systemRoles: string[] = []) {
    if (!this.isSystemTournamentCreator(systemRoles)) {
      throw new ForbiddenException('Chỉ tài khoản Organizer hoặc Admin mới có thể tạo giải ngoài CLB.');
    }
    return this.tournamentsRepository.createParent(userId, data);
  }

  async updateParent(id: string, userId: string, data: UpdateParentTournamentDto, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findParentById(id);
    if (!existing) throw new NotFoundException('Giải đấu cha không tồn tại');

    const canUpdate = await this.isManager(existing, userId, systemRoles);
    if (!canUpdate) {
      throw new ForbiddenException('Bạn không có quyền cập nhật giải đấu lớn này');
    }

    return this.tournamentsRepository.updateParent(id, userId, data);
  }

  async findParentById(id: string) {
    const parent = await this.tournamentsRepository.findParentById(id);
    if (!parent) throw new NotFoundException('Giải đấu cha không tồn tại');
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
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isLite =
      (tournament.tournamentConfig as Record<string, unknown> | null | undefined)?.isLite === true;
    if (tournament.status !== 'DRAFT' && !isLite && tournament.status !== 'REGISTRATION_OPEN' && tournament.status !== 'UPCOMING') {
      throw new BadRequestException('Chỉ có thể tạo dữ liệu ảo khi giải đấu ở trạng thái Nháp hoặc Mở đăng ký.');
    }

    const isAuthorized =
      await this.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền tạo dữ liệu ảo');
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
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isLite =
      (tournament.tournamentConfig as Record<string, unknown> | null | undefined)?.isLite === true;
    if (tournament.status !== 'DRAFT' && !isLite && tournament.status !== 'REGISTRATION_OPEN' && tournament.status !== 'UPCOMING') {
      throw new BadRequestException('Chỉ có thể xóa dữ liệu ảo ở trạng thái Nháp hoặc Đang mở đăng ký.');
    }

    const isAuthorized =
      await this.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền xóa dữ liệu ảo');
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
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isLite =
      (tournament.tournamentConfig as Record<string, unknown> | null | undefined)?.isLite === true;
    if (tournament.status !== 'DRAFT' && !isLite && tournament.status !== 'REGISTRATION_OPEN' && tournament.status !== 'UPCOMING') {
      throw new BadRequestException('Chỉ có thể xoá dữ liệu giả lập ở trạng thái Nháp hoặc Đang mở đăng ký.');
    }

    const isAuthorized =
      await this.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền xóa người tham gia ảo');
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
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.isManager(tournament, userId, systemRoles);
    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) isAuthorized = true;
    }
    if (!isAuthorized) throw new ForbiddenException('Bạn không có quyền tạo trận playoff');

    const stage = await this.tournamentsRepository.findStageById(dto.stageId);
    if (!stage || stage.tournamentId !== tournamentId) throw new NotFoundException('Vòng đấu không tồn tại');
    if (stage.type !== 'ROUND_ROBIN') throw new BadRequestException('Vòng loại trực tiếp chỉ khả dụng cho vòng đấu vòng tròn');

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
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.isManager(tournament, userId, systemRoles);
    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) isAuthorized = true;
    }
    if (!isAuthorized) throw new ForbiddenException('Bạn không có quyền hoàn tất vòng đấu');

    const stage = await this.tournamentsRepository.findStageById(stageId);
    if (!stage || stage.tournamentId !== tournamentId) throw new NotFoundException('Vòng đấu không tồn tại');

    await this.tournamentsRepository.cancelScheduledMatchesInStage(stageId);
    return { message: 'Đã hoàn tất vòng đấu thành công' };
  }

  async advanceStandings(
    tournamentId: string,
    divisionId: string,
    stageId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.isManager(tournament, userId, systemRoles);
    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) isAuthorized = true;
    }
    if (!isAuthorized) throw new ForbiddenException('Bạn không có quyền cập nhật tiến trình vòng đấu');

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
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new BadRequestException('Giải đấu đã chốt danh sách, không thể duyệt hoặc từ chối vận động viên.');
    }

    const isAuthorized =
      await this.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền cập nhật trạng thái');
    }

    if (status !== 'COMPLETE' && status !== 'REJECTED') {
      throw new BadRequestException('Chỉ hỗ trợ duyệt hoặc từ chối hồ sơ đăng ký.');
    }

    const participant = await this.tournamentsRepository.findParticipantById(participantId);
    if (!participant || participant.tournamentId !== tournamentId) {
      throw new NotFoundException('Người tham gia không tồn tại');
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
      throw new NotFoundException('Người tham gia không tồn tại');
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
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isAuthorized =
      await this.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền cấp đặc cách');
    }

    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new BadRequestException('Giải đấu đã chốt danh sách, không thể gán slot giữ chỗ.');
    }

    const foundUser = await this.tournamentsRepository.findUserByEmailOrPhone(userEmailOrPhone);
    if (!foundUser) {
      throw new NotFoundException('Không tìm thấy tài khoản Sporto cho người chơi thứ nhất');
    }

    let foundPartnerId: string | undefined = undefined;
    if (partnerEmailOrPhone) {
      const foundPartner = await this.tournamentsRepository.findUserByEmailOrPhone(partnerEmailOrPhone);
      if (!foundPartner) {
        throw new NotFoundException('Không tìm thấy tài khoản Sporto cho đồng đội (người thứ 2)');
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
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.isManager(tournament, userId, systemRoles);

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
      throw new ForbiddenException('Bạn không có quyền loại người tham gia này');
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
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    let isAuthorized = await this.isManager(tournament, userId, systemRoles);

    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền xem nhật ký vận hành');
    }

    return this.tournamentsRepository.findOpsAuditLogs(tournamentId, divisionId);
  }

  async cancelTournament(id: string, userId: string, systemRoles: string[] = []) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.isManager(tournament, userId, systemRoles);

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
      throw new ForbiddenException('Bạn không có quyền hủy giải đấu này');
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
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');
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
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');
    const isAuthorized = await this.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) throw new ForbiddenException('Bạn không có quyền thêm thành viên ban tổ chức');
    const userToInvite = await this.tournamentsRepository.findUserByEmail(email);
    if (!userToInvite) {
      throw new NotFoundException(
        `Email "${email}" chưa đăng ký tài khoản trên hệ thống. Người được mời cần có tài khoản trước khi trở thành ${role === 'REFEREE' ? 'trọng tài' : role === 'SPECTATOR' ? 'khách xem' : 'ban tổ chức'}.`,
      );
    }
    const record = await this.tournamentsRepository.addStaffMember(id, userToInvite.id, role, userId);

    const roleLabel = role === 'REFEREE' ? 'trọng tài' : role === 'SPECTATOR' ? 'khách xem' : 'đồng tổ chức';
    try {
      await this.notificationsService.sendNotification(
        buildStaffAddedNotification({
          tournamentId: id,
          tournamentName: tournament.name,
          receiverId: userToInvite.id,
          roleLabel,
        }),
      );
    } catch (error) {
      console.error('Failed to send staff-add notification:', error);
    }

    return record;
  }

  async removeStaffMember(
    id: string,
    staffUserId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');
    const isAuthorized = await this.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) throw new ForbiddenException('Bạn không có quyền xóa thành viên ban tổ chức');
    return this.tournamentsRepository.removeStaffMember(id, staffUserId);
  }

  async findReferees(id: string, userId: string, systemRoles: string[] = []) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    const isAuthorized = await this.isManager(tournament, userId, systemRoles);

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
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isAuthorized = await this.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền cập nhật hạt giống');
    }

    if (tournament.status === 'IN_PROGRESS' || tournament.status === 'COMPLETED') {
      throw new BadRequestException('Không thể cập nhật hạt giống cho giải đang diễn ra hoặc đã kết thúc');
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
        throw new NotFoundException('Giải đấu không tồn tại');
      }

      if (!(await this.isManager(tournament, userId, systemRoles))) {
        throw new ForbiddenException('Bạn không có quyền tạo bảng thi đấu cho giải này');
      }

      const divisionEntryFee = createDivisionDto.entryFee
        ?? (tournament.entryFee ? Number(tournament.entryFee) : 0);
      await this.assertEntryFeeAllowed(divisionEntryFee);

      // Không cho phép thêm hình thức mới khi đang mở đăng ký
      if (
        tournament.status === 'REGISTRATION_OPEN' ||
        tournament.status === 'REGISTRATION_CLOSED'
      ) {
        throw new BadRequestException('Không thể thêm hình thức thi đấu khi giải đấu đang mở đăng ký');
      }

      const category = await this.tournamentsRepository.findCategory(tournament.categoryId);
      if (!category) {
        throw new NotFoundException('Hạng đấu không tồn tại');
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
          entryFee: divisionEntryFee,
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
        throw new NotFoundException('Giải đấu không tồn tại');
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
      throw new NotFoundException('Bảng đấu không tồn tại');
    }

    const tournament = await this.tournamentsRepository.findById(division.tournamentId);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    if (!(await this.isManager(tournament, userId, systemRoles))) {
      throw new ForbiddenException('Bạn không có quyền cập nhật bảng thi đấu này');
    }

    await this.assertEntryFeeAllowed(updateDivisionDto.entryFee);

    const category = await this.tournamentsRepository.findCategory(tournament.categoryId);
    if (!category) {
      throw new NotFoundException('Hạng đấu không tồn tại');
    }

    const nextMatchType = updateDivisionDto.matchType ?? division.matchType;
    let nextGenderRestriction = updateDivisionDto.genderRestriction !== undefined ? updateDivisionDto.genderRestriction : division.genderRestriction;

    // Auto-heal corrupted gender restriction in database
    if (nextMatchType === 'MIXED_DOUBLES' && nextGenderRestriction !== 'MIXED') {
      nextGenderRestriction = GenderRestriction.MIXED;
      updateDivisionDto.genderRestriction = GenderRestriction.MIXED;
    } else if ((nextMatchType === 'SINGLES' || nextMatchType === 'DOUBLES') && nextGenderRestriction === 'MIXED') {
      nextGenderRestriction = null;
      updateDivisionDto.genderRestriction = null;
    }

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
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    const canManage = await this.isManager(tournament, userId, systemRoles);
    if (!canManage) {
      throw new ForbiddenException('Bạn không có quyền cập nhật cấu hình hình thức này');
    }

    await this.assertEntryFeeAllowed(updateDivisionDto.entryFee);

    // Không cho đổi hình thức thi đấu khi đang mở đăng ký
    if (
      updateDivisionDto.matchType &&
      (tournament.status === 'REGISTRATION_OPEN' || tournament.status === 'REGISTRATION_CLOSED')
    ) {
      throw new BadRequestException('Không thể thay đổi hình thức thi đấu khi giải đấu đang mở đăng ký');
    }

    const currentDivision = await this.tournamentsRepository.findDivisionById(divisionId);
    if (!currentDivision) {
      throw new NotFoundException('Bảng đấu không tồn tại');
    }

    const category = await this.tournamentsRepository.findCategory(tournament.categoryId);
    if (!category) {
      throw new NotFoundException('Hạng đấu không tồn tại');
    }

    const nextMatchType = updateDivisionDto.matchType ?? currentDivision.matchType;
    let nextGenderRestriction = updateDivisionDto.genderRestriction !== undefined ? updateDivisionDto.genderRestriction : currentDivision.genderRestriction;

    // Auto-heal corrupted gender restriction in database
    if (nextMatchType === 'MIXED_DOUBLES' && nextGenderRestriction !== 'MIXED') {
      nextGenderRestriction = GenderRestriction.MIXED;
      updateDivisionDto.genderRestriction = GenderRestriction.MIXED;
    } else if ((nextMatchType === 'SINGLES' || nextMatchType === 'DOUBLES') && nextGenderRestriction === 'MIXED') {
      nextGenderRestriction = null;
      updateDivisionDto.genderRestriction = null;
    }

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

    if (!(await this.isManager(tournament, userId, systemRoles))) {
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

    const division = await this.tournamentsRepository.findDivisionById(divisionId);
    if (!division) throw new NotFoundException('Bảng thi đấu không tồn tại');
    const tournament = await this.tournamentsRepository.findById(division.tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');
    if (!(await this.isManager(tournament, userId, systemRoles))) {
      throw new ForbiddenException('Bạn không có quyền xóa bảng thi đấu này');
    }
    return this.tournamentsRepository.deleteDivision(divisionId, userId);
  }

  async getParticipantsByDivision(tournamentId: string, divisionId: string) {
    const divisions = await this.tournamentsRepository.getDivisionsByTournament(tournamentId);
    const exists = divisions.some((division) => division.id === divisionId);
    if (!exists) {
      throw new NotFoundException('Không tìm thấy bảng đấu cho giải đấu này');
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

  async getGroupStandings(tournamentId: string, divisionId?: string) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    return this.tournamentsRepository.findGroupStandings(tournamentId, divisionId);
  }

  async getTournamentResults(tournamentId: string, divisionId?: string) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const matches = await this.tournamentsRepository.findTournamentResultMatches(tournamentId, divisionId);
    const standings = await this.tournamentsRepository.findGroupStandings(tournamentId, divisionId);
    const standingRows = Array.isArray(standings)
      ? standings
      : Array.isArray(standings?.standings)
        ? standings.standings
        : [];
    const completed = tournament.status === 'COMPLETED';
    const knockout = matches.filter((match) => match.stageType !== 'ROUND_ROBIN');
    const final = [...knockout]
      .filter((match) => match.status === 'COMPLETED' && ['GRAND_FINALS', 'FINAL', 'MAIN'].includes(match.bracketBranch))
      .sort((a, b) => b.roundNumber - a.roundNumber || b.matchOrder - a.matchOrder)[0];

    const participant = (id: string | null, name: string | null) => id ? { participantId: id, teamName: name || 'Chưa xác định' } : null;
    const awards = final
      ? [
          { rank: 1, shared: false, participant: participant(final.winnerId, final.winnerId === final.participant1Id ? final.participant1Name : final.participant2Name) },
          { rank: 2, shared: false, participant: participant(final.winnerId === final.participant1Id ? final.participant2Id : final.participant1Id, final.winnerId === final.participant1Id ? final.participant2Name : final.participant1Name) },
        ]
      : [];

    return {
      tournamentId,
      status: tournament.status,
      finalized: completed && awards.every((award) => award.participant !== null),
      awards: completed ? awards : [],
      standings: standingRows,
      matches: matches.map((match) => ({
        id: match.id,
        status: match.status,
        roundNumber: match.roundNumber,
        matchOrder: match.matchOrder,
        bracketBranch: match.bracketBranch,
        stageId: match.stageId,
        stageName: match.stageName,
        participant1: participant(match.participant1Id, match.participant1Name),
        participant2: participant(match.participant2Id, match.participant2Name),
        winnerId: match.winnerId,
      })),
    };
  }

  async getTournamentResultsV2(tournamentId: string, divisionId?: string) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const matches = await this.tournamentsRepository.findTournamentResultMatches(tournamentId, divisionId);
    const standings = await this.tournamentsRepository.findGroupStandings(tournamentId, divisionId);
    const standingRows = Array.isArray(standings)
      ? standings
      : Array.isArray(standings?.standings)
        ? standings.standings
        : [];
    const participant = (id: string | null, name: string | null) => id
      ? { participantId: id, teamName: name || 'Chua xac dinh' }
      : null;
    const completed = tournament.status === 'COMPLETED';
    const knockout = matches.filter((match) => match.stageType !== 'ROUND_ROBIN' && match.status === 'COMPLETED' && match.winnerId);
    const finalCandidates = knockout.filter((match) => {
      const branch = (match.bracketBranch || '').toUpperCase();
      const stageName = (match.stageName || '').toLowerCase();
      return branch === 'GRAND_FINALS'
        || branch === 'FINAL'
        || stageName.includes('chung kết')
        || stageName.includes('chung ket')
        || stageName.includes('grand final');
    });
    const final = [...(finalCandidates.length > 0 ? finalCandidates : knockout.filter((match) => {
      const branch = (match.bracketBranch || '').toUpperCase();
      return branch === 'MAIN' || branch === '';
    }))]
      .sort((a, b) => b.roundNumber - a.roundNumber || b.matchOrder - a.matchOrder)[0];
    const loserOf = (match: typeof final) => match?.winnerId === match.participant1Id
      ? participant(match.participant2Id, match.participant2Name)
      : participant(match?.participant1Id ?? null, match?.participant1Name ?? null);
    const awards: Array<{ rank: number; shared: boolean; participant: { participantId: string; teamName: string } | null }> = [];

    if (final) {
      awards.push({ rank: 1, shared: false, participant: participant(final.winnerId, final.winnerId === final.participant1Id ? final.participant1Name : final.participant2Name) });
      awards.push({ rank: 2, shared: false, participant: loserOf(final) });
      const config = (tournament.tournamentConfig ?? {}) as { thirdPlaceMatch?: boolean };
      const semifinalLosers = knockout
        .filter((match) => match.roundNumber === final.roundNumber - 1)
        .map(loserOf)
        .filter((item): item is { participantId: string; teamName: string } => item !== null);
      const thirdPlace = config.thirdPlaceMatch
        ? knockout.find((match) => match.roundNumber === final.roundNumber && match.id !== final.id && [match.participant1Id, match.participant2Id].some((id) => semifinalLosers.some((loser) => loser.participantId === id)))
        : undefined;
      if (thirdPlace) {
        awards.push({ rank: 3, shared: false, participant: participant(thirdPlace.winnerId, thirdPlace.winnerId === thirdPlace.participant1Id ? thirdPlace.participant1Name : thirdPlace.participant2Name) });
      } else {
        for (const loser of semifinalLosers) awards.push({ rank: 3, shared: true, participant: loser });
      }
    } else if (standingRows.length) {
      const groups = new Map<string, typeof standingRows>();
      for (const row of standingRows) groups.set(row.groupId, [...(groups.get(row.groupId) ?? []), row]);
      for (const rows of groups.values()) rows.slice(0, 3).forEach((row, index) => awards.push({ rank: index + 1, shared: false, participant: participant(row.participantId, row.teamName) }));
    }

    return {
      tournamentId,
      status: tournament.status,
      finalized: completed && awards.length > 0 && awards.every((award) => award.participant !== null),
      awards: completed ? awards : [],
      standings: standingRows,
      matches: matches.map((match) => ({
        id: match.id,
        status: match.status,
        roundNumber: match.roundNumber,
        matchOrder: match.matchOrder,
        bracketBranch: match.bracketBranch,
        stageId: match.stageId,
        stageName: match.stageName,
        participant1: participant(match.participant1Id, match.participant1Name),
        participant2: participant(match.participant2Id, match.participant2Name),
        winnerId: match.winnerId,
      })),
    };
  }

  async addReferee(
    id: string,
    email: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    const isAuthorized = await this.isManager(tournament, userId, systemRoles);

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
      throw new NotFoundException('Giải đấu không tồn tại');
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
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    if (!referee || referee.tournamentId !== tournamentId) {
      throw new NotFoundException('Không tìm thấy lời mời trọng tài');
    }

    const isAuthorized = await this.isManager(tournament, userId, systemRoles);

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

  // ──── Lite authorization helper ────

  private async checkLiteAuthorization(
    tournamentId: string,
    userId: string,
    systemRoles: string[] = [],
  ): Promise<{ tournament: typeof schema.tournaments.$inferSelect; config: Record<string, unknown> }> {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const config = (tournament.tournamentConfig || {}) as Record<string, unknown>;
    if (config.isLite !== true) {
      throw new BadRequestException('Thao tác này chỉ hỗ trợ giải đấu Lite.');
    }

    let isAuthorized = await this.isManager(tournament, userId, systemRoles);

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
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
    }

    return { tournament, config };
  }

  // ──── Lite pairing ────

  async getLiteParticipants(id: string, userId: string, systemRoles: string[] = []) {
    await this.checkLiteAuthorization(id, userId, systemRoles);
    return this.tournamentsRepository.findLiteParticipantsWithRosters(id);
  }

  async pairLiteParticipants(
    id: string,
    userId: string,
    systemRoles: string[] = [],
    dto: PairLiteParticipantsDto,
  ) {
    const { tournament, config } = await this.checkLiteAuthorization(id, userId, systemRoles);

    // Verify DOUBLES match type
    if (tournament.matchType !== 'DOUBLES' && tournament.matchType !== 'MIXED_DOUBLES') {
      throw new BadRequestException('Ghép cặp chỉ hỗ trợ giải đấu đánh đôi.');
    }

    // Reject if active bracket/stage/match exists
    const hasActiveBracket = await this.tournamentsRepository.hasNonDeletedStagesOrMatches(id);
    if (hasActiveBracket) {
      throw new BadRequestException('Không thể ghép cặp sau khi đã sinh nhánh đấu.');
    }

    const registrationMode = (config.registrationMode as string) || 'OPEN';

    // Build teamName from profiles
    const p1Profile = await this.tournamentsRepository.findUserBasicById(
      (await this.tournamentsRepository.findLeaderByParticipantId(dto.participant1Id))?.userId ?? '',
    );
    const p2Profile = await this.tournamentsRepository.findUserBasicById(
      (await this.tournamentsRepository.findLeaderByParticipantId(dto.participant2Id))?.userId ?? '',
    );
    const teamName = [p1Profile?.fullName, p2Profile?.fullName].filter(Boolean).join(' / ');

    return await this.tournamentsRepository.lockTournamentAndPair(
      id,
      dto.participant1Id,
      dto.participant2Id,
      userId,
      registrationMode,
      teamName,
    );
  }

  async generateLitePairs(
    id: string,
    userId: string,
    systemRoles: string[] = [],
    dto: GenerateLitePairsDto,
  ) {
    const { tournament } = await this.checkLiteAuthorization(id, userId, systemRoles);

    // Verify DOUBLES match type
    if (tournament.matchType !== 'DOUBLES' && tournament.matchType !== 'MIXED_DOUBLES') {
      throw new BadRequestException('Ghép cặp chỉ hỗ trợ giải đấu đánh đôi.');
    }

    // Reject if active bracket/stage/match exists
    const hasActiveBracket = await this.tournamentsRepository.hasNonDeletedStagesOrMatches(id);
    if (hasActiveBracket) {
      throw new BadRequestException('Không thể ghép cặp sau khi đã sinh nhánh đấu.');
    }

    // Execute pairing in a transaction (authoritative; tx queries pending inside)
    return await this.tournamentsRepository.generateLitePairsTx(
      id, userId, dto.strategy,
    );
  }

  async unpairLiteParticipant(
    id: string,
    participantId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    await this.checkLiteAuthorization(id, userId, systemRoles);

    // Reject if active bracket/stage/match exists
    const hasActiveBracket = await this.tournamentsRepository.hasNonDeletedStagesOrMatches(id);
    if (hasActiveBracket) {
      throw new BadRequestException('Không thể tách cặp sau khi đã sinh nhánh đấu.');
    }

    return await this.tournamentsRepository.lockTournamentAndUnpair(id, participantId, userId);
  }

  async acceptPartnerInvite(participantId: string, partnerUserId: string) {
    // Đồng ý ghép đôi qua thông báo → vẫn phải chặn vi phạm giới tính
    const participant = await this.tournamentsRepository.findParticipantById(participantId);
    if (participant) {
      const division = participant.tournamentDivisionId
        ? await this.tournamentsRepository.findDivisionById(participant.tournamentDivisionId)
        : null;
      const leaderRoster =
        await this.tournamentsRepository.findLeaderByParticipantId(participantId);
      await this.validateGenderRestriction(division, [leaderRoster?.userId, partnerUserId]);
    }

    const updated = await this.tournamentsRepository.acceptPartnerInvite(participantId, partnerUserId);
    if (updated && updated.registeredBy) {
      await this.notificationsService.sendNotification(
        buildPartnerInviteAcceptedNotification({
          receiverId: updated.registeredBy,
          tournamentId: updated.tournamentId,
          divisionId: updated.tournamentDivisionId,
        }),
      );
    }
    return updated;
  }

  async rejectPartnerInvite(participantId: string, partnerUserId: string) {
    const updated = await this.tournamentsRepository.rejectPartnerInvite(participantId, partnerUserId);
    if (updated && updated.registeredBy) {
      await this.notificationsService.sendNotification(
        buildPartnerInviteRejectedNotification({
          receiverId: updated.registeredBy,
          tournamentId: updated.tournamentId,
          divisionId: updated.tournamentDivisionId,
        }),
      );
    }
    return updated;
  }
}
