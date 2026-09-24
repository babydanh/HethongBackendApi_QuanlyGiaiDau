import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TournamentsRepository } from '../tournaments.repository';
import { CreateLiteTournamentDto } from '../dto/create-lite-tournament.dto';
import { RegisterTournamentDto } from '../dto/register-tournament.dto';
import { CreateTournamentDto } from '../dto/create-tournament.dto';
import { UpdateBracketSlotsDto } from '../dto/update-bracket-slots.dto';
import { PairLiteParticipantsDto } from '../dto/pair-lite-participants.dto';
import { GenerateLitePairsDto } from '../dto/generate-lite-pairs.dto';
import {
  DivisionBracketType,
  GenderRestriction,
  MatchType,
} from '../dto/create-division.dto';
import type { CategoryConfig } from '../interfaces/tournament-config.interface';
import { TournamentAccessService } from './tournament-access.service';
import { TournamentLifecycleService } from './tournament-lifecycle.service';
import { TournamentBracketService } from './tournament-bracket.service';
import { RedisService } from '../../../providers/redis/redis.service';
import { CommunitySocialRepository } from '../../communities/community-social.repository';
import * as schema from '../../../database/schema';
import { mapTournamentFormat } from '../utils/tournament-presentation';
import { validateMatchTypeAgainstCategory } from '../utils/tournament-input-policy';
import { assertValidFootballTeamConfig } from '../utils/football-team-config';
import { resolveEffectiveSportRules } from '../utils/sport-rules/resolve-effective-sport-rules';

type RegisterLiteParticipant = (
  tournamentId: string,
  userId: string,
  data: RegisterTournamentDto,
  inviteCode?: string,
  actorUserId?: string,
) => Promise<unknown>;

type CleanupTournament = (
  tournamentId: string,
  userId: string,
  systemRoles: string[],
) => Promise<unknown>;

