import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';
import { CommunitySocialRepository } from '../../communities/community-social.repository';
import { buildCommunityPostNewNotification } from '../../notifications/notification-builder';
import { CreateParentTournamentDto } from '../dto/create-parent-tournament.dto';
import { UpdateParentTournamentDto } from '../dto/update-parent-tournament.dto';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { RedisService } from '../../../providers/redis/redis.service';
import { TournamentMediaService } from './tournament-media.service';
import { TournamentFeePolicyService } from './tournament-fee-policy.service';
import { isDeepStrictEqual } from 'node:util';
import { CreateTournamentDto } from '../dto/create-tournament.dto';
import { UpdateTournamentDto } from '../dto/update-tournament.dto';
import { CategoryConfig } from '../interfaces/tournament-config.interface';
import { GenderRestriction } from '../dto/create-division.dto';
import { mapTournamentFormat } from '../utils/tournament-presentation';
import {
  applyDefaultDoublesPairingMode,
  validateMatchTypeAgainstCategory,
  validateMatchTypeGenderRestriction,
  validateRegistrationMode,
} from '../utils/tournament-input-policy';
import { resolveEffectiveSportRules } from '../utils/sport-rules/resolve-effective-sport-rules';
import {
  inferAllowedSportRuleKinds,
  inferExpectedSportRuleKind,
  validateSportRuleConfig,
} from '../utils/sport-rules/validate-sport-rules-config';
import {
  assertValidFootballTeamConfig,
  resolveFootballTeamConfig,
} from '../utils/football-team-config';
import { buildTournamentCancelledNotification } from '../../notifications/notification-builder';