@Injectable()
export class TournamentLiteService {
  private readonly logger = new Logger(TournamentLiteService.name);

  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly tournamentAccessService: TournamentAccessService,
    private readonly tournamentLifecycleService: TournamentLifecycleService,
    private readonly tournamentBracketService: TournamentBracketService,
    private readonly redisService: RedisService,
    private readonly communitySocialRepository: CommunitySocialRepository,
    private readonly configService: ConfigService,
  ) {}
  private buildLiteSportPreset(sport: string): {
    sportPreset: string;
    sportRules: Record<string, unknown>;
  } {
    switch (sport) {
      case 'pickleball':
        return {
          sportPreset: 'PICKLEBALL_STANDARD',
          sportRules: {
            kind: 'PICKLEBALL',
            mode: 'LITE',
            scoringModel: 'RALLY_POINT_SET',
            setsToWin: 2,
            pointsPerSet: 11,
            winByTwo: true,
            maxPoints: 15,
          },
        };
      case 'badminton':
        return {
          sportPreset: 'BADMINTON_STANDARD',
          sportRules: {
            kind: 'BADMINTON',
            mode: 'LITE',
            scoringModel: 'RALLY_POINT_SET',
            setsToWin: 2,
            pointsPerSet: 21,
            winByTwo: true,
            maxPoints: 30,
          },
        };
      case 'table_tennis':
        return {
          sportPreset: 'TABLE_TENNIS_STANDARD',
          sportRules: {
            kind: 'TABLE_TENNIS',
            mode: 'LITE',
            scoringModel: 'RALLY_POINT_SET',
            setsToWin: 3,
            pointsPerSet: 11,
            winByTwo: true,
            maxPoints: 99,
          },
        };
      case 'tennis':
        return {
          sportPreset: 'TENNIS_SUPER_TIEBREAK',
          sportRules: {
            kind: 'TENNIS',
            mode: 'LITE',
            scoringModel: 'TENNIS_SET',
            setsToWin: 1,
            pointsPerSet: 6,
            maxPoints: 7,
            winByTwo: true,
            tiebreakPoints: 7,
          },
        };
      case 'football':
        return {
          sportPreset: 'FOOTBALL_STANDARD',
          sportRules: {
            kind: 'FOOTBALL',
            mode: 'LITE',
            scoringModel: 'STANDARD',
            halvesCount: 2,
            halfDuration: 45,
            allowDraw: true,
            bestOf: 1,
          },
        };
      default:
        throw new BadRequestException(
          'Môn thể thao không hợp lệ. Vui lòng chọn một môn được hỗ trợ.',
        );
    }
  }
  async createLite(
    userId: string,
    dto: CreateLiteTournamentDto,
    cleanupIncompleteTournament: CleanupTournament,
    systemRoles: string[] = [],
    isEmailVerified?: boolean,
    isMock?: boolean,
  ) {
    // A Lite tournament is either explicitly club-scoped or standalone/public;
    // never silently reinterpret an inconsistent caller payload.
    if (dto.communityId && dto.tournamentType === 'PUBLIC') {
      throw new BadRequestException(
        'Giải nhanh có communityId phải có loại CLUB.',
      );
    }
    if (dto.communityId && dto.visibility === 'PUBLIC') {
      throw new BadRequestException(
        'Giải Super Quick trong câu lạc bộ chỉ được là giải nội bộ, không thể mở thành giải công khai.',
      );
    }
    if (!dto.communityId && dto.tournamentType === 'CLUB') {
      throw new BadRequestException(
        'Giải nhanh loại CLUB phải gắn với một câu lạc bộ.',
      );
    }

    // Standalone/public creation is a platform-level organizer action. Keep
    // internal club quick-create low-friction, but require verified email for
    // the broader public surface just like advanced public creation.
    if (!dto.communityId && !isMock && isEmailVerified !== true) {
      throw new ForbiddenException(
        'Bạn cần xác minh email để tạo giải nhanh ngoài câu lạc bộ.',
      );
    }

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

    const sport = dto.sport?.trim().toLowerCase();
    if (!sport) {
      throw new BadRequestException(
        'Vui lòng chọn môn thể thao trước khi tạo giải.',
      );
    }

    // 1. Map sport slug → category
    const category = await this.tournamentsRepository.findCategoryBySlug(sport);
    if (!category) {
      throw new BadRequestException(
        `Môn thể thao "${sport}" không được hỗ trợ`,
      );
    }

    // 2. Resolve matchType
    const format = dto.format || 'singles';
    const matchType =
      format === 'mixed_doubles'
        ? 'MIXED_DOUBLES'
        : format === 'doubles'
          ? 'DOUBLES'
          : 'SINGLES';

    // 3. Validate matchType against category
    validateMatchTypeAgainstCategory(category.categoryConfig as CategoryConfig | null | undefined, matchType, 'tournament');

    // 4. Resolve bracketType — only allow known Lite types, reject unknown with 400
    const bracketType = dto.bracketType || 'single_elimination';
    const bracketTypeMap: Record<string, string> = {
      single_elimination: 'SINGLE_ELIMINATION',
      double_elimination: 'DOUBLE_ELIMINATION',
      round_robin: 'ROUND_ROBIN',
      group_stage_knockout: 'GROUP_STAGE_KNOCKOUT',
    };
    const finalBracketType = bracketTypeMap[bracketType] as
      | 'SINGLE_ELIMINATION'
      | 'DOUBLE_ELIMINATION'
      | 'ROUND_ROBIN'
      | 'GROUP_STAGE_KNOCKOUT'
      | undefined;
    if (!finalBracketType) {
      throw new BadRequestException(
        `Thể thức "${bracketType}" không được hỗ trợ. Chấp nhận: ${Object.keys(bracketTypeMap).join(', ')}.`,
      );
    }

    // 5. Build Lite sport preset + rules
    const builtInLitePreset = this.buildLiteSportPreset(sport);
    const rawCategoryConfig = category.categoryConfig as Record<
      string,
      unknown
    > | null;
    const categoryDefaults =
      rawCategoryConfig &&
      typeof rawCategoryConfig === 'object' &&
      rawCategoryConfig.defaultSportRules &&
      typeof rawCategoryConfig.defaultSportRules === 'object'
        ? (rawCategoryConfig.defaultSportRules as Record<string, unknown>)
        : null;
    // Category preset is the shared, editable source of defaults. Keep the
    // built-in sport preset only as a backwards-compatible fallback for old
    // categories that do not yet have defaultSportRules.
    const presetRules = builtInLitePreset.sportRules;
    const litePreset = {
      sportPreset: categoryDefaults
        ? `CATEGORY_${sport.toUpperCase()}`
        : builtInLitePreset.sportPreset,
      sportRules: {
        ...presetRules,
        ...(categoryDefaults ?? {}),
        kind: presetRules.kind,
      },
    };
    const sportRuleDefaults = litePreset.sportRules as Record<string, unknown>;
    const isSuperLite =
      !Boolean(dto.divisions?.length) &&
      !Boolean(
        dto.divisions?.some(
          (division) => division.minElo != null || division.maxElo != null,
        ),
      ) &&
      !(dto.genderRestriction && dto.genderRestriction !== 'MIXED');

    const sportRules = {
      ...litePreset.sportRules,
      // Every Quick tournament uses the Lite/open scorecard contract: the
      // organiser may close any number of sets and the next set starts at
      // 0-0. This is a scoring preset only; `tournamentConfig.isLite` below
      // remains the product/access discriminator for Super Lite.
      mode: 'LITE',

      ...(sport === 'football'
        ? {
            halvesCount:
              dto.footballHalvesCount ??
              (sportRuleDefaults.halvesCount as number | undefined),
            halfDuration:
              dto.footballHalfDuration ??
              (sportRuleDefaults.halfDuration as number | undefined),
            allowDraw:
              dto.footballAllowDraw ??
              (sportRuleDefaults.allowDraw as boolean | undefined),
          }
        : {
            setsToWin:
              dto.setsToWin ??
              (sportRuleDefaults.setsToWin as number | undefined),
            pointsPerSet:
              dto.pointsPerSet ??
              (sportRuleDefaults.pointsPerSet as number | undefined),
            winByTwo:
              dto.winByTwo ??
              (sportRuleDefaults.winByTwo as boolean | undefined),
            ...(dto.maxPoints !== undefined
              ? { maxPoints: dto.maxPoints }
              : {}),
          }),
    };

    // 6. Build Lite tournamentConfig shared by App/Web
    const maxTeams = dto.maxTeams || 16;
    // Lite is intentionally frictionless: internal Club Lite starts open to
    // members. Public/advanced flows can explicitly request approval or invite-only.
    // Keep the organizer's selected policy. Public Quick defaults to
    // APPROVAL; silently collapsing it to OPEN made the UI promise review
    // while the API immediately accepted every applicant.
    const requestedPublic = dto.visibility === 'PUBLIC';
    const registrationMode =
      dto.registrationMode === 'INVITE_ONLY'
        ? 'INVITE_ONLY'
        : dto.registrationMode === 'APPROVAL'
          ? 'APPROVAL'
          : requestedPublic
            ? 'APPROVAL'
            : 'OPEN';
    // Community quick-create is always an internal club tournament. For a
    // standalone quick-create, preserve the organizer's explicit scope and
    // default to the expanded/public tournament type.
    const tournamentType = dto.communityId
      ? 'CLUB'
      : (dto.tournamentType ?? 'PUBLIC');
    const liteVisibility = requestedPublic
      ? 'PUBLIC'
      : dto.communityId
        ? 'COMMUNITY'
        : 'PRIVATE_INVITE';
    const footballTeamSize =
      sport === 'football' ? (dto.teamSize ?? 7) : undefined;
    const footballMaxReserve =
      sport === 'football' ? (dto.maxReserve ?? 0) : undefined;
    if (sport === 'football') {
      assertValidFootballTeamConfig(
        {
          teamSize: footballTeamSize,
          minTeamSize: footballTeamSize,
          maxReserve: footballMaxReserve,
          maxTeamSize: (footballTeamSize ?? 0) + (footballMaxReserve ?? 0),
        },
        { requireTeamSize: true },
      );
    }

    let recurringConfig: Record<string, unknown> | undefined = undefined;
    if (dto.isRecurring) {
      const frequency = dto.recurringFrequency || 'WEEKLY';
      const timeOfDay = dto.recurringTimeOfDay || dto.startTime || '18:00';
      const daysOfWeek: number[] =
        dto.recurringDaysOfWeek && dto.recurringDaysOfWeek.length > 0
          ? dto.recurringDaysOfWeek
          : [
              dto.recurringDayOfWeek ??
                (dto.startDate ? new Date(dto.startDate).getDay() : 6),
            ];
      // When the creator selected a start date, that date is the first event
      // of the recurring series. Only subsequent occurrences are calculated
      // from the frequency; otherwise a Saturday preset could silently move
      // the first tournament to a different week.
      let nextRun: Date | undefined;
      if (dto.startDate) {
        const requestedStart = new Date(dto.startDate);
        if (
          !Number.isNaN(requestedStart.getTime()) &&
          requestedStart.getTime() > Date.now()
        ) {
          const [hours, minutes] = timeOfDay.split(':').map(Number);
          requestedStart.setHours(hours || 0, minutes || 0, 0, 0);
          if (requestedStart.getTime() > Date.now()) nextRun = requestedStart;
        }
      }
      nextRun ??= this.tournamentLifecycleService.calculateNextRecurringDate(frequency, daysOfWeek, timeOfDay, );
      const advanceDays = dto.recurringAdvanceDays ?? 0;
      const nextCreateAt = new Date(
        nextRun.getTime() - advanceDays * 24 * 60 * 60 * 1000,
      );

      recurringConfig = {
        enabled: true,
        frequency,
        dayOfWeek: daysOfWeek[0],
        daysOfWeek,
        timeOfDay,
        templateName: dto.name,
        sport,
        format,
        bracketType: finalBracketType,
        maxTeams,
        ...(footballTeamSize !== undefined
          ? { teamSize: footballTeamSize }
          : {}),
        ...(footballTeamSize !== undefined
          ? { minTeamSize: footballTeamSize }
          : {}),
        ...(footballMaxReserve !== undefined
          ? { maxReserve: footballMaxReserve }
          : {}),
        // Recurring club tournaments are ranking tournaments by default;
        // creators can explicitly opt out with isRanked=false.
        isRanked: dto.isRanked ?? true,
        advanceDays,
        // nextRunAt is the cron due time; nextEventAt is the actual match day.
        nextRunAt: nextCreateAt.toISOString(),
        nextEventAt: nextRun.toISOString(),
        lastGeneratedAt: new Date().toISOString(),
      };
    }

    const tournamentConfig = {
      mode: 'LITE',
      isLite: true,
      sportPreset: litePreset.sportPreset,

      // Visibility controls discoverability; registrationMode independently
      // controls whether the organizer must approve each application.
      registrationMode,
      liteJoinPolicy: requestedPublic
        ? 'PUBLIC'
        : dto.communityId
          ? 'COMMUNITY_MEMBERS'
          : 'INVITE_ONLY',
      liteVisibility,
      bracketSetupMode: 'RANDOM',
      ...(matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES'
        ? {
            // The creator may turn BTC pairing off. Missing/invalid values
            // are rejected by the DTO; omitting it keeps the safe default.
            doublesPairingMode:
              dto.doublesPairingMode === 'SELF' ? 'SELF' : 'ORGANIZER',
          }
        : {}),
      allowPlayerReferee: true,
      // Only pure Super Lite hides advanced settings. Configured divisions or
      // restrictions belong to the standard management workspace.
      hideAdvancedSettings: isSuperLite,

      scoringMode: 'FREE',
      bracketType: finalBracketType,
      maxTeams,
      startTime: dto.startTime || undefined,
      ...(recurringConfig ? { recurring: recurringConfig } : {}),
      ...(sport === 'football' && footballTeamSize
        ? {
            teamSize: footballTeamSize,
            minTeamSize: footballTeamSize,
            maxReserve: footballMaxReserve ?? 0,
          }
        : {}),
    };

    // 7. Check authorization: must be community member (JOINED)
    if (dto.communityId) {
      const communitySportsLite =
        await this.tournamentsRepository.findCommunitySports(dto.communityId);
      if (communitySportsLite.length > 0) {
        const isMatch = communitySportsLite.some(
          (s) => s.categoryId === category.id,
        );
        if (!isMatch) {
          throw new BadRequestException(
            `Giải đấu của câu lạc bộ phải thuộc bộ môn của câu lạc bộ (${communitySportsLite.map((s) => s.categoryName).join(', ')}).`,
          );
        }
      }
    } else if (
      !systemRoles.includes('ADMIN') &&
      !systemRoles.includes('ORGANIZER')
    ) {
      throw new ForbiddenException(
        'Giải nhanh ngoài câu lạc bộ yêu cầu quyền Organizer.',
      );
    }
    if (dto.communityId && !systemRoles.includes('ADMIN')) {
      const member = await this.tournamentsRepository.findCommunityMember(
        dto.communityId,
        userId,
      );
      if (
        !member ||
        member.status !== 'JOINED' ||
        !['OWNER', 'ADMIN', 'MODERATOR'].includes(member.role)
      ) {
        throw new ForbiddenException(
          'Bạn phải là thành viên của câu lạc bộ để tạo giải đấu.',
        );
      }
    }

    // 8. Tạo CreateTournamentDto từ dữ liệu Lite
    let startDateTime: string | undefined = undefined;
    if (dto.startDate) {
      const hasTime = dto.startDate.includes('T');
      const hasTz =
        dto.startDate.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dto.startDate);

      if (hasTime && hasTz && !dto.startTime) {
        // Full ISO with timezone and no explicit time override
        const parsed = new Date(dto.startDate);
        startDateTime = !Number.isNaN(parsed.getTime())
          ? parsed.toISOString()
          : undefined;
      } else {
        // Extract date part (YYYY-MM-DD)
        const datePart = dto.startDate.includes('T')
          ? dto.startDate.split('T')[0]
          : dto.startDate;

        let hh = 8;
        let mm = 0;
        if (dto.startTime && dto.startTime.includes(':')) {
          const parts = dto.startTime.split(':');
          hh = Number(parts[0]) || 0;
          mm = Number(parts[1]) || 0;
        } else if (hasTime) {
          // Parse time part from ISO string "YYYY-MM-DDTHH:mm..."
          const timePart = dto.startDate.split('T')[1];
          const timeMatch = timePart.match(/^(\d{2}):(\d{2})/);
          if (timeMatch) {
            hh = Number(timeMatch[1]);
            mm = Number(timeMatch[2]);
          }
        }

        const dateParts = datePart.split('-');
        if (dateParts.length === 3) {
          const yyyy = Number(dateParts[0]);
          const month = Number(dateParts[1]);
          const day = Number(dateParts[2]);
          // Client is in Vietnam timezone (UTC+7).
          // UTC hour = hh - 7
          const utcTimestamp = Date.UTC(yyyy, month - 1, day, hh - 7, mm, 0, 0);
          startDateTime = new Date(utcTimestamp).toISOString();
        } else {
          const parsed = new Date(dto.startDate);
          startDateTime = !Number.isNaN(parsed.getTime())
            ? parsed.toISOString()
            : undefined;
        }
      }
    }

    let endDateTime: string | undefined = undefined;
    if (dto.endDate) {
      const hasTime = dto.endDate.includes('T');
      const hasTz =
        dto.endDate.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dto.endDate);
      if (hasTime && hasTz) {
        const parsedEnd = new Date(dto.endDate);
        endDateTime = !Number.isNaN(parsedEnd.getTime())
          ? parsedEnd.toISOString()
          : undefined;
      }
    }

    const calculatedDurationMinutes =
      dto.durationMinutes ??
      (dto.durationHours ? Math.round(dto.durationHours * 60) : undefined) ??
      (startDateTime &&
      endDateTime &&
      new Date(endDateTime).getTime() > new Date(startDateTime).getTime()
        ? Math.round(
            (new Date(endDateTime).getTime() -
              new Date(startDateTime).getTime()) /
              (60 * 1000),
          )
        : 90); // Default to 90 minutes (1h30) only if not specified or calculable

    // A missing end date means the organizer will finish the tournament
    // manually. Do not derive an end timestamp from the default duration:
    // the scheduler must only auto-complete tournaments with an explicit
    // endDate.

    const registrationStartDate = dto.registrationStartDate
      ? new Date(dto.registrationStartDate)
      : new Date();
    const registrationEndDate = dto.registrationEndDate
      ? new Date(dto.registrationEndDate)
      : startDateTime
        ? new Date(new Date(startDateTime).getTime() - 60 * 60 * 1000)
        : undefined;
    if (
      Number.isNaN(registrationStartDate.getTime()) ||
      (registrationEndDate && Number.isNaN(registrationEndDate.getTime()))
    ) {
      throw new BadRequestException('Thời gian đăng ký không hợp lệ.');
    }
    if (registrationEndDate && registrationStartDate >= registrationEndDate) {
      throw new BadRequestException(
        'Thời gian mở đăng ký phải trước thời gian đóng.',
      );
    }
    const now = new Date();
    if (registrationEndDate && registrationEndDate <= now) {
      throw new BadRequestException(
        'Thời gian đóng đăng ký phải ở tương lai để giải không tự chuyển sang chốt danh sách.',
      );
    }
    if (
      startDateTime &&
      registrationEndDate &&
      registrationEndDate >= new Date(startDateTime)
    ) {
      throw new BadRequestException(
        'Thời gian đóng đăng ký phải trước giờ bắt đầu giải.',
      );
    }
    if (startDateTime && new Date(startDateTime) <= now) {
      throw new BadRequestException(
        'Ngày bắt đầu giải phải ở tương lai khi tạo giải nhanh.',
      );
    }
    if (dto.ward?.trim() && !dto.province?.trim()) {
      throw new BadRequestException('Phường/xã phải đi kèm tỉnh/thành phố.');
    }

    // A tournament location is authoritative when supplied. If the quick
    // create form has no province selected, snapshot the creator profile's
    // province at creation time; never derive an old activity from a later
    // profile edit.
    const creatorProfile =
      typeof this.tournamentsRepository.findUserProfile === 'function'
        ? await this.tournamentsRepository.findUserProfile(userId)
        : null;
    const effectiveProvinceCode =
      dto.provinceCode?.trim() || creatorProfile?.provinceCode?.trim() || null;

    const locationParts = [
      dto.venueName,
      dto.locationAddress,
      dto.ward,
      dto.district,
      dto.province,
    ]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part));
    const tournamentConfigWithLocation = {
      ...tournamentConfig,
      durationHours: Number((calculatedDurationMinutes / 60).toFixed(1)),
      durationMinutes: calculatedDurationMinutes,
      schedule: {
        registrationStartDate: registrationStartDate.toISOString(),
        ...(registrationEndDate
          ? { registrationEndDate: registrationEndDate.toISOString() }
          : {}),
        ...(startDateTime ? { startDate: startDateTime } : {}),
        ...(endDateTime ? { endDate: endDateTime } : {}),
      },
      ...(locationParts.length || effectiveProvinceCode
        ? {
            location: {
              ...(dto.venueName ? { venueName: dto.venueName.trim() } : {}),
              ...(dto.locationAddress
                ? { address: dto.locationAddress.trim() }
                : {}),
              ...(dto.province ? { province: dto.province.trim() } : {}),
              ...(effectiveProvinceCode ? { provinceCode: effectiveProvinceCode } : {}),
              ...(dto.district ? { district: dto.district.trim() } : {}),
              ...(dto.ward ? { ward: dto.ward.trim() } : {}),
              ...(dto.wardCode ? { wardCode: dto.wardCode.trim() } : {}),
              ...(locationParts.length ? { display: locationParts.join(', ') } : {}),
            },
          }
        : {}),
    };

    let fallbackLogoUrl = dto.logoUrl;
    let fallbackBannerUrl = dto.bannerUrl;
    if (dto.communityId && (!fallbackLogoUrl || !fallbackBannerUrl)) {
      try {
        const community = await this.tournamentsRepository.findCommunityById(
          dto.communityId,
        );
        if (!fallbackLogoUrl && community) {
          fallbackLogoUrl =
            community.logoUrl || community.bannerUrl || undefined;
        }
        if (!fallbackBannerUrl && community) {
          fallbackBannerUrl =
            community.bannerUrl || community.logoUrl || undefined;
        }
      } catch (err) {
        console.error(
          'Failed to resolve community logo fallback for lite tournament:',
          err,
        );
      }
    }

    const fullDto = new CreateTournamentDto();
    Object.assign(fullDto, {
      name: dto.name,
      tournamentType,
      visibility: requestedPublic ? 'PUBLIC' : 'PRIVATE',
      ...(fallbackBannerUrl ? { bannerUrl: fallbackBannerUrl } : {}),
      ...(fallbackLogoUrl ? { logoUrl: fallbackLogoUrl } : {}),
      ...(dto.communityId ? { communityId: dto.communityId } : {}),
      ...(dto.venueId ? { venueId: dto.venueId } : {}),
      categoryId: category.id,
      matchType,
      genderRestriction: dto.genderRestriction ?? null,
      description: dto.description || '',
      maxParticipants: maxTeams,
      entryFee: 0,
      // Lite club tournaments are ranking tournaments by default;
      // creators can explicitly opt out with isRanked=false.
      isRanked: dto.isRanked ?? true,
      sportRules,
      tournamentConfig: tournamentConfigWithLocation,
      startDate: startDateTime || undefined,
      endDate: endDateTime || undefined,
      registrationStartDate: registrationStartDate.toISOString(),
      registrationEndDate: registrationEndDate?.toISOString(),
      city: dto.province || dto.location || undefined,
      ...(dto.prizeDescription
        ? { prizeDescription: dto.prizeDescription }
        : {}),
      ...(dto.contactInfo ? { contactInfo: dto.contactInfo } : {}),
    });

    // 9. Gọi repository.create() — dùng chung logic insert
    const record = await this.tournamentsRepository.create(userId, fullDto);

    // 9b. Tự động tạo các nội dung thi đấu (divisions) tương ứng cho giải Lite
    // Lite creates one safe default division. Additional divisions are
    // materialized explicitly by the typed frontend division API, so wizard
    // fields such as selectedFormats never cross this API boundary.
    const formatsToCreate = dto.divisions?.length
      ? dto.divisions
      : [
          {
            name: isSuperLite
              ? sport === 'football'
                ? `Bóng đá ${footballTeamSize || 7} người`
                : dto.format === 'singles'
                  ? 'Đánh Đơn'
                  : 'Đánh Đôi'
              : sport === 'football'
                ? dto.genderRestriction === 'FEMALE'
                  ? 'Đội nữ'
                  : dto.genderRestriction === 'MALE'
                    ? 'Đội nam'
                    : 'Không giới hạn'
                : dto.format === 'singles'
                  ? dto.genderRestriction === 'FEMALE'
                    ? 'Đơn Nữ'
                    : 'Đơn Nam'
                  : dto.format === 'mixed_doubles' ||
                      dto.genderRestriction === 'MIXED'
                    ? 'Đôi Nam Nữ'
                    : dto.genderRestriction === 'FEMALE'
                      ? 'Đôi Nữ'
                      : 'Đôi Nam',
            // Football is a team-vs-team sport. The category contract uses
            // SINGLES as the generic match type; it must never be persisted as
            // a doubles or mixed-doubles division.
            matchType:
              sport === 'football'
                ? MatchType.SINGLES
                : dto.format === 'singles'
                  ? MatchType.SINGLES
                  : dto.format === 'mixed_doubles' ||
                      dto.genderRestriction === 'MIXED'
                    ? MatchType.MIXED_DOUBLES
                    : MatchType.DOUBLES,
            genderRestriction:
              sport === 'football' && !dto.genderRestriction
                ? undefined
                : dto.genderRestriction,
            maxParticipants: maxTeams,
            bracketType: finalBracketType,
            startDate: startDateTime
              ? new Date(startDateTime).toISOString()
              : undefined,
            registrationEndDate: registrationEndDate
              ? registrationEndDate.toISOString()
              : undefined,
          },
        ];

    let divisionCreationError: unknown = null;
    const createdDivisionIds: string[] = [];
    for (const divInfo of formatsToCreate) {
      try {
        const createdDivision = await this.tournamentsRepository.createDivision(
          {
            tournamentId: record.id,
            name: divInfo.name.trim(),
            // Keep legacy/explicit football payloads compatible while enforcing
            // the canonical football team contract at the persistence boundary.
            matchType:
              sport === 'football'
                ? MatchType.SINGLES
                : (divInfo.matchType as MatchType),
            genderRestriction: divInfo.genderRestriction as
              | GenderRestriction
              | undefined,
            maxParticipants: divInfo.maxParticipants ?? maxTeams,
            entryFee: null,
            entryFeeOverrideEnabled: false,
            bracketType: (divInfo.bracketType ??
              finalBracketType) as DivisionBracketType,
            startDate: divInfo.startDate
              ? new Date(divInfo.startDate).toISOString()
              : undefined,
            registrationEndDate: divInfo.registrationEndDate
              ? new Date(divInfo.registrationEndDate).toISOString()
              : undefined,
            minElo: divInfo.minElo ?? null,
            maxElo: divInfo.maxElo ?? null,
            prizeDescription: divInfo.prizeDescription ?? null,
          },
          userId,
        );
        if (createdDivision?.id) createdDivisionIds.push(createdDivision.id);
      } catch (divErr) {
        divisionCreationError = divErr;
        break;
      }
    }

    if (divisionCreationError) {
      try {
        // Compensating cleanup keeps Lite creation all-or-nothing even though
        // the legacy repository calls are separate operations.
        await cleanupIncompleteTournament(record.id, userId, systemRoles);
      } catch (cleanupError) {
        console.error(
          'Failed to clean up incomplete Lite tournament:',
          cleanupError,
        );
      }
      throw new BadRequestException(
        'Không thể tạo đầy đủ các nội dung thi đấu. Vui lòng thử lại.',
      );
    }

    // 10. Publish with the correct registration window.
    // A future opening time must never be bypassed by Lite creation. Keep the
    // tournament UPCOMING so the scheduler can open it at registrationStartDate.
    // Public tournaments still wait for admin approval first.
    const registrationStartsInFuture =
      registrationStartDate.getTime() > Date.now();
    const initialStatus =
      requestedPublic && !isAdmin
        ? 'PENDING_APPROVAL'
        : registrationStartsInFuture
          ? 'UPCOMING'
          : 'REGISTRATION_OPEN';
    const updated = await this.tournamentsRepository.update(record.id, userId, {
      status: initialStatus,
    });

    // Auto-post to Community Feed
    if (fullDto.communityId && (!requestedPublic || isAdmin)) {
      try {
        const post = await this.communitySocialRepository.createTournamentPost(
          fullDto.communityId,
          userId,
          record.id,
          record.name,
          record.bannerUrl,
          isSuperLite,
        );
        if (post?.id) {
          void this.tournamentLifecycleService.notifyCommunityTournamentCreated({
            communityId: fullDto.communityId,
            tournamentId: record.id,
            tournamentName: record.name,
            senderId: userId,
            postId: post.id,
            isLite: isSuperLite,
          });
        }
      } catch (err) {
        console.error('Failed to auto-post tournament to community feed:', err);
      }
    }

    const inviteCode = updated.inviteCode ?? record.inviteCode;

    // Invalidate tournament list cache
    try {
      await this.redisService.delByPattern('tournaments:list:*');
      await this.redisService.delByPattern('matches:list:*');
    } catch {
      // Redis down — ignore
    }

    // Build absolute joinUrl + qrPayload using FRONTEND_URL
    const frontendUrl = (
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001'
    ).replace(/\/+$/, '');
    // Club Lite keeps its compact one-tap URL. Public Quick is a full
    // tournament after creation, so new QR/link shares must open the standard
    // registration page (including doubles partner registration).
    const joinPath =
      tournamentType === 'CLUB' && isSuperLite
        ? `/lite/tournaments/join/${inviteCode}`
        : `/tournaments/${record.id}/register${inviteCode ? `?invite=${encodeURIComponent(inviteCode)}` : ''}`;

    return {
      id: record.id,
      name: record.name,
      status: updated.status,
      divisionIds: createdDivisionIds,
      inviteCode,
      joinUrl: `${frontendUrl}${joinPath}`,
      qrPayload: `${frontendUrl}${joinPath}`,
    };
  }
  async getLiteJoinStatus(inviteCode: string, userId?: string) {
    const tournament =
      await this.tournamentsRepository.findByInviteCode(inviteCode);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    // Reject non-Lite invite codes
    const tCfg = (tournament.tournamentConfig || {}) as Record<string, unknown>;
    if (tCfg.isLite !== true) {
      throw new BadRequestException('Mã mời không phải của giải đấu Lite.');
    }

    if (tournament.status === 'DRAFT')
      throw new NotFoundException('Giải chưa được công bố');
    if (tournament.status === 'CANCELLED')
      throw new NotFoundException('Giải đã bị hủy');

    const t = mapTournamentFormat(tournament);

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
        // The join client uses ownership to distinguish the intentional
        // Club Lite one-tap flow from Public Quick, which must use the full
        // registration flow (partner/roster support included).
        communityId: tournament.communityId ?? null,
      },
    };

    if (!userId) return { ...base, requiresAuth: true };

    // Registration date check
    const now = new Date();
    if (
      tournament.status !== 'REGISTRATION_OPEN' &&
      tournament.registrationStartDate &&
      now < tournament.registrationStartDate
    ) {
      return { ...base, registrationNotOpen: true };
    }
    if (
      tournament.registrationEndDate &&
      now > tournament.registrationEndDate
    ) {
      return { ...base, registrationClosed: true };
    }

    // Check club membership
    if (tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        tournament.communityId,
        userId,
      );
      if (!member) {
        const community = await this.tournamentsRepository.findCommunityById(
          tournament.communityId,
        );
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
        const community = await this.tournamentsRepository.findCommunityById(
          tournament.communityId,
        );
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
    const participant =
      await this.tournamentsRepository.findParticipantByTournamentAndUser(
        tournament.id,
        userId,
      );
    if (participant)
      return { ...base, alreadyJoined: true, participantId: participant.id };

    // Registration closed?
    if (
      tournament.status === 'REGISTRATION_CLOSED' ||
      tournament.status === 'UPCOMING' ||
      tournament.status === 'IN_PROGRESS' ||
      tournament.status === 'COMPLETED'
    ) {
      return { ...base, registrationClosed: true };
    }

    // Full — count active roster users; maxSlots depends on matchType
    if (tournament.maxParticipants) {
      const isDoubles =
        t.matchType === 'DOUBLES' || t.matchType === 'MIXED_DOUBLES';
      const maxSlots = isDoubles
        ? tournament.maxParticipants * 2
        : tournament.maxParticipants;
      const activeUserCount =
        await this.tournamentsRepository.countLiteActiveRosterUsers(
          tournament.id,
        );
      if (activeUserCount >= maxSlots) return { ...base, tournamentFull: true };
    }

    return { ...base, canJoin: true };
  }
  async joinLite(inviteCode: string, userId: string) {
    const tournament =
      await this.tournamentsRepository.findByInviteCode(inviteCode);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    // Reject non-Lite invite codes
    const tCfg = (tournament.tournamentConfig || {}) as Record<string, unknown>;
    if (tCfg.isLite !== true) {
      throw new BadRequestException('Mã mời không phải của giải đấu Lite.');
    }

    if (tournament.status !== 'REGISTRATION_OPEN')
      throw new BadRequestException('Giải không đang mở đăng ký');

    // Registration date check: status is the authoritative access gate.
    const now = new Date();
    if (
      tournament.registrationEndDate &&
      now > tournament.registrationEndDate
    ) {
      throw new BadRequestException('Thời gian đăng ký đã kết thúc.');
    }

    // Check club membership
    if (tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        tournament.communityId,
        userId,
      );
      let memberStatus = member?.status;
      if (!member) {
        const community = await this.tournamentsRepository.findCommunityById(
          tournament.communityId,
        );
        // When joining via tournament invite link, auto-join user into club (or send pending request if club requires approval)
        const autoStatus =
          community?.joinMode === 'APPROVAL' ? 'PENDING' : 'JOINED';
        await this.tournamentsRepository.addCommunityMember(
          tournament.communityId,
          userId,
          'MEMBER',
          autoStatus,
        );
        memberStatus = autoStatus;
      }
      if (memberStatus === 'PENDING')
        throw new ForbiddenException(
          'Yêu cầu tham gia CLB đang chờ ban quản trị duyệt',
        );
      if (memberStatus !== 'JOINED')
        throw new ForbiddenException('Bạn chưa là thành viên câu lạc bộ');
    }

    // Already joined?
    const existing =
      await this.tournamentsRepository.findParticipantByTournamentAndUser(
        tournament.id,
        userId,
      );
    if (existing) throw new BadRequestException('Bạn đã tham gia giải này');

    // Full — count active roster users; maxSlots depends on matchType
    if (tournament.maxParticipants) {
      const isDoubles =
        tournament.matchType === 'DOUBLES' ||
        tournament.matchType === 'MIXED_DOUBLES';
      const maxSlots = isDoubles
        ? tournament.maxParticipants * 2
        : tournament.maxParticipants;
      const activeUserCount =
        await this.tournamentsRepository.countLiteActiveRosterUsers(
          tournament.id,
        );
      if (activeUserCount >= maxSlots)
        throw new BadRequestException('Giải đã đủ số lượng người tham gia.');
    }

    // Get user name
    const profile = await this.tournamentsRepository.findUserProfile(userId);
    const name = profile?.fullName || 'Vận động viên';

    // Register (capacity check is inside registerParticipant's transaction, FOR UPDATE)
    const result = await this.tournamentsRepository.registerParticipant(
      tournament.id,
      userId,
      {
        teamName: name,
        rankingConsent: tournament.isRanked === true,
      },
      inviteCode,
    );

    return {
      id: result.participant.id,
      name,
      status: result.participant.teamStatus,
      tournamentId: tournament.id,
    };
  }
  async updateLiteBracketSlots(
    id: string,
    divisionId: string,
    userId: string,
    data: UpdateBracketSlotsDto,
    systemRoles: string[] = [],
  ) {
    if (!divisionId) {
      throw new BadRequestException(
        'divisionId là bắt buộc khi cập nhật bracket Lite',
      );
    }

    await this.checkLiteAuthorization(id, userId, systemRoles);
    const divisions =
      await this.tournamentsRepository.getDivisionsByTournament(id);
    if (!divisions.some((division) => division.id === divisionId)) {
      throw new NotFoundException('Không tìm thấy bảng đấu cho giải Lite này');
    }

    const result = await this.tournamentsRepository.updateBracketSlots(
      id,
      divisionId,
      userId,
      data,
      { allowLiveUnassign: true },
    );

    try {
      await this.redisService.delByPattern('tournaments:list:*');
      await this.redisService.delByPattern('matches:list:*');
      await this.redisService.del(`matches:tournament:${id}`);
      await this.redisService.del(`tournament:${id}`);
    } catch (cacheErr) {
      this.logger.warn(
        `Failed to clear cache for tournament ${id}: ${cacheErr}`,
      );
    }

    return result;
  }
  async generateLiteBracket(
    id: string,
    userId: string,
    systemRoles: string[] = [],
    divisionId?: string,
    reset = false,
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const config = (tournament.tournamentConfig || {}) as Record<
      string,
      unknown
    >;
    // Older persisted tournaments used mode=LITE before isLite became the
    // canonical flag. Keep the guard backwards compatible so those fixtures
    // and production records retain the same authorization semantics.
    if (config.isLite !== true && config.mode !== 'LITE') {
      throw new BadRequestException(
        'Chỉ giải Lite mới dùng được luồng quản lý này.',
      );
    }

    const tournamentStatus = tournament.status.trim().toUpperCase();
    if (['COMPLETED', 'FINISHED', 'DONE', 'ENDED'].includes(tournamentStatus)) {
      throw new BadRequestException(
        'Giải đấu đã kết thúc, không thể tạo lại sơ đồ thi đấu.',
      );
    }
    if (['CANCELLED', 'CANCELED'].includes(tournamentStatus)) {
      throw new BadRequestException(
        'Giải đấu đã bị huỷ, không thể tạo lại sơ đồ thi đấu.',
      );
    }
    if (['IN_PROGRESS', 'ONGOING', 'LIVE'].includes(tournamentStatus)) {
      throw new BadRequestException(
        'Giải đấu đang diễn ra, không thể tạo lại sơ đồ thi đấu.',
      );
    }

    const bracket = await this.tournamentsRepository.findBracket(
      id,
      divisionId,
    );
    const scheduledStatuses = new Set([
      'SCHEDULED',
      'PENDING',
      'NOT_STARTED',
      'UPCOMING',
    ]);
    const started =
      bracket?.stages.some((stage) =>
        stage.groups?.some((group) =>
          group.matches?.some(
            (match) =>
              !scheduledStatuses.has(match.status.trim().toUpperCase()),
          ),
        ),
      ) ?? false;
    if (started) {
      throw new BadRequestException(
        'Không thể reset bracket sau khi đã bắt đầu ít nhất một trận.',
      );
    }

    // generateBracket performs the same BTC/community authorization and persists
    // stages, groups and matches in one generator transaction.
    return this.tournamentBracketService.generateBracket(
      id,
      userId,
      systemRoles,
      divisionId,
      'RANDOM',
      true,
    );
  }
  async addLiteClubMember(
    tournamentId: string,
    memberUserId: string,
    actorUserId: string,
    registerParticipant: RegisterLiteParticipant,
    systemRoles: string[] = [],
  ) {
    const { tournament } = await this.checkLiteAuthorization(
      tournamentId,
      actorUserId,
      systemRoles,
    );

    if (!tournament.communityId) {
      throw new BadRequestException(
        'Chỉ giải Super Lite thuộc câu lạc bộ mới hỗ trợ thêm thành viên CLB.',
      );
    }

    const member = await this.tournamentsRepository.findCommunityMember(
      tournament.communityId,
      memberUserId,
    );
    if (!member || member.status !== 'JOINED') {
      throw new ForbiddenException(
        'Thành viên được chọn không còn là thành viên đang hoạt động của câu lạc bộ.',
      );
    }

    const profile =
      await this.tournamentsRepository.findUserProfile(memberUserId);
    if (!profile?.fullName?.trim()) {
      throw new BadRequestException(
        'Thành viên cần cập nhật họ tên trong hồ sơ trước khi thêm vào giải.',
      );
    }

    // Keep the selected member as the participant/roster leader. The manager
    // is only the authorizing actor; this preserves identity and team logic.
    return registerParticipant(
      tournamentId,
      memberUserId,
      {
        teamName: profile.fullName.trim(),
        rankingConsent: tournament.isRanked === true,
      },
      undefined,
      actorUserId,
    );
  }
  private async checkLiteAuthorization(
    tournamentId: string,
    userId: string,
    systemRoles: string[] = [],
  ): Promise<{
    tournament: typeof schema.tournaments.$inferSelect;
    config: Record<string, unknown>;
  }> {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const config = (tournament.tournamentConfig || {}) as Record<
      string,
      unknown
    >;
    // Keep the existing Lite route while allowing standard doubles whose
    // policy explicitly (or by backwards-compatible default) assigns pairs
    // to the organizer.
    const isLite = config.isLite === true || config.mode === 'LITE';
    const divisions = await this.tournamentsRepository.getDivisionsByTournament(
      tournamentId,
    );
    const isDoubles =
      tournament.matchType === 'DOUBLES' ||
      tournament.matchType === 'MIXED_DOUBLES' ||
      divisions.some(
        (division) =>
          division.matchType === 'DOUBLES' ||
          division.matchType === 'MIXED_DOUBLES',
      );
    if (!isLite && !isDoubles) {
      throw new BadRequestException(
        'Thao tác này chỉ hỗ trợ giải Lite hoặc nội dung thi đấu đôi.',
      );
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
      throw new ForbiddenException(
        'Bạn không có quyền thực hiện thao tác này.',
      );
    }

    return { tournament, config };
  }
  async getLiteParticipants(
    id: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    await this.checkLiteAuthorization(id, userId, systemRoles);
    return this.tournamentsRepository.findLiteParticipantsWithRosters(id);
  }
  async pairLiteParticipants(
    id: string,
    userId: string,
    systemRoles: string[] = [],
    dto: PairLiteParticipantsDto,
  ) {
    const { tournament, config } = await this.checkLiteAuthorization(
      id,
      userId,
      systemRoles,
    );

    // Verify DOUBLES match type
    const divisions = await this.tournamentsRepository.getDivisionsByTournament(id);
    const hasDoublesDivision =
      tournament.matchType === 'DOUBLES' ||
      tournament.matchType === 'MIXED_DOUBLES' ||
      divisions.some(
        (division) =>
          division.matchType === 'DOUBLES' ||
          division.matchType === 'MIXED_DOUBLES',
      );
    if (!hasDoublesDivision) {
      throw new BadRequestException('Ghép cặp chỉ hỗ trợ giải đấu đánh đôi.');
    }

    const registrationMode =
      config.registrationMode === 'APPROVAL'
        ? 'APPROVAL'
        : config.registrationMode === 'INVITE_ONLY'
          ? 'INVITE_ONLY'
          : 'OPEN';

    // Build teamName from dto or profiles fallback
    let teamName = dto.teamName?.trim();
    if (!teamName) {
      const p1Profile = await this.tournamentsRepository.findUserBasicById(
        (
          await this.tournamentsRepository.findLeaderByParticipantId(
            dto.participant1Id,
          )
        )?.userId ?? '',
      );
      const p2Profile = await this.tournamentsRepository.findUserBasicById(
        (
          await this.tournamentsRepository.findLeaderByParticipantId(
            dto.participant2Id,
          )
        )?.userId ?? '',
      );
      teamName = [p1Profile?.fullName, p2Profile?.fullName]
        .filter(Boolean)
        .join(' / ');
    }

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
    const { tournament } = await this.checkLiteAuthorization(
      id,
      userId,
      systemRoles,
    );

    // Verify DOUBLES match type
    const divisions = await this.tournamentsRepository.getDivisionsByTournament(id);
    const hasDoublesDivision =
      tournament.matchType === 'DOUBLES' ||
      tournament.matchType === 'MIXED_DOUBLES' ||
      divisions.some(
        (division) =>
          division.matchType === 'DOUBLES' ||
          division.matchType === 'MIXED_DOUBLES',
      );
    if (!hasDoublesDivision) {
      throw new BadRequestException('Ghép cặp chỉ hỗ trợ giải đấu đánh đôi.');
    }

    // Execute pairing in a transaction (authoritative; tx queries pending inside)
    return await this.tournamentsRepository.generateLitePairsTx(
      id,
      userId,
      dto.strategy,
    );
  }
  async unpairLiteParticipant(
    id: string,
    participantId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    await this.checkLiteAuthorization(id, userId, systemRoles);

    return await this.tournamentsRepository.lockTournamentAndUnpair(
      id,
      participantId,
      userId,
    );
  }
}