@Injectable()
export class TournamentLifecycleService {
  private readonly logger = new Logger(TournamentLifecycleService.name);

  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly tournamentAccessService: TournamentAccessService,
    private readonly notificationsService: NotificationsService,
    private readonly communitySocialRepository: CommunitySocialRepository,
    private readonly redisService: RedisService,
    private readonly tournamentMediaService: TournamentMediaService,
    private readonly tournamentFeePolicyService: TournamentFeePolicyService,
  ) {}
  async createParent(
    userId: string,
    data: CreateParentTournamentDto,
    systemRoles: string[] = [],
  ) {
    if (!this.tournamentAccessService.isSystemTournamentCreator(systemRoles)) {
      throw new ForbiddenException(
        'Chỉ tài khoản Organizer hoặc Admin mới có thể tạo giải ngoài CLB.',
      );
    }
    return this.tournamentsRepository.createParent(userId, data);
  }

  async updateParent(
    id: string,
    userId: string,
    data: UpdateParentTournamentDto,
    systemRoles: string[] = [],
  ) {
    const existing = await this.tournamentsRepository.findParentById(id);
    if (!existing) throw new NotFoundException('Giải đấu cha không tồn tại');

    const canUpdate = await this.tournamentAccessService.isManager(existing, userId, systemRoles);
    if (!canUpdate) {
      throw new ForbiddenException(
        'Bạn không có quyền cập nhật giải đấu lớn này',
      );
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
    const aggregation =
      await this.tournamentsRepository.getParentWithAggregation(parentId);
    return aggregation;
  }
  async updateParentAggregation(parentId: string) {
    try {
      return await this.tournamentsRepository.getParentWithAggregation(
        parentId,
      );
    } catch (error) {
      console.error(
        `Failed to update parent aggregation for ${parentId}:`,
        error,
      );
      throw error;
    }
  }
  async notifyCommunityTournamentCreated(params: {
    communityId: string;
    tournamentId: string;
    tournamentName: string;
    senderId: string;
    postId: string;
    isLite?: boolean;
  }) {
    try {
      if (
        typeof this.communitySocialRepository.getAllNotificationPreferences !==
        'function'
      ) {
        return;
      }
      const community =
        typeof this.tournamentsRepository.findCommunityById === 'function'
          ? await this.tournamentsRepository.findCommunityById(
              params.communityId,
            )
          : null;
      const communityName = community?.name || 'Câu lạc bộ';

      const authorProfile =
        typeof this.tournamentsRepository.findUserProfile === 'function'
          ? await this.tournamentsRepository.findUserProfile(params.senderId)
          : null;
      const senderName = authorProfile?.fullName?.trim() || 'Ban quản trị';

      const preferences =
        await this.communitySocialRepository.getAllNotificationPreferences(
          params.communityId,
          params.senderId,
        );

      const title = params.isLite
        ? `⚡ Giải đấu nhanh mới tại ${communityName}`
        : `🏆 Giải đấu mới tại ${communityName}`;
      const content = `${senderName} vừa mở giải đấu "${params.tournamentName}". Nhấn để xem và đăng ký tham gia ngay!`;
      const redirectUrl = `/communities/${params.communityId}?postId=${encodeURIComponent(params.postId)}`;

      await Promise.all(
        preferences
          .filter(
            (preference) =>
              preference.notificationPreference === 'ALL' &&
              preference.socialMuted !== true &&
              preference.socialNotificationsEnabled !== false,
          )
          .map((preference) =>
            this.notificationsService.sendNotification(
              buildCommunityPostNewNotification({
                communityId: params.communityId,
                communityName,
                senderName,
                receiverId: preference.userId,
                senderId: params.senderId,
                postId: params.postId,
                title,
                content,
                redirectUrl,
              }),
            ),
          ),
      );
    } catch (err) {
      console.error(
        'Failed to dispatch community tournament notifications:',
        err,
      );
    }
  }
  calculateNextRecurringDate(
    frequency: string,
    daysOfWeek: number[] | number,
    timeOfDay: string,
    fromDate = new Date(),
  ): Date {
    const [hours, minutes] = (timeOfDay || '18:00').split(':').map(Number);
    const target = new Date(fromDate);
    target.setHours(hours, minutes, 0, 0);

    if (frequency === 'DAILY') {
      target.setDate(target.getDate() + 1);
      return target;
    }

    if (frequency === 'MONTHLY') {
      target.setMonth(target.getMonth() + 1);
      return target;
    }

    const days: number[] = Array.isArray(daysOfWeek)
      ? daysOfWeek.length > 0
        ? daysOfWeek
        : [6]
      : [typeof daysOfWeek === 'number' ? daysOfWeek : 6];

    const currentDay = fromDate.getDay();
    const isTodayPast = fromDate.getTime() >= target.getTime();

    let minDaysAhead = 999;
    for (const d of days) {
      let diff = (d - currentDay + 7) % 7;
      if (diff === 0 && isTodayPast) {
        diff = frequency === 'BIWEEKLY' ? 14 : 7;
      }
      if (diff === 0 && !isTodayPast) {
        diff = 0;
      }
      if (diff > 0 && diff < minDaysAhead) {
        minDaysAhead = diff;
      }
    }

    if (minDaysAhead === 999) minDaysAhead = 7;
    target.setDate(fromDate.getDate() + minDaysAhead);
    target.setHours(hours, minutes, 0, 0);
    return target;
  }
  async create(
    userId: string,
    createTournamentDto: CreateTournamentDto,
    systemRoles: string[] = [],
  ) {
    // 0. Hard limit check: Max 100 tournaments per creator (except ADMIN)
    const isAdmin = systemRoles.includes('ADMIN');
    if (!isAdmin) {
      const createdCount =
        await this.tournamentsRepository.countCreatedTournaments(userId);
      if (createdCount >= 100) {
        throw new BadRequestException(
          'Bạn đã đạt giới hạn tối đa 100 giải đấu được phép tạo.',
        );
      }
    }

    validateRegistrationMode(createTournamentDto.tournamentConfig);
    createTournamentDto.tournamentConfig = applyDefaultDoublesPairingMode(createTournamentDto.matchType, createTournamentDto.tournamentConfig);
    await this.tournamentFeePolicyService.assertEntryFeeAllowed(createTournamentDto.entryFee);

    // 1. Validate category existence and sportRules default fallback
    const category = await this.tournamentsRepository.findCategory(
      createTournamentDto.categoryId,
    );
    if (!category) {
      throw new NotFoundException('Hạng đấu không tồn tại');
    }

    if (!createTournamentDto.sportRules) {
      const config = category.categoryConfig as CategoryConfig;
      if (config && config.defaultSportRules) {
        createTournamentDto.sportRules =
          config.defaultSportRules as unknown as Record<string, unknown>;
      } else {
        createTournamentDto.sportRules = {};
      }
    }

    const categoryConfig = category.categoryConfig as
      | CategoryConfig
      | null
      | undefined;
    validateMatchTypeAgainstCategory(categoryConfig, createTournamentDto.matchType, 'tournament');
    validateMatchTypeGenderRestriction(createTournamentDto.matchType, createTournamentDto.genderRestriction, 'tournament');

    const expectedSportKind = inferExpectedSportRuleKind({
      categoryConfig: category.categoryConfig as
        | Record<string, unknown>
        | null
        | undefined,
      categoryName: category.name,
      categorySlug: category.slug,
    });
    validateSportRuleConfig(createTournamentDto.sportRules, {
      expectedKind: expectedSportKind,
      allowedKinds: inferAllowedSportRuleKinds({
        categoryConfig: category.categoryConfig as
          | Record<string, unknown>
          | null
          | undefined,
        categoryName: category.name,
        categorySlug: category.slug,
      }),
      sourceLabel: 'sportRules',
    });
    if (expectedSportKind === 'FOOTBALL') {
      assertValidFootballTeamConfig(createTournamentDto.tournamentConfig, {
        requireTeamSize: true,
      });
    }

    // 2. Validate dates
    if (
      createTournamentDto.registrationStartDate &&
      createTournamentDto.registrationEndDate
    ) {
      const regStart = new Date(createTournamentDto.registrationStartDate);
      const regEnd = new Date(createTournamentDto.registrationEndDate);
      if (regEnd <= regStart) {
        throw new BadRequestException(
          'Ngày kết thúc đăng ký phải sau ngày bắt đầu đăng ký',
        );
      }
    }
    if (createTournamentDto.startDate && createTournamentDto.endDate) {
      const tStart = new Date(createTournamentDto.startDate);
      const tEnd = new Date(createTournamentDto.endDate);
      if (tEnd <= tStart) {
        throw new BadRequestException(
          'Ngày kết thúc giải đấu phải sau ngày bắt đầu',
        );
      }
    }
    if (
      createTournamentDto.registrationEndDate &&
      createTournamentDto.startDate
    ) {
      const regEnd = new Date(createTournamentDto.registrationEndDate);
      const tStart = new Date(createTournamentDto.startDate);
      if (tStart < regEnd) {
        throw new BadRequestException(
          'Ngày bắt đầu giải đấu phải sau hoặc bằng ngày kết thúc đăng ký',
        );
      }
    }

    if (
      createTournamentDto.communityId &&
      createTournamentDto.tournamentType !== 'CLUB'
    ) {
      throw new BadRequestException('Giải gắn với CLB phải có loại CLUB.');
    }

    // 3. CLUB vs PUBLIC validation rules & authorization
    const isSystemAuthorized = this.tournamentAccessService.isSystemTournamentCreator(systemRoles);

    if (createTournamentDto.tournamentType === 'CLUB') {
      if (!createTournamentDto.communityId) {
        throw new BadRequestException(
          'Giải đấu của câu lạc bộ phải thuộc một cộng đồng',
        );
      }
      if (createTournamentDto.entryFee && createTournamentDto.entryFee > 0) {
        throw new BadRequestException('Giải đấu của câu lạc bộ phải miễn phí');
      }
      if (
        createTournamentDto.galleryImages &&
        createTournamentDto.galleryImages.length > 0
      ) {
        throw new BadRequestException(
          'Giải đấu của câu lạc bộ không được có ảnh thư viện khi tạo',
        );
      }

      // Advanced club tournaments are not the Lite exception: they require
      // the global ORGANIZER/ADMIN capability and the caller must still be
      // authorized within the target club tenant.
      if (!isSystemAuthorized) {
        throw new ForbiddenException(
          'Giải nâng cao trong câu lạc bộ yêu cầu quyền Ban tổ chức hoặc Admin.',
        );
      }
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
            'Bạn cần vừa có quyền Ban tổ chức vừa là Chủ/Điều hành viên của đúng câu lạc bộ để tạo giải nâng cao.',
          );
        }
      }
    } else {
      // PUBLIC tournament
      // Public tournaments, including child tournaments, still require organizer-level permission.
      if (!isSystemAuthorized) {
        throw new ForbiddenException(
          'Bạn cần có quyền Ban tổ chức để tạo giải đấu công khai.',
        );
      }
    }

    // 4. Validate duplicate division if parentId exists
    if (createTournamentDto.parentId) {
      const siblings = await this.tournamentsRepository.findByParentId(
        createTournamentDto.parentId,
      );
      const isDuplicate = siblings.some(
        (div) => div.matchType === createTournamentDto.matchType,
      );
      if (isDuplicate) {
        throw new BadRequestException(
          'Hình thức thi đấu này đã tồn tại trong giải đấu',
        );
      }
    }

    // 5. Validate venueId
    if (createTournamentDto.venueId) {
      const venue = await this.tournamentsRepository.findByIdVenue(
        createTournamentDto.venueId,
      );
      if (!venue) {
        throw new BadRequestException('Địa điểm không tồn tại');
      }
    }

    const record = await this.tournamentsRepository.create(
      userId,
      createTournamentDto,
    );

    // Auto-post to Community Feed ONLY IF tournament is a CLUB tournament (internal to community)
    if (
      record.tournamentType === 'CLUB' &&
      record.communityId &&
      !record.parentId
    ) {
      try {
        const post = await this.communitySocialRepository.createTournamentPost(
          record.communityId,
          userId,
          record.id,
          record.name,
          record.bannerUrl,
        );
        if (post?.id) {
          void this.notifyCommunityTournamentCreated({
            communityId: record.communityId,
            tournamentId: record.id,
            tournamentName: record.name,
            senderId: userId,
            postId: post.id,
            isLite: false,
          });
        }
      } catch (err) {
        console.error('Failed to auto-post tournament to community feed:', err);
      }
    }

    // Invalidate tournament list cache
    try {
      await this.redisService.delByPattern('tournaments:list:*');
      await this.redisService.delByPattern('matches:list:*');
    } catch {
      // Redis down — ignore
    }

    return mapTournamentFormat(record);
  }
  async update(
    id: string,
    userId: string,
    updateTournamentDto: UpdateTournamentDto,
    systemRoles: string[] = [],
  ) {
    validateRegistrationMode(updateTournamentDto.tournamentConfig);

    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Giải đấu không tồn tại');
    const existingConfig = (existing.tournamentConfig || {}) as Record<
      string,
      unknown
    >;
    const incomingConfigPatch = updateTournamentDto.tournamentConfig;

    // Once registration is closed or explicitly locked, registration controls
    // must not be changed as an accidental way to reopen or extend the roster.
    if (
      existing.status === 'REGISTRATION_CLOSED' ||
      existing.isRegistrationLocked
    ) {
      const lockedRegistrationFields: (keyof UpdateTournamentDto)[] = [
        'registrationStartDate',
        'registrationEndDate',
        'maxParticipants',
        'visibility',
      ];
      for (const field of lockedRegistrationFields) {
        if (
          updateTournamentDto[field] !== undefined &&
          updateTournamentDto[field] !==
            (existing as Record<string, unknown>)[field]
        ) {
          throw new BadRequestException(
            'Đăng ký đã được khóa. Hãy dùng thao tác mở lại đăng ký được kiểm soát trước khi thay đổi thời gian hoặc số lượng.',
          );
        }
      }

      if (incomingConfigPatch) {
        for (const key of [
          'registrationMode',
          'registrationForm',
          'doublesPairingMode',
        ]) {
          if (
            incomingConfigPatch[key] !== undefined &&
            !isDeepStrictEqual(incomingConfigPatch[key], existingConfig[key])
          ) {
            throw new BadRequestException(
              'Đăng ký đã được khóa. Không thể thay đổi chế độ hoặc biểu mẫu đăng ký ở giai đoạn này.',
            );
          }
        }
      }
    }

    const categoryId = updateTournamentDto.categoryId ?? existing.categoryId;
    const category = await this.tournamentsRepository.findCategory(categoryId);
    if (!category) {
      throw new NotFoundException('Hạng đấu không tồn tại');
    }

    // ADMIN, ORGANIZER, chủ giải hoặc đồng tổ chức (CO_ORGANIZER) có thể cập nhật
    let canUpdate = await this.tournamentAccessService.isManager(existing, userId, systemRoles);

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
      throw new ForbiddenException(
        'Trạng thái giải chỉ được thay đổi qua các thao tác nghiệp vụ hoặc bởi Quản trị viên.',
      );
    }
    if (
      updateTournamentDto.visibility === 'PUBLIC' &&
      existing.visibility !== 'PUBLIC' &&
      existing.status !== 'DRAFT' &&
      !isAdmin
    ) {
      throw new BadRequestException(
        'Muốn công khai giải nội bộ, hãy đưa giải về bản nháp và công bố để chờ Quản trị viên xét duyệt.',
      );
    }

    await this.tournamentFeePolicyService.assertEntryFeeAllowed(updateTournamentDto.entryFee);

    // Validations during update based on tournament lifecycle status
    if (existing.status !== 'DRAFT') {
      const lockedCoreFields: (keyof UpdateTournamentDto)[] = [
        'matchType',
        'categoryId',
        'platformFeePercentage',
        'isRanked',
      ];
      for (const field of lockedCoreFields) {
        if (
          updateTournamentDto[field] !== undefined &&
          updateTournamentDto[field] !==
            (existing as Record<string, unknown>)[field]
        ) {
          throw new BadRequestException(
            'Không thể thay đổi trường cốt lõi sau khi giải được xuất bản',
          );
        }
      }
      // Check tournamentConfig core fields
      if (incomingConfigPatch) {
        const configCoreFields = [
          'bracketType',
          'minElo',
          'maxElo',
          'maxCombinedElo',
          'maxTeammateGap',
        ];
        for (const key of configCoreFields) {
          if (
            incomingConfigPatch[key] !== undefined &&
            !isDeepStrictEqual(incomingConfigPatch[key], existingConfig[key])
          ) {
            throw new BadRequestException(
              `Không thể sửa khóa cấu hình giải đấu '${key}' sau khi giải được xuất bản`,
            );
          }
        }
      }
    }

    if (existing.status === 'IN_PROGRESS' || existing.status === 'COMPLETED') {
      const unsafeFields: (keyof UpdateTournamentDto)[] = [
        'matchType',
        'maxParticipants',
        'categoryId',
        'platformFeePercentage',
        'registrationStartDate',
        'registrationEndDate',
        'sportRules',
        'isRanked',
      ];
      for (const field of unsafeFields) {
        if (
          updateTournamentDto[field] !== undefined &&
          updateTournamentDto[field] !==
            (existing as Record<string, unknown>)[field]
        ) {
          throw new BadRequestException(
            `Không thể sửa trường '${field}' khi giải đấu đang diễn ra hoặc đã kết thúc`,
          );
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

    const regStartVal =
      updateTournamentDto.registrationStartDate !== undefined
        ? updateTournamentDto.registrationStartDate
          ? new Date(updateTournamentDto.registrationStartDate)
          : null
        : existing.registrationStartDate
          ? new Date(existing.registrationStartDate)
          : null;

    const regEndVal =
      updateTournamentDto.registrationEndDate !== undefined
        ? updateTournamentDto.registrationEndDate
          ? new Date(updateTournamentDto.registrationEndDate)
          : null
        : existing.registrationEndDate
          ? new Date(existing.registrationEndDate)
          : null;

    if (regStartVal && regEndVal && regEndVal <= regStartVal) {
      throw new BadRequestException(
        'Ngày kết thúc đăng ký phải sau ngày bắt đầu đăng ký',
      );
    }

    const tStartVal =
      updateTournamentDto.startDate !== undefined
        ? updateTournamentDto.startDate
          ? new Date(updateTournamentDto.startDate)
          : null
        : existing.startDate
          ? new Date(existing.startDate)
          : null;

    const tEndVal =
      updateTournamentDto.endDate !== undefined
        ? updateTournamentDto.endDate
          ? new Date(updateTournamentDto.endDate)
          : null
        : existing.endDate
          ? new Date(existing.endDate)
          : null;

    if (tStartVal && tEndVal && tEndVal <= tStartVal) {
      throw new BadRequestException(
        'Ngày kết thúc giải đấu phải sau ngày bắt đầu',
      );
    }

    if (tStartVal && regEndVal && tStartVal < regEndVal) {
      throw new BadRequestException(
        'Ngày bắt đầu giải đấu phải sau hoặc bằng ngày kết thúc đăng ký',
      );
    }

    if (
      updateTournamentDto.entryFee &&
      existing.tournamentType === 'CLUB' &&
      updateTournamentDto.entryFee > 0
    ) {
      throw new BadRequestException(
        'Giải đấu của câu lạc bộ phải luôn miễn phí',
      );
    }

    const categoryConfig = category.categoryConfig as
      | CategoryConfig
      | null
      | undefined;
    const finalMatchType = updateTournamentDto.matchType ?? existing.matchType;
    let finalGenderRestriction =
      updateTournamentDto.genderRestriction !== undefined
        ? updateTournamentDto.genderRestriction
        : existing.genderRestriction;

    // Auto-heal corrupted gender restriction in database
    if (
      finalMatchType === 'MIXED_DOUBLES' &&
      finalGenderRestriction !== 'MIXED'
    ) {
      finalGenderRestriction = GenderRestriction.MIXED;
      updateTournamentDto.genderRestriction = GenderRestriction.MIXED; // ensure it overwrites corrupted DB state
    } else if (
      (finalMatchType === 'SINGLES' || finalMatchType === 'DOUBLES') &&
      finalGenderRestriction === 'MIXED'
    ) {
      finalGenderRestriction = null;
      updateTournamentDto.genderRestriction = null;
    }

    validateMatchTypeAgainstCategory(categoryConfig, finalMatchType, 'tournament');
    validateMatchTypeGenderRestriction(finalMatchType, finalGenderRestriction, 'tournament');

    if (updateTournamentDto.sportRules) {
      validateSportRuleConfig(updateTournamentDto.sportRules, {
        expectedKind: inferExpectedSportRuleKind({
          categoryConfig: category.categoryConfig as
            | Record<string, unknown>
            | null
            | undefined,
          categoryName: category.name,
          categorySlug: category.slug,
        }),
        allowedKinds: inferAllowedSportRuleKinds({
          categoryConfig: category.categoryConfig as
            | Record<string, unknown>
            | null
            | undefined,
          categoryName: category.name,
          categorySlug: category.slug,
        }),
        sourceLabel: 'sportRules',
      });
    }

    if (
      updateTournamentDto.bannerUrl !== undefined &&
      existing.bannerUrl &&
      existing.bannerUrl !== updateTournamentDto.bannerUrl
    ) {
      await this.tournamentMediaService.cleanupTournamentImages({
        bannerUrl: existing.bannerUrl,
      });
    }

    if (
      updateTournamentDto.logoUrl !== undefined &&
      existing.logoUrl &&
      existing.logoUrl !== updateTournamentDto.logoUrl
    ) {
      await this.tournamentMediaService.cleanupTournamentImages({
        logoUrl: existing.logoUrl,
      });
    }

    const updated = await this.tournamentsRepository.update(
      id,
      userId,
      updateTournamentDto,
    );

    // Introduction and visual identity are shared by a multi-division
    // tournament. Keep the parent projection in sync for every management
    // write path (inline overview, Basic Info tab, API clients), but only when
    // the caller also owns the parent or is an administrator. A co-organizer
    // may still update the child division without receiving parent access.
    if (
      existing.parentId &&
      (updateTournamentDto.description !== undefined ||
        updateTournamentDto.bannerUrl !== undefined ||
        updateTournamentDto.logoUrl !== undefined)
    ) {
      try {
        const parent = await this.tournamentsRepository.findParentById(
          existing.parentId,
        );
        if (
          parent &&
          (parent.createdBy === userId || systemRoles.includes('ADMIN'))
        ) {
          await this.tournamentsRepository.updateParent(
            existing.parentId,
            userId,
            {
              ...(updateTournamentDto.description !== undefined && {
                description: updateTournamentDto.description,
              }),
              ...(updateTournamentDto.bannerUrl !== undefined && {
                bannerUrl: updateTournamentDto.bannerUrl,
              }),
              ...(updateTournamentDto.logoUrl !== undefined && {
                logoUrl: updateTournamentDto.logoUrl,
              }),
            },
          );
        }
      } catch (error) {
        // The child update is already committed and remains canonical. A
        // parent sync failure must never turn that successful PATCH into an
        // error response for the organizer.
        console.error(
          `Failed to sync parent tournament ${existing.parentId}:`,
          error,
        );
      }
    }

    // Thông báo cho người theo dõi khi dời lịch
    const dateChanged =
      (updateTournamentDto.startDate &&
        updateTournamentDto.startDate !==
          (existing.startDate?.toISOString() ?? null)) ||
      (updateTournamentDto.endDate &&
        updateTournamentDto.endDate !==
          (existing.endDate?.toISOString() ?? null)) ||
      (updateTournamentDto.registrationStartDate &&
        updateTournamentDto.registrationStartDate !==
          (existing.registrationStartDate?.toISOString() ?? null)) ||
      (updateTournamentDto.registrationEndDate &&
        updateTournamentDto.registrationEndDate !==
          (existing.registrationEndDate?.toISOString() ?? null));

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
      const siblings = await this.tournamentsRepository.findByParentId(
        existing.parentId,
      );
      const sharedFields: Record<string, unknown> = {};
      const fieldsToCheck = [
        'categoryId',
        'description',
        'bannerUrl',
        'logoUrl',
        'prizeDescription',
        'contactInfo',
        'visibility',
        'venueId',
        'city',
        'startDate',
        'endDate',
        'registrationStartDate',
        'registrationEndDate',
        'entryFee',
        'platformFeePercentage',
      ];
      for (const field of fieldsToCheck) {
        if (updateTournamentDto[field] !== undefined) {
          sharedFields[field] = updateTournamentDto[field];
        }
      }
      if (Object.keys(sharedFields).length > 0) {
        for (const sibling of siblings) {
          if (sibling.id !== id) {
            await this.tournamentsRepository.update(
              sibling.id,
              userId,
              sharedFields,
            );
          }
        }
      }
    }

    // Invalidate tournament list cache
    try {
      await this.redisService.delByPattern('tournaments:list:*');
      await this.redisService.delByPattern('matches:list:*');
    } catch {
      // Redis down — ignore
    }

    return mapTournamentFormat(updated);
  }
  async remove(id: string, userId: string, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Giải đấu không tồn tại');

    if (existing.parentId) {
      const siblings = await this.tournamentsRepository.findByParentId(
        existing.parentId,
      );
      if (siblings.length <= 1) {
        throw new BadRequestException(
          'Không thể xóa hình thức thi đấu cuối cùng của giải đấu. Nếu muốn xóa toàn bộ giải đấu, vui lòng xóa Giải đấu lớn.',
        );
      }
    }

    // Check permissions: creator of tournament, club owner/moderator, or admin
    let hasPermission = await this.tournamentAccessService.isManager(existing, userId, systemRoles);

    if (!hasPermission && existing.createdBy === userId) {
      hasPermission = true;
    }

    if (!hasPermission && existing.communityId) {
      if (typeof this.tournamentsRepository.findCommunityById === 'function') {
        const community = await this.tournamentsRepository.findCommunityById(
          existing.communityId,
        );
        if (community && community.creatorId === userId) {
          hasPermission = true;
        }
      }
      if (!hasPermission) {
        const member = await this.tournamentsRepository.findCommunityMember(
          existing.communityId,
          userId,
        );
        if (
          member &&
          (member.status === 'JOINED' || member.status === 'ACTIVE') &&
          ['OWNER', 'MODERATOR'].includes(
            member.role?.toUpperCase?.() ?? member.role,
          )
        ) {
          hasPermission = true;
        }
      }
    }

    if (!hasPermission) {
      throw new ForbiddenException('Bạn không có quyền xóa giải đấu này');
    }

    // Check payment safety before allowing deletion
    const paidPayments = await this.tournamentsRepository.countPaidPayments(id);
    const pendingRefunds =
      await this.tournamentsRepository.countPendingRefunds(id);
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
      // Archived tournaments must no longer be promoted from the club feed.
      // Keep the tournament/ELO history, but hide every linked announcement.
      try {
        await this.communitySocialRepository.softDeletePostsByTournamentId(id);
      } catch (err) {
        this.logger.warn(
          `Failed to soft delete tournament community posts for archived tournament ${id}`,
          err,
        );
      }
      try {
        await this.redisService.delByPattern('tournaments:list:*');
        await this.redisService.delByPattern('matches:list:*');
      } catch {
        // Redis down - ignore
      }
      return {
        ...archived,
        archived: true,
        message:
          'Giải đã hoàn thành được lưu trữ để giữ lịch sử giải đấu và ELO.',
      };
    }

    // If System ADMIN, delete immediately
    if (systemRoles.includes('ADMIN')) {
      await this.tournamentMediaService.cleanupTournamentImages(existing);
      const result = await this.tournamentsRepository.softDelete(id, userId);
      try {
        await this.communitySocialRepository.softDeletePostsByTournamentId(id);
      } catch (err) {
        console.error('Failed to soft delete tournament community posts:', err);
      }
      // Invalidate tournament list cache
      try {
        await this.redisService.delByPattern('tournaments:list:*');
        await this.redisService.delByPattern('matches:list:*');
      } catch {
        // Redis down — ignore
      }
      return result;
    }

    // Check if Lite or Club tournament: Club managers/creators can delete their own club/lite tournaments directly
    const tCfg = (existing.tournamentConfig || {}) as Record<string, unknown>;
    const isLiteOrClub =
      existing.communityId != null ||
      existing.tournamentType === 'CLUB' ||
      tCfg?.isLite === true ||
      tCfg?.mode === 'LITE';

    // Non-draft tournaments with participants or locked/live states must go through admin review (unless Lite/Club tournament without payments)
    if (existing.status !== 'DRAFT' && !isLiteOrClub) {
      const activeParticipants =
        await this.tournamentsRepository.countActiveParticipants(id);
      const requiresReview =
        activeParticipants > 0 ||
        existing.isRegistrationLocked ||
        [
          'REGISTRATION_CLOSED',
          'UPCOMING',
          'IN_PROGRESS',
          'ONGOING',
          'COMPLETED',
        ].includes(existing.status);

      if (requiresReview) {
        await this.tournamentsRepository.updateStatus(id, 'PENDING_DELETE');
        return {
          pendingDelete: true,
          message:
            'Giải đấu đã có người tham gia hoặc đã bước vào giai đoạn chốt danh sách/thi đấu. Yêu cầu xóa đã được gửi tới Quản trị viên để xét duyệt.',
        };
      }
    }

    await this.tournamentMediaService.cleanupTournamentImages(existing);
    const result = await this.tournamentsRepository.softDelete(id, userId);

    try {
      await this.communitySocialRepository.softDeletePostsByTournamentId(id);
    } catch (err) {
      console.error('Failed to soft delete tournament community posts:', err);
    }

    // Invalidate tournament list cache
    try {
      await this.redisService.delByPattern('tournaments:list:*');
      await this.redisService.delByPattern('matches:list:*');
    } catch {
      // Redis down — ignore
    }

    return result;
  }
  async removeParent(id: string, userId: string, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findParentById(id);
    if (!existing) throw new NotFoundException('Giải đấu cha không tồn tại');

    // System ADMIN or creator can delete parent tournament
    const canDelete = await this.tournamentAccessService.isManager(existing, userId, systemRoles);
    if (!canDelete) {
      throw new ForbiddenException('Bạn không có quyền xóa giải đấu lớn này');
    }

    // Check payment safety across all child tournaments before allowing deletion
    const divisions = await this.tournamentsRepository.findByParentId(id);
    for (const div of divisions) {
      const paidPayments = await this.tournamentsRepository.countPaidPayments(
        div.id,
      );
      const pendingRefunds =
        await this.tournamentsRepository.countPendingRefunds(div.id);
      const fullyRefunded = await this.tournamentsRepository.isFullyRefunded(
        div.id,
      );

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
    const completedDivisions = divisions.filter(
      (div) => div.status === 'COMPLETED',
    );
    if (completedDivisions.length > 0) {
      for (const division of completedDivisions) {
        await this.tournamentsRepository.archive(division.id, userId);
      }
      try {
        await this.redisService.delByPattern('tournaments:list:*');
        await this.redisService.delByPattern('matches:list:*');
      } catch {
        // Redis down - ignore
      }
      return {
        archived: true,
        archivedTournamentIds: completedDivisions.map(
          (division) => division.id,
        ),
        message:
          'Các giải đã hoàn thành được lưu trữ để giữ lịch sử giải đấu và ELO.',
      };
    }

    // If System ADMIN, delete immediately
    if (systemRoles.includes('ADMIN')) {
      const result = await this.tournamentsRepository.softDeleteParent(
        id,
        userId,
      );
      // Soft-delete associated community posts
      try {
        await this.communitySocialRepository.softDeletePostsByTournamentId(id);
      } catch {
        // ignore
      }
      // Invalidate tournament list cache
      try {
        await this.redisService.delByPattern('tournaments:list:*');
        await this.redisService.delByPattern('matches:list:*');
      } catch {
        // Redis down — ignore
      }
      return result;
    }

    // Parent tournaments with participants or locked/live child divisions must go through admin review
    for (const div of divisions) {
      if (div.status !== 'DRAFT') {
        const activeParticipants =
          await this.tournamentsRepository.countActiveParticipants(div.id);
        const requiresReview =
          activeParticipants > 0 ||
          div.isRegistrationLocked ||
          [
            'REGISTRATION_CLOSED',
            'UPCOMING',
            'IN_PROGRESS',
            'ONGOING',
            'COMPLETED',
          ].includes(div.status);

        if (requiresReview) {
          for (const d of divisions) {
            await this.tournamentsRepository.updateStatus(
              d.id,
              'PENDING_DELETE',
            );
          }
          return {
            pendingDelete: true,
            message:
              'Giải đấu đã có người tham gia hoặc đã bước vào giai đoạn chốt danh sách/thi đấu. Yêu cầu xóa đã được gửi tới Quản trị viên để xét duyệt.',
          };
        }
      }
    }

    // Invalidate tournament list cache
    try {
      await this.redisService.delByPattern('tournaments:list:*');
      await this.redisService.delByPattern('matches:list:*');
    } catch {
      // Redis down — ignore
    }

    const deleteResult = await this.tournamentsRepository.softDeleteParent(
      id,
      userId,
    );

    // Soft-delete associated community posts & polls
    try {
      await this.communitySocialRepository.softDeletePostsByTournamentId(id);
    } catch {
      // ignore
    }

    return deleteResult;
  }
  async publish(id: string, userId: string, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.tournamentAccessService.isManager(existing, userId, systemRoles);

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
      throw new BadRequestException(
        'Mô tả giải đấu phải có ít nhất 10 ký tự trước khi công bố.',
      );
    }

    // Khởi tạo updateData cho publish
    const updateData: Record<string, unknown> = {};

    if (!existing.startDate) {
      throw new BadRequestException(
        'Vui lòng cấu hình ngày bắt đầu giải đấu trước khi công bố.',
      );
    }

    if (!existing.endDate) {
      throw new BadRequestException(
        'Vui lòng cấu hình ngày kết thúc giải đấu trước khi công bố.',
      );
    }

    // Ràng buộc logic ngày tháng
    if (
      existing.startDate &&
      existing.endDate &&
      new Date(existing.startDate) >= new Date(existing.endDate)
    ) {
      throw new BadRequestException(
        'Ngày bắt đầu phải trước ngày kết thúc giải đấu.',
      );
    }

    if (!existing.registrationStartDate) {
      throw new BadRequestException(
        'Vui lòng cấu hình ngày bắt đầu đăng ký trước khi công bố.',
      );
    }

    if (!existing.registrationEndDate) {
      throw new BadRequestException(
        'Vui lòng cấu hình ngày kết thúc đăng ký trước khi công bố.',
      );
    }

    if (
      existing.registrationStartDate &&
      existing.registrationEndDate &&
      new Date(existing.registrationStartDate) >=
        new Date(existing.registrationEndDate)
    ) {
      throw new BadRequestException(
        'Ngày mở đăng ký phải trước ngày đóng đăng ký.',
      );
    }

    if (
      existing.registrationEndDate &&
      existing.startDate &&
      new Date(existing.registrationEndDate) > new Date(existing.startDate)
    ) {
      throw new BadRequestException(
        'Ngày đóng đăng ký phải trước ngày khởi tranh.',
      );
    }

    if (!existing.venueId) {
      throw new BadRequestException(
        'Vui lòng cấu hình địa điểm thi đấu (sân đấu) trước khi công bố.',
      );
    }

    // Kiểm tra có ít nhất 1 thông tin liên hệ (email hoặc số điện thoại)
    const contactInfo = existing.contactInfo as
      | Record<string, unknown>
      | null
      | undefined;
    const hasContact =
      contactInfo &&
      ((contactInfo.phone &&
        typeof contactInfo.phone === 'string' &&
        contactInfo.phone.trim() !== '') ||
        (contactInfo.email &&
          typeof contactInfo.email === 'string' &&
          contactInfo.email.trim() !== '') ||
        (contactInfo.phone && typeof contactInfo.phone === 'number'));
    if (!hasContact) {
      throw new BadRequestException(
        'Vui lòng cập nhật ít nhất 1 thông tin liên hệ (email hoặc số điện thoại) trước khi công bố.',
      );
    }

    if (existing.entryFee === undefined || existing.entryFee === null) {
      throw new BadRequestException(
        'Vui lòng cấu hình lệ phí tham gia trước khi công bố giải đấu.',
      );
    }

    // Kiểm tra có ít nhất 1 division
    const divisions =
      await this.tournamentsRepository.getDivisionsByTournament(id);
    if (!divisions || divisions.length === 0) {
      throw new BadRequestException(
        'Vui lòng tạo ít nhất 1 nội dung thi đấu trước khi công bố.',
      );
    }

    // Cập nhật banner/logo mặc định nếu thiếu
    if (Object.keys(updateData).length > 0) {
      await this.tournamentsRepository.update(id, userId, updateData);
    }

    const publishFee = await this.tournamentFeePolicyService.getPublishFee(existing.tournamentType, existing.isRanked);
    if (publishFee > 0) {
      throw new BadRequestException(
        `Vui lòng thanh toán phí công bố giải đấu ${publishFee.toLocaleString('vi-VN')}đ trước khi công bố.`,
      );
    }

    // Xóa dữ liệu mock trước khi mở đăng ký
    await this.tournamentsRepository.clearMockParticipants(id);

    // Chỉ giải công khai mới cần Admin duyệt. Giải riêng INVITE_ONLY của
    // Organizer có thể mở ngay sau khi kiểm tra đủ dữ liệu.
    const isAdmin = systemRoles.includes('ADMIN');
    const notYetOpen =
      existing.registrationStartDate &&
      new Date(existing.registrationStartDate) > new Date();
    const requiresAdminApproval = !isAdmin && existing.visibility === 'PUBLIC';
    const targetStatus = requiresAdminApproval
      ? 'PENDING_APPROVAL'
      : notYetOpen
        ? 'UPCOMING'
        : 'REGISTRATION_OPEN';
    const updated = await this.tournamentsRepository.update(id, userId, {
      status: targetStatus,
    });

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

    return mapTournamentFormat(updated);
  }
  async lock(
    id: string,
    userId: string,
    generateBracket: () => Promise<unknown>,
    systemRoles: string[] = [],
  ) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.tournamentAccessService.isManager(existing, userId, systemRoles);

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

    if (
      existing.status !== 'REGISTRATION_OPEN' &&
      existing.status !== 'REGISTRATION_CLOSED'
    ) {
      throw new BadRequestException(
        'Đăng ký giải đấu phải mở hoặc đã đóng để có thể chốt',
      );
    }

    // Kiem tra da co cau hinh mac dinh cho division chua
    const allDivs =
      await this.tournamentsRepository.getDivisionsByTournament(id);
    const category = await this.tournamentsRepository.findCategory(
      existing.categoryId,
    );
    for (const d of allDivs) {
      if (!category) {
        throw new NotFoundException('Hạng đấu không tồn tại');
      }

      const resolvedRules = resolveEffectiveSportRules({
        tournamentSportRules: existing.sportRules as
          | Record<string, unknown>
          | null
          | undefined,
        categoryConfig: category.categoryConfig as
          | Record<string, unknown>
          | null
          | undefined,
        categoryName: category.name,
        categorySlug: category.slug,
        stageRoundConfig: d.roundConfig as
          | Record<string, unknown>
          | null
          | undefined,
      });
      if (resolvedRules.setsToWin < 1 || resolvedRules.pointsPerSet < 1) {
        throw new BadRequestException(
          'Vui lòng cấu hình luật thi đấu hợp lệ cho "' +
            d.name +
            '" trước khi chốt danh sách.',
        );
      }
    }

    const participants =
      await this.tournamentsRepository.findPublicParticipants(
        id,
        existing.categoryId,
      );
    if (participants.length < 2) {
      throw new BadRequestException(
        'Cần ít nhất 2 người tham gia để chốt và tạo sơ đồ thi đấu',
      );
    }

    // Team sport (bóng đá): validate đội hình — mỗi đội phải đủ MAIN >= minTeamSize.
    const lockConfig = (existing.tournamentConfig || {}) as Record<
      string,
      unknown
    >;
    const lockFootballConfig = resolveFootballTeamConfig(lockConfig);
    const lockMinTeamSize = lockFootballConfig.isTeamSport
      ? lockFootballConfig.mainSize
      : 0;
    if (lockMinTeamSize > 0) {
      for (const p of participants) {
        const members =
          (p as unknown as { members?: Array<{ role?: string }> }).members ||
          [];
        const mainCount = members.filter(
          (m) => (m.role || 'MAIN') === 'MAIN',
        ).length;
        if (mainCount < lockMinTeamSize) {
          throw new BadRequestException(
            `Đội "${p.teamName}" chưa đủ đội hình (cần tối thiểu ${lockMinTeamSize} cầu thủ chính thức, hiện có ${mainCount}).`,
          );
        }
      }
    }

    const totalPlayers = participants.reduce(
      (sum, p) => sum + (p.members?.length || 0),
      0,
    );
    const platformFeePercentage = Number(existing.platformFeePercentage || 0);
    // Registration payments persist the authoritative fee for each division,
    // including the per-payment cap. Use that aggregate instead of the legacy
    // tournament-level entryFee multiplied by player count.
    const totalPlatformFee =
      await this.tournamentsRepository.sumCompletedRegistrationPlatformFees(id);

    const isClubOrFree =
      existing.tournamentType === 'CLUB' || totalPlatformFee === 0;
    const targetStatus = isClubOrFree ? 'UPCOMING' : 'REGISTRATION_CLOSED';

    // Sinh bracket trước, chỉ update status khi bracket generation thành công
    let bracket: unknown = null;
    try {
      bracket = await generateBracket();
    } catch (err) {
      throw new BadRequestException(
        'Failed to generate tournament bracket: ' + err.message,
      );
    }

    const now = new Date();
    const updated = await this.tournamentsRepository.update(id, userId, {
      status: targetStatus,
      isRegistrationLocked: true,
      registrationEndDate: now.toISOString(),
    });

    return {
      tournament: mapTournamentFormat(updated),
      summary: {
        totalParticipants: participants.length,
        totalPlayers,
        platformFeePercentage,
        totalPlatformFee,
      },
      bracket,
    };
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

    let isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);

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
      throw new ForbiddenException('Bạn không có quyền xem nhật ký vận hành');
    }

    return this.tournamentsRepository.findOpsAuditLogs(
      tournamentId,
      divisionId,
    );
  }
  async cancelTournament(
    id: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);

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

    if (
      tournament.status === 'CANCELLED' ||
      tournament.status === 'COMPLETED'
    ) {
      throw new BadRequestException(
        'Giải đấu đã bị hủy hoặc đã hoàn thành, không thể hủy.',
      );
    }

    const updatedTournament =
      await this.tournamentsRepository.cancelTournament(id);

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

      await Promise.all(notifications);
    } catch (err) {
      console.error('Failed to send cancelTournament notifications:', err);
    }

    return updatedTournament;
  }
  async toggleRecurringTournament(
    id: string,
    enabled: boolean,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
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
      throw new ForbiddenException(
        'Bạn không có quyền quản lý lịch tự động của giải đấu này',
      );
    }

    const config = (tournament.tournamentConfig || {}) as Record<string, any>;
    const recurring = config.recurring || {};
    if (!recurring || typeof recurring !== 'object') {
      throw new BadRequestException(
        'Giải đấu này không có thiết lập lịch tự động',
      );
    }

    const updatedConfig = {
      ...config,
      recurring: {
        ...recurring,
        enabled: Boolean(enabled),
      },
    };

    return await this.tournamentsRepository.update(id, userId, {
      tournamentConfig: updatedConfig,
    });
  }
  async deleteRecurringTournament(
    id: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
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
      throw new ForbiddenException(
        'Bạn không có quyền quản lý lịch tự động của giải đấu này',
      );
    }

    const config = (tournament.tournamentConfig || {}) as Record<string, any>;
    const updatedConfig = { ...config };
    delete updatedConfig.recurring;

    return await this.tournamentsRepository.update(id, userId, {
      tournamentConfig: updatedConfig,
    });
  }
}
