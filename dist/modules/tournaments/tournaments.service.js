"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_util_1 = require("node:util");
const tournaments_repository_1 = require("./tournaments.repository");
const create_tournament_dto_1 = require("./dto/create-tournament.dto");
const mail_service_1 = require("../../providers/mail/mail.service");
const bracket_generator_service_1 = require("./bracket-generator.service");
const elo_cap_violation_exception_1 = require("./exceptions/elo-cap-violation.exception");
const notifications_service_1 = require("../notifications/notifications.service");
const schedule_1 = require("@nestjs/schedule");
const platform_fee_helper_1 = require("../../common/helpers/platform-fee.helper");
const create_division_dto_1 = require("./dto/create-division.dto");
const resolve_effective_sport_rules_1 = require("./utils/sport-rules/resolve-effective-sport-rules");
const validate_sport_rules_config_1 = require("./utils/sport-rules/validate-sport-rules-config");
const notification_builder_1 = require("../notifications/notification-builder");
const redis_service_1 = require("../../providers/redis/redis.service");
const storage_service_1 = require("../../providers/storage/storage.service");
const cloudinary_helper_1 = require("../../common/helpers/cloudinary.helper");
const community_social_repository_1 = require("../communities/community-social.repository");
const football_roster_validation_1 = require("./utils/football-roster-validation");
const football_team_config_1 = require("./utils/football-team-config");
const live_score_gateway_1 = require("../matches/live-score.gateway");
let TournamentsService = class TournamentsService {
    tournamentsRepository;
    bracketGeneratorService;
    notificationsService;
    storageService;
    redisService;
    configService;
    communitySocialRepository;
    liveScoreGateway;
    mailService;
    constructor(tournamentsRepository, bracketGeneratorService, notificationsService, storageService, redisService, configService, communitySocialRepository, liveScoreGateway, mailService) {
        this.tournamentsRepository = tournamentsRepository;
        this.bracketGeneratorService = bracketGeneratorService;
        this.notificationsService = notificationsService;
        this.storageService = storageService;
        this.redisService = redisService;
        this.configService = configService;
        this.communitySocialRepository = communitySocialRepository;
        this.liveScoreGateway = liveScoreGateway;
        this.mailService = mailService;
    }
    broadcastRegistrationChanged(tournamentId, payload) {
        this.liveScoreGateway?.broadcastRegistrationUpdate(tournamentId, payload);
    }
    calculateNextRecurringDate(frequency, daysOfWeek, timeOfDay, fromDate = new Date()) {
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
        const days = Array.isArray(daysOfWeek)
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
        if (minDaysAhead === 999)
            minDaysAhead = 7;
        target.setDate(fromDate.getDate() + minDaysAhead);
        target.setHours(hours, minutes, 0, 0);
        return target;
    }
    async isManager(tournament, userId, systemRoles = []) {
        if (systemRoles.includes('ADMIN'))
            return true;
        if (tournament.createdBy === userId)
            return true;
        if (typeof this.tournamentsRepository.isCoOrganizer === 'function' &&
            (await this.tournamentsRepository.isCoOrganizer(tournament.id, userId))) {
            return true;
        }
        if (!tournament.communityId)
            return false;
        const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
        return (member?.status === 'JOINED' &&
            ['OWNER', 'MODERATOR'].includes(member.role));
    }
    isSystemTournamentCreator(systemRoles = []) {
        return systemRoles.includes('ADMIN') || systemRoles.includes('ORGANIZER');
    }
    async assertCommunityTournamentCreator(communityId, userId, systemRoles = []) {
        if (systemRoles.includes('ADMIN'))
            return;
        const member = await this.tournamentsRepository.findCommunityMember(communityId, userId);
        if (!member ||
            member.status !== 'JOINED' ||
            !['OWNER', 'MODERATOR'].includes(member.role)) {
            throw new common_1.ForbiddenException('Chỉ Chủ CLB hoặc Quản trị viên CLB mới có thể tạo giải thuộc CLB.');
        }
    }
    async sendNotificationBatch(notifications) {
        await Promise.all(notifications);
    }
    async assertEntryFeeAllowed(entryFee) {
        if (!entryFee || entryFee <= 0) {
            return;
        }
        const feesConfig = await this.tournamentsRepository.getFeesConfig();
        if (feesConfig.allowEntryFees === false) {
            throw new common_1.BadRequestException('Hệ thống hiện không cho phép ban tổ chức đặt lệ phí đăng ký. Vui lòng để lệ phí là 0đ.');
        }
    }
    async cleanupTournamentImages(tournament) {
        const urls = [];
        if (tournament.bannerUrl)
            urls.push(tournament.bannerUrl);
        if (tournament.logoUrl)
            urls.push(tournament.logoUrl);
        if (tournament.galleryImages)
            urls.push(...tournament.galleryImages);
        for (const url of urls) {
            if ((0, cloudinary_helper_1.isStoredImageUrl)(url)) {
                try {
                    const publicId = (0, cloudinary_helper_1.extractStoredImagePublicId)(url);
                    if (publicId) {
                        await this.storageService.deleteFile(publicId);
                    }
                }
                catch (err) {
                    console.error('Failed to delete tournament image from storage:', err);
                }
            }
        }
    }
    readSupportedMatchTypes(categoryConfig) {
        return Array.isArray(categoryConfig?.supportedMatchTypes)
            ? categoryConfig.supportedMatchTypes
            : null;
    }
    validateMatchTypeAgainstCategory(categoryConfig, matchType, sourceLabel) {
        if (!matchType) {
            return;
        }
        const supportedMatchTypes = this.readSupportedMatchTypes(categoryConfig);
        if (supportedMatchTypes &&
            !supportedMatchTypes.includes(matchType)) {
            throw new common_1.BadRequestException(`${sourceLabel}: môn này không hỗ trợ hình thức ${matchType}. Cho phép: ${supportedMatchTypes.join(', ')}.`);
        }
    }
    validateMatchTypeGenderRestriction(matchType, genderRestriction, sourceLabel) {
        if (!matchType) {
            return;
        }
        if (matchType === 'MIXED_DOUBLES' && genderRestriction !== 'MIXED') {
            throw new common_1.BadRequestException(`${sourceLabel}: MIXED_DOUBLES phải đi cùng genderRestriction = MIXED.`);
        }
        if ((matchType === 'SINGLES' || matchType === 'DOUBLES') &&
            genderRestriction === 'MIXED') {
            throw new common_1.BadRequestException(`${sourceLabel}: chỉ MIXED_DOUBLES mới được dùng genderRestriction = MIXED.`);
        }
    }
    mapTournamentFormat(tournament) {
        if (tournament &&
            tournament.tournamentConfig &&
            typeof tournament.tournamentConfig === 'object' &&
            'bracketType' in tournament.tournamentConfig &&
            typeof tournament.tournamentConfig
                .bracketType === 'string') {
            tournament.format = tournament.tournamentConfig.bracketType;
        }
        return tournament;
    }
    mapPublicTournament(tournament) {
        const config = tournament.tournamentConfig;
        const hideFeaturedCardText = typeof config === 'object' && config !== null && !Array.isArray(config)
            ? config.hideFeaturedCardText === true
            : false;
        return { ...tournament, hideFeaturedCardText };
    }
    validateRegistrationMode(config) {
        if (!config || typeof config !== 'object')
            return;
        const registrationMode = config
            .registrationMode;
        if (registrationMode !== undefined) {
            if (typeof registrationMode !== 'string' ||
                !['OPEN', 'APPROVAL', 'INVITE_ONLY'].includes(registrationMode)) {
                throw new common_1.BadRequestException('Chế độ đăng ký phải là một trong: OPEN, APPROVAL, INVITE_ONLY');
            }
        }
    }
    async findAll(query) {
        const cacheKey = `tournaments:list:${JSON.stringify(query)}`;
        try {
            const cached = await this.redisService.get(cacheKey);
            if (cached)
                return JSON.parse(cached);
        }
        catch (e) {
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
            .filter((t) => ![
            'DRAFT',
            'PENDING_APPROVAL',
            'SUSPENDED',
            'CANCELLED',
            'PENDING_DELETE',
        ].includes(t.status))
            .map((t) => this.mapTournamentFormat(t));
        try {
            await this.redisService.set(cacheKey, JSON.stringify(result), 60);
        }
        catch (e) {
        }
        return result;
    }
    async findPublic(query) {
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
            .filter((t) => ![
            'DRAFT',
            'PENDING_APPROVAL',
            'SUSPENDED',
            'CANCELLED',
            'PENDING_DELETE',
        ].includes(t.status))
            .map((t) => this.mapPublicTournament(this.mapTournamentFormat(t)));
        return result;
    }
    async findMy(userId) {
        const result = await this.tournamentsRepository.findMyTournaments(userId);
        return result.map((t) => this.mapTournamentFormat(t));
    }
    async getMyWorkspace(userId) {
        const workspace = await this.tournamentsRepository.findMyWorkspace(userId);
        return {
            ...workspace,
            organizedTournaments: workspace.organizedTournaments.map((tournament) => this.mapTournamentFormat(tournament)),
            participatingTournaments: workspace.participatingTournaments.map((tournament) => this.mapTournamentFormat(tournament)),
            coOrganizerTournaments: workspace.coOrganizerTournaments.map((tournament) => this.mapTournamentFormat(tournament)),
        };
    }
    async findOne(id, userId, inviteCode, systemRoles = [], participantId, teamInviteToken) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        const isOwner = userId && tournament.createdBy === userId;
        const isAdmin = systemRoles.includes('ADMIN');
        if (['DRAFT', 'PENDING_APPROVAL', 'PENDING_DELETE'].includes(tournament.status) &&
            !isOwner &&
            !isAdmin) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        if (tournament.status === 'SUSPENDED' && !isOwner && !isAdmin) {
            throw new common_1.ForbiddenException('Giải đấu đang bị tạm đình chỉ do vi phạm điều khoản dịch vụ');
        }
        if (tournament.status === 'CANCELLED' && !isOwner && !isAdmin) {
            throw new common_1.ForbiddenException('Giải đấu đã bị cấm hoặc hủy vĩnh viễn');
        }
        if (tournament.visibility === 'PRIVATE') {
            const isInviteMatch = inviteCode && tournament.inviteCode === inviteCode;
            const isValidTeamInvite = !!participantId &&
                !!teamInviteToken &&
                (await (async () => {
                    const participant = await this.tournamentsRepository.findParticipantById(participantId);
                    return (!!participant &&
                        participant.tournamentId === id &&
                        participant.teamInviteToken === teamInviteToken);
                })());
            let isCommunityMember = false;
            if (userId && tournament.communityId) {
                const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
                if (member && member.status === 'JOINED') {
                    isCommunityMember = true;
                }
            }
            if (!isOwner &&
                !isInviteMatch &&
                !isValidTeamInvite &&
                !isAdmin &&
                !isCommunityMember) {
                throw new common_1.ForbiddenException('Giải đấu này yêu cầu mã mời');
            }
        }
        return this.mapTournamentFormat(tournament);
    }
    async create(userId, createTournamentDto, systemRoles = []) {
        const isAdmin = systemRoles.includes('ADMIN');
        if (!isAdmin) {
            const createdCount = await this.tournamentsRepository.countCreatedTournaments(userId);
            if (createdCount >= 100) {
                throw new common_1.BadRequestException('Bạn đã đạt giới hạn tối đa 100 giải đấu được phép tạo.');
            }
        }
        this.validateRegistrationMode(createTournamentDto.tournamentConfig);
        await this.assertEntryFeeAllowed(createTournamentDto.entryFee);
        const category = await this.tournamentsRepository.findCategory(createTournamentDto.categoryId);
        if (!category) {
            throw new common_1.NotFoundException('Hạng đấu không tồn tại');
        }
        if (!createTournamentDto.sportRules) {
            const config = category.categoryConfig;
            if (config && config.defaultSportRules) {
                createTournamentDto.sportRules =
                    config.defaultSportRules;
            }
            else {
                createTournamentDto.sportRules = {};
            }
        }
        const categoryConfig = category.categoryConfig;
        this.validateMatchTypeAgainstCategory(categoryConfig, createTournamentDto.matchType, 'tournament');
        this.validateMatchTypeGenderRestriction(createTournamentDto.matchType, createTournamentDto.genderRestriction, 'tournament');
        const expectedSportKind = (0, validate_sport_rules_config_1.inferExpectedSportRuleKind)({
            categoryConfig: category.categoryConfig,
            categoryName: category.name,
            categorySlug: category.slug,
        });
        (0, validate_sport_rules_config_1.validateSportRuleConfig)(createTournamentDto.sportRules, {
            expectedKind: expectedSportKind,
            allowedKinds: (0, validate_sport_rules_config_1.inferAllowedSportRuleKinds)({
                categoryConfig: category.categoryConfig,
                categoryName: category.name,
                categorySlug: category.slug,
            }),
            sourceLabel: 'sportRules',
        });
        if (expectedSportKind === 'FOOTBALL') {
            (0, football_team_config_1.assertValidFootballTeamConfig)(createTournamentDto.tournamentConfig, {
                requireTeamSize: true,
            });
        }
        if (createTournamentDto.registrationStartDate &&
            createTournamentDto.registrationEndDate) {
            const regStart = new Date(createTournamentDto.registrationStartDate);
            const regEnd = new Date(createTournamentDto.registrationEndDate);
            if (regEnd <= regStart) {
                throw new common_1.BadRequestException('Ngày kết thúc đăng ký phải sau ngày bắt đầu đăng ký');
            }
        }
        if (createTournamentDto.startDate && createTournamentDto.endDate) {
            const tStart = new Date(createTournamentDto.startDate);
            const tEnd = new Date(createTournamentDto.endDate);
            if (tEnd <= tStart) {
                throw new common_1.BadRequestException('Ngày kết thúc giải đấu phải sau ngày bắt đầu');
            }
        }
        if (createTournamentDto.registrationEndDate &&
            createTournamentDto.startDate) {
            const regEnd = new Date(createTournamentDto.registrationEndDate);
            const tStart = new Date(createTournamentDto.startDate);
            if (tStart < regEnd) {
                throw new common_1.BadRequestException('Ngày bắt đầu giải đấu phải sau hoặc bằng ngày kết thúc đăng ký');
            }
        }
        if (createTournamentDto.communityId &&
            createTournamentDto.tournamentType !== 'CLUB') {
            throw new common_1.BadRequestException('Giải gắn với CLB phải có loại CLUB.');
        }
        const isSystemAuthorized = this.isSystemTournamentCreator(systemRoles);
        if (createTournamentDto.tournamentType === 'CLUB') {
            if (!createTournamentDto.communityId) {
                throw new common_1.BadRequestException('Giải đấu của câu lạc bộ phải thuộc một cộng đồng');
            }
            if (createTournamentDto.entryFee && createTournamentDto.entryFee > 0) {
                throw new common_1.BadRequestException('Giải đấu của câu lạc bộ phải miễn phí');
            }
            if (createTournamentDto.galleryImages &&
                createTournamentDto.galleryImages.length > 0) {
                throw new common_1.BadRequestException('Giải đấu của câu lạc bộ không được có ảnh thư viện khi tạo');
            }
            if (!systemRoles.includes('ADMIN')) {
                const member = await this.tournamentsRepository.findCommunityMember(createTournamentDto.communityId, userId);
                if (!member ||
                    !['OWNER', 'MODERATOR'].includes(member.role) ||
                    member.status !== 'JOINED') {
                    throw new common_1.ForbiddenException('Bạn phải là Quản trị viên hoặc Điều hành viên của câu lạc bộ mới có thể tạo giải đấu nội bộ.');
                }
            }
        }
        else {
            if (createTournamentDto.entryFee &&
                createTournamentDto.entryFee > 0 &&
                createTournamentDto.entryFee < 100000) {
                throw new common_1.BadRequestException('Minimum entry fee for paid public tournaments is 100,000đ');
            }
            if (!isSystemAuthorized) {
                throw new common_1.ForbiddenException('Bạn cần có quyền Ban tổ chức để tạo giải đấu công khai.');
            }
        }
        if (createTournamentDto.parentId) {
            const siblings = await this.tournamentsRepository.findByParentId(createTournamentDto.parentId);
            const isDuplicate = siblings.some((div) => div.matchType === createTournamentDto.matchType);
            if (isDuplicate) {
                throw new common_1.BadRequestException('Hình thức thi đấu này đã tồn tại trong giải đấu');
            }
        }
        if (createTournamentDto.venueId) {
            const venue = await this.tournamentsRepository.findByIdVenue(createTournamentDto.venueId);
            if (!venue) {
                throw new common_1.BadRequestException('Địa điểm không tồn tại');
            }
        }
        const record = await this.tournamentsRepository.create(userId, createTournamentDto);
        if (record.tournamentType === 'CLUB' &&
            record.communityId &&
            !record.parentId) {
            try {
                await this.communitySocialRepository.createTournamentPost(record.communityId, userId, record.id, record.name, record.bannerUrl);
            }
            catch (err) {
                console.error('Failed to auto-post tournament to community feed:', err);
            }
        }
        try {
            await this.redisService.delByPattern('tournaments:list:*');
            await this.redisService.delByPattern('matches:list:*');
        }
        catch (e) {
        }
        return this.mapTournamentFormat(record);
    }
    buildLiteSportPreset(sport) {
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
                throw new common_1.BadRequestException('Môn thể thao không hợp lệ. Vui lòng chọn một môn được hỗ trợ.');
        }
    }
    async createLite(userId, dto, systemRoles = []) {
        const isAdmin = systemRoles.includes('ADMIN');
        if (!isAdmin) {
            const createdCount = await this.tournamentsRepository.countCreatedTournaments(userId);
            if (createdCount >= 100) {
                throw new common_1.BadRequestException('Bạn đã đạt giới hạn tối đa 100 giải đấu được phép tạo.');
            }
        }
        const sport = dto.sport?.trim().toLowerCase();
        if (!sport) {
            throw new common_1.BadRequestException('Vui lòng chọn môn thể thao trước khi tạo giải.');
        }
        const category = await this.tournamentsRepository.findCategoryBySlug(sport);
        if (!category) {
            throw new common_1.BadRequestException(`Môn thể thao "${sport}" không được hỗ trợ`);
        }
        const format = dto.format || 'singles';
        const matchType = format === 'mixed_doubles'
            ? 'MIXED_DOUBLES'
            : format === 'doubles'
                ? 'DOUBLES'
                : 'SINGLES';
        this.validateMatchTypeAgainstCategory(category.categoryConfig, matchType, 'tournament');
        const bracketType = dto.bracketType || 'single_elimination';
        const bracketTypeMap = {
            single_elimination: 'SINGLE_ELIMINATION',
            double_elimination: 'DOUBLE_ELIMINATION',
            round_robin: 'ROUND_ROBIN',
            group_stage_knockout: 'GROUP_STAGE_KNOCKOUT',
        };
        const finalBracketType = bracketTypeMap[bracketType];
        if (!finalBracketType) {
            throw new common_1.BadRequestException(`Thể thức "${bracketType}" không được hỗ trợ. Chấp nhận: ${Object.keys(bracketTypeMap).join(', ')}.`);
        }
        const builtInLitePreset = this.buildLiteSportPreset(sport);
        const rawCategoryConfig = category.categoryConfig;
        const categoryDefaults = rawCategoryConfig &&
            typeof rawCategoryConfig === 'object' &&
            rawCategoryConfig.defaultSportRules &&
            typeof rawCategoryConfig.defaultSportRules === 'object'
            ? rawCategoryConfig.defaultSportRules
            : null;
        const presetRules = builtInLitePreset.sportRules;
        const litePreset = {
            sportPreset: categoryDefaults ? `CATEGORY_${sport.toUpperCase()}` : builtInLitePreset.sportPreset,
            sportRules: {
                ...presetRules,
                ...(categoryDefaults ?? {}),
                kind: presetRules.kind,
            },
        };
        const sportRuleDefaults = litePreset.sportRules;
        const sportRules = {
            ...litePreset.sportRules,
            mode: 'LITE',
            ...(sport === 'football'
                ? {
                    halvesCount: dto.footballHalvesCount ?? sportRuleDefaults.halvesCount,
                    halfDuration: dto.footballHalfDuration ?? sportRuleDefaults.halfDuration,
                    allowDraw: dto.footballAllowDraw ?? sportRuleDefaults.allowDraw,
                }
                : {
                    setsToWin: dto.setsToWin ?? sportRuleDefaults.setsToWin,
                    pointsPerSet: dto.pointsPerSet ?? sportRuleDefaults.pointsPerSet,
                    winByTwo: dto.winByTwo ?? sportRuleDefaults.winByTwo,
                    ...(dto.maxPoints !== undefined ? { maxPoints: dto.maxPoints } : {}),
                }),
        };
        const maxTeams = dto.maxTeams || 16;
        const registrationMode = dto.registrationMode === 'INVITE_ONLY'
            ? 'INVITE_ONLY'
            : dto.registrationMode === 'APPROVAL'
                ? 'APPROVAL'
                : 'OPEN';
        const requestedPublic = dto.visibility === 'PUBLIC';
        const tournamentType = dto.communityId
            ? 'CLUB'
            : (dto.tournamentType ?? 'PUBLIC');
        const liteVisibility = requestedPublic
            ? 'PUBLIC'
            : dto.communityId
                ? 'COMMUNITY'
                : 'PRIVATE_INVITE';
        const footballTeamSize = sport === 'football' ? (dto.teamSize ?? 7) : undefined;
        const footballMaxReserve = sport === 'football' ? (dto.maxReserve ?? 0) : undefined;
        if (sport === 'football') {
            (0, football_team_config_1.assertValidFootballTeamConfig)({
                teamSize: footballTeamSize,
                minTeamSize: footballTeamSize,
                maxReserve: footballMaxReserve,
                maxTeamSize: (footballTeamSize ?? 0) + (footballMaxReserve ?? 0),
            }, { requireTeamSize: true });
        }
        let recurringConfig = undefined;
        if (dto.isRecurring) {
            const frequency = dto.recurringFrequency || 'WEEKLY';
            const timeOfDay = dto.recurringTimeOfDay || dto.startTime || '18:00';
            const daysOfWeek = dto.recurringDaysOfWeek && dto.recurringDaysOfWeek.length > 0
                ? dto.recurringDaysOfWeek
                : [
                    dto.recurringDayOfWeek ??
                        (dto.startDate ? new Date(dto.startDate).getDay() : 6),
                ];
            let nextRun;
            if (dto.startDate) {
                const requestedStart = new Date(dto.startDate);
                if (!Number.isNaN(requestedStart.getTime()) && requestedStart.getTime() > Date.now()) {
                    const [hours, minutes] = timeOfDay.split(':').map(Number);
                    requestedStart.setHours(hours || 0, minutes || 0, 0, 0);
                    if (requestedStart.getTime() > Date.now())
                        nextRun = requestedStart;
                }
            }
            nextRun ??= this.calculateNextRecurringDate(frequency, daysOfWeek, timeOfDay);
            const advanceDays = dto.recurringAdvanceDays ?? 0;
            const nextCreateAt = new Date(nextRun.getTime() - advanceDays * 24 * 60 * 60 * 1000);
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
                ...(footballTeamSize !== undefined ? { teamSize: footballTeamSize } : {}),
                ...(footballTeamSize !== undefined ? { minTeamSize: footballTeamSize } : {}),
                ...(footballMaxReserve !== undefined ? { maxReserve: footballMaxReserve } : {}),
                isRanked: dto.isRanked ?? false,
                advanceDays,
                nextRunAt: nextCreateAt.toISOString(),
                nextEventAt: nextRun.toISOString(),
                lastGeneratedAt: new Date().toISOString(),
            };
        }
        const tournamentConfig = {
            mode: 'LITE',
            isLite: true,
            sportPreset: litePreset.sportPreset,
            registrationMode,
            liteJoinPolicy: requestedPublic ? 'PUBLIC' : dto.communityId ? 'COMMUNITY_MEMBERS' : 'INVITE_ONLY',
            liteVisibility,
            bracketSetupMode: 'RANDOM',
            allowPlayerReferee: true,
            hideAdvancedSettings: false,
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
        if (dto.communityId) {
            const communitySportsLite = await this.tournamentsRepository.findCommunitySports(dto.communityId);
            if (communitySportsLite.length > 0) {
                const isMatch = communitySportsLite.some((s) => s.categoryId === category.id);
                if (!isMatch) {
                    throw new common_1.BadRequestException(`Giải đấu của câu lạc bộ phải thuộc bộ môn của câu lạc bộ (${communitySportsLite.map((s) => s.categoryName).join(', ')}).`);
                }
            }
        }
        else if (!systemRoles.includes('ADMIN') && !systemRoles.includes('ORGANIZER')) {
            throw new common_1.ForbiddenException('Giải nhanh ngoài câu lạc bộ yêu cầu quyền Organizer.');
        }
        if (dto.communityId && !systemRoles.includes('ADMIN')) {
            const member = await this.tournamentsRepository.findCommunityMember(dto.communityId, userId);
            if (!member ||
                member.status !== 'JOINED' ||
                !['OWNER', 'MODERATOR'].includes(member.role)) {
                throw new common_1.ForbiddenException('Bạn phải là thành viên của câu lạc bộ để tạo giải đấu.');
            }
        }
        let startDateTime = undefined;
        if (dto.startDate) {
            if (dto.startTime && dto.startTime.includes(':')) {
                const datePart = dto.startDate.includes('T')
                    ? dto.startDate.split('T')[0]
                    : dto.startDate;
                startDateTime = new Date(`${datePart}T${dto.startTime.padStart(5, '0')}:00`).toISOString();
            }
            else {
                startDateTime = new Date(dto.startDate).toISOString();
            }
        }
        let endDateTime = undefined;
        if (dto.endDate) {
            endDateTime = new Date(dto.endDate).toISOString();
        }
        const registrationStartDate = dto.registrationStartDate
            ? new Date(dto.registrationStartDate)
            : new Date();
        const registrationEndDate = dto.registrationEndDate
            ? new Date(dto.registrationEndDate)
            : startDateTime
                ? new Date(new Date(startDateTime).getTime() - 60 * 60 * 1000)
                : undefined;
        if (Number.isNaN(registrationStartDate.getTime()) ||
            (registrationEndDate && Number.isNaN(registrationEndDate.getTime()))) {
            throw new common_1.BadRequestException('Thời gian đăng ký không hợp lệ.');
        }
        if (registrationEndDate && registrationStartDate >= registrationEndDate) {
            throw new common_1.BadRequestException('Thời gian mở đăng ký phải trước thời gian đóng.');
        }
        if (startDateTime && registrationEndDate && registrationEndDate >= new Date(startDateTime)) {
            throw new common_1.BadRequestException('Thời gian đóng đăng ký phải trước giờ bắt đầu giải.');
        }
        const locationParts = [dto.venueName, dto.locationAddress, dto.ward, dto.district, dto.province]
            .map((part) => part?.trim())
            .filter((part) => Boolean(part));
        const tournamentConfigWithLocation = {
            ...tournamentConfig,
            schedule: {
                registrationStartDate: registrationStartDate.toISOString(),
                ...(registrationEndDate ? { registrationEndDate: registrationEndDate.toISOString() } : {}),
                ...(startDateTime ? { startDate: startDateTime } : {}),
                ...(endDateTime ? { endDate: endDateTime } : {}),
            },
            ...(locationParts.length
                ? {
                    location: {
                        ...(dto.venueName ? { venueName: dto.venueName.trim() } : {}),
                        ...(dto.locationAddress ? { address: dto.locationAddress.trim() } : {}),
                        ...(dto.province ? { province: dto.province.trim() } : {}),
                        ...(dto.district ? { district: dto.district.trim() } : {}),
                        ...(dto.ward ? { ward: dto.ward.trim() } : {}),
                        display: locationParts.join(', '),
                    },
                }
                : {}),
        };
        const fullDto = new create_tournament_dto_1.CreateTournamentDto();
        Object.assign(fullDto, {
            name: dto.name,
            tournamentType,
            visibility: requestedPublic ? 'PUBLIC' : 'PRIVATE',
            ...(dto.bannerUrl ? { bannerUrl: dto.bannerUrl } : {}),
            ...(dto.logoUrl ? { logoUrl: dto.logoUrl } : {}),
            ...(dto.communityId ? { communityId: dto.communityId } : {}),
            categoryId: category.id,
            matchType,
            genderRestriction: dto.genderRestriction ?? null,
            description: dto.description || '',
            maxParticipants: maxTeams,
            entryFee: 0,
            isRanked: dto.isRanked ?? false,
            sportRules,
            tournamentConfig: tournamentConfigWithLocation,
            startDate: startDateTime || undefined,
            endDate: endDateTime || undefined,
            registrationStartDate: registrationStartDate.toISOString(),
            registrationEndDate: registrationEndDate?.toISOString(),
            city: dto.province || dto.location || undefined,
            ...(dto.prizeDescription ? { prizeDescription: dto.prizeDescription } : {}),
            ...(dto.contactInfo ? { contactInfo: dto.contactInfo } : {}),
        });
        const record = await this.tournamentsRepository.create(userId, fullDto);
        const formatsToCreate = [
            sport === 'football'
                ? (dto.genderRestriction ? `FOOTBALL_${dto.genderRestriction}` : 'FOOTBALL_MIXED')
                : (dto.format === 'mixed_doubles'
                    ? 'MIXED_DOUBLES'
                    : dto.format === 'doubles'
                        ? (dto.genderRestriction === 'MIXED' ? 'MIXED_DOUBLES' : (dto.genderRestriction === 'FEMALE' ? 'FEMALE_DOUBLES' : 'MALE_DOUBLES'))
                        : (dto.genderRestriction === 'FEMALE' ? 'FEMALE_SINGLES' : 'MALE_SINGLES')),
        ];
        const mapFormatToDivision = (fmt) => {
            switch (fmt) {
                case 'MALE_SINGLES':
                case 'SINGLES_MALE':
                    return { name: 'Đơn Nam', matchType: create_division_dto_1.MatchType.SINGLES, genderRestriction: create_division_dto_1.GenderRestriction.MALE };
                case 'FEMALE_SINGLES':
                case 'SINGLES_FEMALE':
                    return { name: 'Đơn Nữ', matchType: create_division_dto_1.MatchType.SINGLES, genderRestriction: create_division_dto_1.GenderRestriction.FEMALE };
                case 'MALE_DOUBLES':
                case 'DOUBLES_MALE':
                    return { name: 'Đôi Nam', matchType: create_division_dto_1.MatchType.DOUBLES, genderRestriction: create_division_dto_1.GenderRestriction.MALE };
                case 'FEMALE_DOUBLES':
                case 'DOUBLES_FEMALE':
                    return { name: 'Đôi Nữ', matchType: create_division_dto_1.MatchType.DOUBLES, genderRestriction: create_division_dto_1.GenderRestriction.FEMALE };
                case 'MIXED_DOUBLES':
                case 'DOUBLES_MIXED':
                    return { name: 'Đôi Nam Nữ', matchType: create_division_dto_1.MatchType.MIXED_DOUBLES, genderRestriction: create_division_dto_1.GenderRestriction.MIXED };
                case 'FOOTBALL_MALE':
                    return { name: 'Đội nam', matchType: create_division_dto_1.MatchType.DOUBLES, genderRestriction: create_division_dto_1.GenderRestriction.MALE };
                case 'FOOTBALL_FEMALE':
                    return { name: 'Đội nữ', matchType: create_division_dto_1.MatchType.DOUBLES, genderRestriction: create_division_dto_1.GenderRestriction.FEMALE };
                case 'FOOTBALL_MIXED':
                default:
                    return {
                        name: sport === 'football' ? 'Không giới hạn' : 'Đôi Nam',
                        matchType: dto.format === 'singles' ? create_division_dto_1.MatchType.SINGLES : create_division_dto_1.MatchType.DOUBLES,
                        genderRestriction: undefined,
                    };
            }
        };
        let divisionCreationError = null;
        for (const fmt of formatsToCreate) {
            const divInfo = mapFormatToDivision(fmt);
            try {
                await this.tournamentsRepository.createDivision({
                    tournamentId: record.id,
                    name: divInfo.name,
                    matchType: divInfo.matchType,
                    genderRestriction: divInfo.genderRestriction,
                    maxParticipants: maxTeams,
                    entryFee: 0,
                    bracketType: finalBracketType,
                    startDate: startDateTime ? new Date(startDateTime).toISOString() : undefined,
                    registrationEndDate: registrationEndDate ? registrationEndDate.toISOString() : undefined,
                }, userId);
            }
            catch (divErr) {
                divisionCreationError = divErr;
                break;
            }
        }
        if (divisionCreationError) {
            try {
                await this.remove(record.id, userId, systemRoles);
            }
            catch (cleanupError) {
                console.error('Failed to clean up incomplete Lite tournament:', cleanupError);
            }
            throw new common_1.BadRequestException('Không thể tạo đầy đủ các nội dung thi đấu. Vui lòng thử lại.');
        }
        const registrationStartsInFuture = registrationStartDate.getTime() > Date.now();
        const initialStatus = requestedPublic && !isAdmin
            ? 'PENDING_APPROVAL'
            : registrationStartsInFuture
                ? 'UPCOMING'
                : 'REGISTRATION_OPEN';
        const updated = await this.tournamentsRepository.update(record.id, userId, {
            status: initialStatus,
        });
        if (fullDto.communityId && (!requestedPublic || isAdmin)) {
            try {
                await this.communitySocialRepository.createTournamentPost(fullDto.communityId, userId, record.id, record.name, record.bannerUrl, true);
            }
            catch (err) {
                console.error('Failed to auto-post lite tournament to community feed:', err);
            }
        }
        const inviteCode = updated.inviteCode ?? record.inviteCode;
        try {
            await this.redisService.delByPattern('tournaments:list:*');
            await this.redisService.delByPattern('matches:list:*');
        }
        catch (e) {
        }
        const frontendUrl = (this.configService.get('FRONTEND_URL') || 'http://localhost:3001').replace(/\/+$/, '');
        const joinPath = tournamentType === 'CLUB'
            ? `/lite/tournaments/join/${inviteCode}`
            : `/tournaments/${record.id}/register${inviteCode ? `?invite=${encodeURIComponent(inviteCode)}` : ''}`;
        return {
            id: record.id,
            name: record.name,
            status: updated.status,
            inviteCode,
            joinUrl: `${frontendUrl}${joinPath}`,
            qrPayload: `${frontendUrl}${joinPath}`,
        };
    }
    async getLiteJoinStatus(inviteCode, userId) {
        const tournament = await this.tournamentsRepository.findByInviteCode(inviteCode);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        const tCfg = (tournament.tournamentConfig || {});
        if (tCfg.isLite !== true) {
            throw new common_1.BadRequestException('Mã mời không phải của giải đấu Lite.');
        }
        if (tournament.status === 'DRAFT')
            throw new common_1.NotFoundException('Giải chưa được công bố');
        if (tournament.status === 'CANCELLED')
            throw new common_1.NotFoundException('Giải đã bị hủy');
        const t = this.mapTournamentFormat(tournament);
        let categoryName;
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
                communityId: tournament.communityId ?? null,
            },
        };
        if (!userId)
            return { ...base, requiresAuth: true };
        const now = new Date();
        if (tournament.registrationStartDate &&
            now < tournament.registrationStartDate) {
            return { ...base, registrationNotOpen: true };
        }
        if (tournament.registrationEndDate &&
            now > tournament.registrationEndDate) {
            return { ...base, registrationClosed: true };
        }
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
        const participant = await this.tournamentsRepository.findParticipantByTournamentAndUser(tournament.id, userId);
        if (participant)
            return { ...base, alreadyJoined: true, participantId: participant.id };
        if (tournament.status === 'REGISTRATION_CLOSED' ||
            tournament.status === 'UPCOMING' ||
            tournament.status === 'IN_PROGRESS' ||
            tournament.status === 'COMPLETED') {
            return { ...base, registrationClosed: true };
        }
        if (tournament.maxParticipants) {
            const isDoubles = t.matchType === 'DOUBLES' || t.matchType === 'MIXED_DOUBLES';
            const maxSlots = isDoubles
                ? tournament.maxParticipants * 2
                : tournament.maxParticipants;
            const activeUserCount = await this.tournamentsRepository.countLiteActiveRosterUsers(tournament.id);
            if (activeUserCount >= maxSlots)
                return { ...base, tournamentFull: true };
        }
        return { ...base, canJoin: true };
    }
    async joinLite(inviteCode, userId) {
        const tournament = await this.tournamentsRepository.findByInviteCode(inviteCode);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        const tCfg = (tournament.tournamentConfig || {});
        if (tCfg.isLite !== true) {
            throw new common_1.BadRequestException('Mã mời không phải của giải đấu Lite.');
        }
        if (tournament.status !== 'REGISTRATION_OPEN')
            throw new common_1.BadRequestException('Giải không đang mở đăng ký');
        const now = new Date();
        if (tournament.registrationStartDate &&
            now < tournament.registrationStartDate) {
            throw new common_1.BadRequestException('Thời gian đăng ký chưa bắt đầu.');
        }
        if (tournament.registrationEndDate &&
            now > tournament.registrationEndDate) {
            throw new common_1.BadRequestException('Thời gian đăng ký đã kết thúc.');
        }
        if (tournament.communityId) {
            const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
            if (!member)
                throw new common_1.ForbiddenException('Bạn chưa là thành viên câu lạc bộ');
            if (member.status === 'PENDING')
                throw new common_1.ForbiddenException('Yêu cầu vào CLB đang chờ duyệt');
            if (member.status !== 'JOINED')
                throw new common_1.ForbiddenException('Bạn chưa là thành viên câu lạc bộ');
        }
        const existing = await this.tournamentsRepository.findParticipantByTournamentAndUser(tournament.id, userId);
        if (existing)
            throw new common_1.BadRequestException('Bạn đã tham gia giải này');
        if (tournament.maxParticipants) {
            const isDoubles = tournament.matchType === 'DOUBLES' ||
                tournament.matchType === 'MIXED_DOUBLES';
            const maxSlots = isDoubles
                ? tournament.maxParticipants * 2
                : tournament.maxParticipants;
            const activeUserCount = await this.tournamentsRepository.countLiteActiveRosterUsers(tournament.id);
            if (activeUserCount >= maxSlots)
                throw new common_1.BadRequestException('Giải đã đủ số lượng người tham gia.');
        }
        const profile = await this.tournamentsRepository.findUserProfile(userId);
        const name = profile?.fullName || 'Vận động viên';
        const result = await this.tournamentsRepository.registerParticipant(tournament.id, userId, {
            teamName: name,
            rankingConsent: tournament.isRanked === true,
        }, inviteCode);
        return {
            id: result.participant.id,
            name,
            status: result.participant.teamStatus,
            tournamentId: tournament.id,
        };
    }
    async update(id, userId, updateTournamentDto, systemRoles = []) {
        this.validateRegistrationMode(updateTournamentDto.tournamentConfig);
        const existing = await this.tournamentsRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        const existingConfig = (existing.tournamentConfig || {});
        const incomingConfigPatch = updateTournamentDto.tournamentConfig;
        const categoryId = updateTournamentDto.categoryId ?? existing.categoryId;
        const category = await this.tournamentsRepository.findCategory(categoryId);
        if (!category) {
            throw new common_1.NotFoundException('Hạng đấu không tồn tại');
        }
        let canUpdate = await this.isManager(existing, userId, systemRoles);
        if (!canUpdate && existing.communityId) {
            const member = await this.tournamentsRepository.findCommunityMember(existing.communityId, userId);
            if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
                canUpdate = true;
            }
        }
        if (!canUpdate) {
            throw new common_1.ForbiddenException('Bạn không có quyền cập nhật giải đấu này');
        }
        const isAdmin = systemRoles.includes('ADMIN');
        if (updateTournamentDto.status !== undefined && !isAdmin) {
            throw new common_1.ForbiddenException('Trạng thái giải chỉ được thay đổi qua các thao tác nghiệp vụ hoặc bởi Quản trị viên.');
        }
        if (updateTournamentDto.visibility === 'PUBLIC' &&
            existing.visibility !== 'PUBLIC' &&
            existing.status !== 'DRAFT' &&
            !isAdmin) {
            throw new common_1.BadRequestException('Muốn công khai giải nội bộ, hãy đưa giải về bản nháp và công bố để chờ Quản trị viên xét duyệt.');
        }
        await this.assertEntryFeeAllowed(updateTournamentDto.entryFee);
        if (existing.status !== 'DRAFT') {
            const lockedCoreFields = [
                'matchType',
                'categoryId',
                'entryFee',
                'platformFeePercentage',
                'isRanked',
            ];
            for (const field of lockedCoreFields) {
                if (updateTournamentDto[field] !== undefined &&
                    updateTournamentDto[field] !==
                        existing[field]) {
                    throw new common_1.BadRequestException('Không thể thay đổi trường cốt lõi sau khi giải được xuất bản');
                }
            }
            if (incomingConfigPatch) {
                const configCoreFields = [
                    'bracketType',
                    'minElo',
                    'maxElo',
                    'maxCombinedElo',
                    'maxTeammateGap',
                ];
                for (const key of configCoreFields) {
                    if (incomingConfigPatch[key] !== undefined &&
                        !(0, node_util_1.isDeepStrictEqual)(incomingConfigPatch[key], existingConfig[key])) {
                        throw new common_1.BadRequestException(`Không thể sửa khóa cấu hình giải đấu '${key}' sau khi giải được xuất bản`);
                    }
                }
            }
        }
        if (existing.status === 'IN_PROGRESS' || existing.status === 'COMPLETED') {
            const unsafeFields = [
                'matchType',
                'maxParticipants',
                'categoryId',
                'entryFee',
                'platformFeePercentage',
                'registrationStartDate',
                'registrationEndDate',
                'sportRules',
                'isRanked',
            ];
            for (const field of unsafeFields) {
                if (updateTournamentDto[field] !== undefined &&
                    updateTournamentDto[field] !==
                        existing[field]) {
                    throw new common_1.BadRequestException(`Không thể sửa trường '${field}' khi giải đấu đang diễn ra hoặc đã kết thúc`);
                }
            }
            if (incomingConfigPatch) {
                const changedUnsafeConfigKey = Object.keys(incomingConfigPatch).find((key) => key !== 'hideFeaturedCardText' &&
                    !(0, node_util_1.isDeepStrictEqual)(incomingConfigPatch[key], existingConfig[key]));
                if (changedUnsafeConfigKey) {
                    throw new common_1.BadRequestException(`Không thể sửa khóa cấu hình giải đấu '${changedUnsafeConfigKey}' khi giải đang diễn ra hoặc đã kết thúc`);
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
            ? updateTournamentDto.registrationStartDate
                ? new Date(updateTournamentDto.registrationStartDate)
                : null
            : existing.registrationStartDate
                ? new Date(existing.registrationStartDate)
                : null;
        const regEndVal = updateTournamentDto.registrationEndDate !== undefined
            ? updateTournamentDto.registrationEndDate
                ? new Date(updateTournamentDto.registrationEndDate)
                : null
            : existing.registrationEndDate
                ? new Date(existing.registrationEndDate)
                : null;
        if (regStartVal && regEndVal && regEndVal <= regStartVal) {
            throw new common_1.BadRequestException('Ngày kết thúc đăng ký phải sau ngày bắt đầu đăng ký');
        }
        const tStartVal = updateTournamentDto.startDate !== undefined
            ? updateTournamentDto.startDate
                ? new Date(updateTournamentDto.startDate)
                : null
            : existing.startDate
                ? new Date(existing.startDate)
                : null;
        const tEndVal = updateTournamentDto.endDate !== undefined
            ? updateTournamentDto.endDate
                ? new Date(updateTournamentDto.endDate)
                : null
            : existing.endDate
                ? new Date(existing.endDate)
                : null;
        if (tStartVal && tEndVal && tEndVal <= tStartVal) {
            throw new common_1.BadRequestException('Ngày kết thúc giải đấu phải sau ngày bắt đầu');
        }
        if (tStartVal && regEndVal && tStartVal < regEndVal) {
            throw new common_1.BadRequestException('Ngày bắt đầu giải đấu phải sau hoặc bằng ngày kết thúc đăng ký');
        }
        if (updateTournamentDto.entryFee &&
            existing.tournamentType === 'CLUB' &&
            updateTournamentDto.entryFee > 0) {
            throw new common_1.BadRequestException('Giải đấu của câu lạc bộ phải luôn miễn phí');
        }
        if (updateTournamentDto.entryFee &&
            existing.tournamentType === 'PUBLIC' &&
            updateTournamentDto.entryFee > 0 &&
            updateTournamentDto.entryFee < 100000) {
            throw new common_1.BadRequestException('Minimum entry fee for paid public tournaments is 100,000đ');
        }
        const categoryConfig = category.categoryConfig;
        const finalMatchType = updateTournamentDto.matchType ?? existing.matchType;
        let finalGenderRestriction = updateTournamentDto.genderRestriction !== undefined
            ? updateTournamentDto.genderRestriction
            : existing.genderRestriction;
        if (finalMatchType === 'MIXED_DOUBLES' &&
            finalGenderRestriction !== 'MIXED') {
            finalGenderRestriction = create_division_dto_1.GenderRestriction.MIXED;
            updateTournamentDto.genderRestriction = create_division_dto_1.GenderRestriction.MIXED;
        }
        else if ((finalMatchType === 'SINGLES' || finalMatchType === 'DOUBLES') &&
            finalGenderRestriction === 'MIXED') {
            finalGenderRestriction = null;
            updateTournamentDto.genderRestriction = null;
        }
        this.validateMatchTypeAgainstCategory(categoryConfig, finalMatchType, 'tournament');
        this.validateMatchTypeGenderRestriction(finalMatchType, finalGenderRestriction, 'tournament');
        if (updateTournamentDto.sportRules) {
            (0, validate_sport_rules_config_1.validateSportRuleConfig)(updateTournamentDto.sportRules, {
                expectedKind: (0, validate_sport_rules_config_1.inferExpectedSportRuleKind)({
                    categoryConfig: category.categoryConfig,
                    categoryName: category.name,
                    categorySlug: category.slug,
                }),
                allowedKinds: (0, validate_sport_rules_config_1.inferAllowedSportRuleKinds)({
                    categoryConfig: category.categoryConfig,
                    categoryName: category.name,
                    categorySlug: category.slug,
                }),
                sourceLabel: 'sportRules',
            });
        }
        if (updateTournamentDto.bannerUrl !== undefined &&
            existing.bannerUrl &&
            existing.bannerUrl !== updateTournamentDto.bannerUrl) {
            if ((0, cloudinary_helper_1.isStoredImageUrl)(existing.bannerUrl)) {
                try {
                    const publicId = (0, cloudinary_helper_1.extractStoredImagePublicId)(existing.bannerUrl);
                    if (publicId) {
                        await this.storageService.deleteFile(publicId);
                    }
                }
                catch (err) {
                    console.error('Failed to delete old banner from storage:', err);
                }
            }
        }
        if (updateTournamentDto.logoUrl !== undefined &&
            existing.logoUrl &&
            existing.logoUrl !== updateTournamentDto.logoUrl) {
            if ((0, cloudinary_helper_1.isStoredImageUrl)(existing.logoUrl)) {
                try {
                    const publicId = (0, cloudinary_helper_1.extractStoredImagePublicId)(existing.logoUrl);
                    if (publicId) {
                        await this.storageService.deleteFile(publicId);
                    }
                }
                catch (err) {
                    console.error('Failed to delete old logo from storage:', err);
                }
            }
        }
        const updated = await this.tournamentsRepository.update(id, userId, updateTournamentDto);
        const dateChanged = (updateTournamentDto.startDate &&
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
            const siblings = await this.tournamentsRepository.findByParentId(existing.parentId);
            const sharedFields = {};
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
                        await this.tournamentsRepository.update(sibling.id, userId, sharedFields);
                    }
                }
            }
        }
        try {
            await this.redisService.delByPattern('tournaments:list:*');
            await this.redisService.delByPattern('matches:list:*');
        }
        catch (e) {
        }
        return this.mapTournamentFormat(updated);
    }
    async remove(id, userId, systemRoles = []) {
        const existing = await this.tournamentsRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        if (existing.parentId) {
            const siblings = await this.tournamentsRepository.findByParentId(existing.parentId);
            if (siblings.length <= 1) {
                throw new common_1.BadRequestException('Không thể xóa hình thức thi đấu cuối cùng của giải đấu. Nếu muốn xóa toàn bộ giải đấu, vui lòng xóa Giải đấu lớn.');
            }
        }
        let hasPermission = await this.isManager(existing, userId, systemRoles);
        if (!hasPermission && existing.communityId) {
            const member = await this.tournamentsRepository.findCommunityMember(existing.communityId, userId);
            if (member && member.role === 'OWNER') {
                hasPermission = true;
            }
        }
        if (!hasPermission) {
            throw new common_1.ForbiddenException('Bạn không có quyền xóa giải đấu này');
        }
        const paidPayments = await this.tournamentsRepository.countPaidPayments(id);
        const pendingRefunds = await this.tournamentsRepository.countPendingRefunds(id);
        const fullyRefunded = await this.tournamentsRepository.isFullyRefunded(id);
        if (paidPayments > 0 && !fullyRefunded) {
            throw new common_1.BadRequestException(`Giải đấu có ${paidPayments} thanh toán đã thành công chưa được hoàn tiền. ` +
                `Vui lòng hoàn tiền trước khi xóa giải đấu.`);
        }
        if (pendingRefunds > 0) {
            throw new common_1.BadRequestException(`Giải đấu có ${pendingRefunds} giao dịch đang chờ hoàn tiền. ` +
                `Vui lòng hoàn thành hoàn tiền trước khi xóa.`);
        }
        if (existing.status === 'COMPLETED') {
            const archived = await this.tournamentsRepository.archive(id, userId);
            try {
                await this.redisService.delByPattern('tournaments:list:*');
                await this.redisService.delByPattern('matches:list:*');
            }
            catch (e) {
            }
            return {
                ...archived,
                archived: true,
                message: 'Giải đã hoàn thành được lưu trữ để giữ lịch sử giải đấu và ELO.',
            };
        }
        if (systemRoles.includes('ADMIN')) {
            await this.cleanupTournamentImages(existing);
            const result = await this.tournamentsRepository.softDelete(id, userId);
            try {
                await this.communitySocialRepository.softDeletePostsByTournamentId(id);
            }
            catch (err) {
                console.error('Failed to soft delete tournament community posts:', err);
            }
            try {
                await this.redisService.delByPattern('tournaments:list:*');
                await this.redisService.delByPattern('matches:list:*');
            }
            catch (e) {
            }
            return result;
        }
        if (existing.status !== 'DRAFT') {
            const activeParticipants = await this.tournamentsRepository.countActiveParticipants(id);
            const requiresReview = activeParticipants > 0 ||
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
                    message: 'Giải đấu đã có người tham gia hoặc đã bước vào giai đoạn chốt danh sách/thi đấu. Yêu cầu xóa đã được gửi tới Quản trị viên để xét duyệt.',
                };
            }
        }
        await this.cleanupTournamentImages(existing);
        const result = await this.tournamentsRepository.softDelete(id, userId);
        try {
            await this.communitySocialRepository.softDeletePostsByTournamentId(id);
        }
        catch (err) {
            console.error('Failed to soft delete tournament community posts:', err);
        }
        try {
            await this.redisService.delByPattern('tournaments:list:*');
            await this.redisService.delByPattern('matches:list:*');
        }
        catch (e) {
        }
        return result;
    }
    async removeParent(id, userId, systemRoles = []) {
        const existing = await this.tournamentsRepository.findParentById(id);
        if (!existing)
            throw new common_1.NotFoundException('Giải đấu cha không tồn tại');
        const canDelete = await this.isManager(existing, userId, systemRoles);
        if (!canDelete) {
            throw new common_1.ForbiddenException('Bạn không có quyền xóa giải đấu lớn này');
        }
        const divisions = await this.tournamentsRepository.findByParentId(id);
        for (const div of divisions) {
            const paidPayments = await this.tournamentsRepository.countPaidPayments(div.id);
            const pendingRefunds = await this.tournamentsRepository.countPendingRefunds(div.id);
            const fullyRefunded = await this.tournamentsRepository.isFullyRefunded(div.id);
            if (paidPayments > 0 && !fullyRefunded) {
                throw new common_1.BadRequestException(`Hình thức "${div.name}" có ${paidPayments} thanh toán đã thành công chưa được hoàn tiền. ` +
                    `Vui lòng hoàn tiền trước khi xóa giải đấu.`);
            }
            if (pendingRefunds > 0) {
                throw new common_1.BadRequestException(`Hình thức "${div.name}" có ${pendingRefunds} giao dịch đang chờ hoàn tiền. ` +
                    `Vui lòng hoàn thành hoàn tiền trước khi xóa.`);
            }
        }
        const completedDivisions = divisions.filter((div) => div.status === 'COMPLETED');
        if (completedDivisions.length > 0) {
            for (const division of completedDivisions) {
                await this.tournamentsRepository.archive(division.id, userId);
            }
            try {
                await this.redisService.delByPattern('tournaments:list:*');
                await this.redisService.delByPattern('matches:list:*');
            }
            catch (e) {
            }
            return {
                archived: true,
                archivedTournamentIds: completedDivisions.map((division) => division.id),
                message: 'Các giải đã hoàn thành được lưu trữ để giữ lịch sử giải đấu và ELO.',
            };
        }
        if (systemRoles.includes('ADMIN')) {
            const result = await this.tournamentsRepository.softDeleteParent(id, userId);
            try {
                await this.communitySocialRepository.softDeletePostsByTournamentId(id);
            }
            catch (e) {
            }
            try {
                await this.redisService.delByPattern('tournaments:list:*');
                await this.redisService.delByPattern('matches:list:*');
            }
            catch (e) {
            }
            return result;
        }
        for (const div of divisions) {
            if (div.status !== 'DRAFT') {
                const activeParticipants = await this.tournamentsRepository.countActiveParticipants(div.id);
                const requiresReview = activeParticipants > 0 ||
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
                        await this.tournamentsRepository.updateStatus(d.id, 'PENDING_DELETE');
                    }
                    return {
                        pendingDelete: true,
                        message: 'Giải đấu đã có người tham gia hoặc đã bước vào giai đoạn chốt danh sách/thi đấu. Yêu cầu xóa đã được gửi tới Quản trị viên để xét duyệt.',
                    };
                }
            }
        }
        try {
            await this.redisService.delByPattern('tournaments:list:*');
            await this.redisService.delByPattern('matches:list:*');
        }
        catch (e) {
        }
        const deleteResult = await this.tournamentsRepository.softDeleteParent(id, userId);
        try {
            await this.communitySocialRepository.softDeletePostsByTournamentId(id);
        }
        catch (e) {
        }
        return deleteResult;
    }
    async generateBracket(id, userId, systemRoles = [], divisionId, seedingType, allowReset = false) {
        const existing = await this.tournamentsRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        if (existing.status === 'IN_PROGRESS' || existing.status === 'COMPLETED') {
            throw new common_1.BadRequestException('Không thể tạo lại sơ đồ thi đấu cho giải đang diễn ra hoặc đã kết thúc');
        }
        if (!allowReset &&
            (existing.status === 'REGISTRATION_CLOSED' ||
                existing.status === 'UPCOMING')) {
            try {
                const bracket = await this.tournamentsRepository.findBracket(id, divisionId);
                if (bracket && bracket.stages && bracket.stages.length > 0) {
                    throw new common_1.BadRequestException('Sơ đồ bảng đấu đã được chốt. Không thể tạo lại sau khi đăng ký đóng.');
                }
            }
            catch (err) {
                if (err instanceof common_1.BadRequestException)
                    throw err;
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
            const member = await this.tournamentsRepository.findCommunityMember(existing.communityId, userId);
            if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
                isAuthorized = true;
            }
        }
        if (!isAuthorized)
            throw new common_1.ForbiddenException('Bạn không có quyền tạo bảng thi đấu');
        let division;
        if (divisionId) {
            const divisions = await this.tournamentsRepository.getDivisionsByTournament(id);
            division = divisions.find((item) => item.id === divisionId);
            if (!division) {
                throw new common_1.NotFoundException('Không tìm thấy bảng đấu cho giải đấu này');
            }
        }
        const config = (existing.tournamentConfig || {});
        const bracketType = (division?.bracketType ||
            config.bracketType ||
            'SINGLE_ELIMINATION').toUpperCase();
        if (bracketType === 'DOUBLE_ELIMINATION') {
            return this.bracketGeneratorService.generateDoubleElimination(id, userId, divisionId, seedingType);
        }
        else if (bracketType === 'ROUND_ROBIN') {
            return this.bracketGeneratorService.generateRoundRobin(id, userId, divisionId, seedingType);
        }
        else if (bracketType === 'GROUP_STAGE_KNOCKOUT') {
            const participants = await this.tournamentsRepository.findParticipantsForSeeding(id, divisionId);
            const actualTeams = participants.length;
            if (actualTeams < 4) {
                throw new common_1.BadRequestException('Cần ít nhất 4 đội để tạo vòng bảng + loại trực tiếp.');
            }
            return this.bracketGeneratorService.generateGroupStageKnockout(id, userId, divisionId, seedingType);
        }
        else {
            return this.bracketGeneratorService.generateSingleElimination(id, userId, divisionId, seedingType);
        }
    }
    async generateLiteBracket(id, userId, systemRoles = [], reset = false) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        const config = (tournament.tournamentConfig || {});
        if (config.isLite !== true && config.mode !== 'LITE') {
            throw new common_1.BadRequestException('Chỉ giải Lite mới dùng được luồng quản lý này.');
        }
        const bracket = reset
            ? await this.tournamentsRepository.findBracket(id)
            : null;
        const started = bracket?.stages.some((stage) => stage.groups?.some((group) => group.matches?.some((match) => match.status !== 'SCHEDULED'))) ?? false;
        if (started) {
            throw new common_1.BadRequestException('Không thể reset bracket sau khi đã bắt đầu ít nhất một trận.');
        }
        return this.generateBracket(id, userId, systemRoles, undefined, 'RANDOM', reset);
    }
    async autoSeedFromElo(tournamentId, userId, systemRoles = [], divisionId) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        let isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized && tournament.communityId) {
            const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
            if (member && (member.role === 'OWNER' || member.role === 'MODERATOR'))
                isAuthorized = true;
        }
        if (!isAuthorized)
            throw new common_1.ForbiddenException('Bạn không có quyền xếp hạt giống tự động');
        const participants = await this.tournamentsRepository.findParticipantsForSeeding(tournament.id, divisionId);
        let matchType = tournament.matchType || 'DOUBLES';
        if (divisionId) {
            const division = await this.tournamentsRepository.findDivisionById(divisionId);
            if (division) {
                matchType = division.matchType || matchType;
            }
        }
        const eloEntries = [];
        for (const p of participants) {
            const members = p.members || [];
            if (members.length === 0) {
                eloEntries.push({ participantId: p.id, elo: 1000 });
                continue;
            }
            const elos = await Promise.all(members.map((m) => this.tournamentsRepository.getUserElo(m.userId, tournament.categoryId, matchType)));
            const effectiveElo = elos.length > 0
                ? Math.round(elos.reduce((a, b) => a + b, 0) / elos.length)
                : 1000;
            eloEntries.push({ participantId: p.id, elo: effectiveElo });
        }
        eloEntries.sort((a, b) => b.elo - a.elo);
        const seeds = eloEntries.map((entry, index) => ({
            participantId: entry.participantId,
            seed: index + 1,
        }));
        await this.tournamentsRepository.updateSeeds(tournamentId, seeds);
        return { message: 'Auto seeding completed', seeds };
    }
    async validateEloLimits(tournament, userIds, options) {
        const config = tournament.tournamentConfig;
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
        const maxCombinedElo = config?.maxCombinedElo !== undefined && config?.maxCombinedElo !== null
            ? Number(config.maxCombinedElo)
            : null;
        const maxTeammateGap = config?.maxTeammateGap !== undefined && config?.maxTeammateGap !== null
            ? Number(config.maxTeammateGap)
            : null;
        const effectiveMatchType = division?.matchType || tournament.matchType || 'SINGLES';
        if (minElo === null &&
            maxElo === null &&
            maxCombinedElo === null &&
            maxTeammateGap === null) {
            return;
        }
        const elos = [];
        for (const uId of userIds) {
            const elo = await this.tournamentsRepository.getUserElo(uId, tournament.categoryId, effectiveMatchType);
            elos.push(elo);
        }
        for (let i = 0; i < userIds.length; i++) {
            const elo = elos[i];
            if (minElo !== null && elo < minElo) {
                throw new elo_cap_violation_exception_1.EloCapViolationException(`Điểm ELO của bạn (${elo}) thấp hơn mức tối thiểu cho phép (${minElo}) của giải đấu này.`);
            }
            if (maxElo !== null && elo > maxElo) {
                throw new elo_cap_violation_exception_1.EloCapViolationException(`Điểm ELO của bạn (${elo}) vượt quá giới hạn tối đa cho phép (${maxElo}) của giải đấu này.`);
            }
        }
        if (elos.length === 2) {
            const sumElo = elos[0] + elos[1];
            if (maxCombinedElo !== null && sumElo > maxCombinedElo) {
                throw new elo_cap_violation_exception_1.EloCapViolationException(`Tổng điểm ELO của cả đội (${sumElo}) vượt quá giới hạn tối đa cho phép (${maxCombinedElo}) của giải đấu này.`);
            }
            const gap = Math.abs(elos[0] - elos[1]);
            if (maxTeammateGap !== null && gap > maxTeammateGap) {
                throw new elo_cap_violation_exception_1.EloCapViolationException(`Chênh lệch điểm ELO giữa hai đồng đội (${gap}) vượt quá mức chênh lệch tối đa cho phép (${maxTeammateGap}).`);
            }
        }
    }
    async validateProfileComplete(userId) {
        const profile = await this.tournamentsRepository.findUserProfile(userId);
        if (!profile?.fullName || !profile.phoneNumber || !profile.gender) {
            throw new common_1.BadRequestException('Vui lòng cập nhật đầy đủ họ tên, số điện thoại và giới tính trước khi đăng ký giải đấu.');
        }
    }
    normalizeGenderValue(value) {
        const v = String(value ?? '')
            .trim()
            .toUpperCase()
            .replace(/[-–\s]/g, '_');
        if (['MALE', 'MEN', 'NAM'].includes(v))
            return 'MALE';
        if (['FEMALE', 'WOMEN', 'NU', 'NỮ'].includes(v))
            return 'FEMALE';
        return null;
    }
    async validateGenderRestriction(division, userIds) {
        if (!division?.genderRestriction)
            return;
        const restriction = String(division.genderRestriction).trim().toUpperCase();
        const knownUsers = userIds.filter(Boolean);
        if (restriction === 'MIXED') {
            let male = 0;
            let female = 0;
            let knownGenderCount = 0;
            for (const uid of knownUsers) {
                const profile = await this.tournamentsRepository.findUserProfile(uid);
                const g = this.normalizeGenderValue(profile?.gender);
                if (g === 'MALE') {
                    male++;
                    knownGenderCount++;
                }
                else if (g === 'FEMALE') {
                    female++;
                    knownGenderCount++;
                }
            }
            if (knownGenderCount === knownUsers.length &&
                (male === 0 || female === 0)) {
                throw new common_1.BadRequestException('Division đôi nam nữ yêu cầu đúng 1 nam + 1 nữ.');
            }
            return;
        }
        if (restriction !== 'MALE' && restriction !== 'FEMALE')
            return;
        for (const uid of knownUsers) {
            const profile = await this.tournamentsRepository.findUserProfile(uid);
            const g = this.normalizeGenderValue(profile?.gender);
            if (g === null)
                continue;
            if (g !== restriction) {
                throw new common_1.BadRequestException(restriction === 'MALE'
                    ? 'Division này chỉ dành cho Nam.'
                    : 'Division này chỉ dành cho Nữ.');
            }
        }
    }
    assertRegistrationAccessible(tournament, options) {
        const status = tournament.status || '';
        const allowDraft = options?.allowDraft === true;
        if (status !== 'REGISTRATION_OPEN' &&
            status !== 'UPCOMING' &&
            !allowDraft) {
            throw new common_1.BadRequestException('Giải đấu chưa hoặc đã đóng đăng ký');
        }
        if (tournament.registrationEndDate &&
            new Date() > new Date(tournament.registrationEndDate)) {
            throw new common_1.BadRequestException('Hạn đăng ký giải đấu đã kết thúc');
        }
        if (tournament.isRegistrationLocked) {
            throw new common_1.BadRequestException('Đăng ký giải đấu đã tạm thời bị khóa bởi Ban tổ chức');
        }
    }
    async register(id, userId, registerTournamentDto, inviteCode) {
        await this.validateProfileComplete(userId);
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        this.assertRegistrationAccessible(tournament, { inviteCode });
        if (tournament.communityId && tournament.tournamentType === 'CLUB') {
            const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
            if (!member || member.status !== 'JOINED') {
                throw new common_1.ForbiddenException('Giải đấu này chỉ dành cho thành viên của câu lạc bộ.');
            }
        }
        let userIds = [userId];
        let partnerUser = null;
        if (registerTournamentDto.partnerEmailOrPhone) {
            partnerUser = await this.tournamentsRepository.findUserByEmailOrPhone(registerTournamentDto.partnerEmailOrPhone);
            if (!partnerUser) {
                throw new common_1.BadRequestException(`Không tìm thấy tài khoản Sporto với email/SĐT "${registerTournamentDto.partnerEmailOrPhone}". Đồng đội cần đăng ký tài khoản trước khi tham gia.`);
            }
            userIds.push(partnerUser.id);
        }
        const requestedDivisionId = registerTournamentDto.tournamentDivisionId ??
            registerTournamentDto.divisionId;
        const requestedDivision = requestedDivisionId
            ? await this.tournamentsRepository.findDivisionById(requestedDivisionId)
            : null;
        const tournamentConfig = (tournament.tournamentConfig || {});
        const footballTeamConfig = (0, football_team_config_1.resolveFootballTeamConfig)(tournamentConfig);
        const isFootballTeamTournament = footballTeamConfig.isTeamSport;
        let footballTeam = null;
        if (isFootballTeamTournament) {
            if (registerTournamentDto.partnerEmailOrPhone) {
                throw new common_1.BadRequestException('Giải bóng đá dùng đội đã tạo, không ghép đồng đội bằng email.');
            }
            if (!registerTournamentDto.footballTeamId) {
                throw new common_1.BadRequestException('Vui lòng chọn đội bóng trước khi đăng ký.');
            }
            footballTeam =
                await this.tournamentsRepository.findFootballTeamForRegistration(registerTournamentDto.footballTeamId, userId);
            if (!footballTeam || footballTeam.status !== 'ACTIVE') {
                throw new common_1.ForbiddenException('Bạn không có quyền đăng ký bằng đội bóng này.');
            }
            if (!['CAPTAIN', 'MANAGER'].includes(footballTeam.membership.role)) {
                throw new common_1.ForbiddenException('Chỉ đội trưởng hoặc quản lý mới được đăng ký đội bóng.');
            }
            if (footballTeam.categoryId !== tournament.categoryId) {
                throw new common_1.BadRequestException('Đội bóng không cùng môn thể thao với giải đấu.');
            }
            const minTeamSize = footballTeamConfig.mainSize;
            const selectedTeamSize = footballTeamConfig.mainSize;
            const maxReserve = footballTeamConfig.maxReserve;
            const maxTeamSize = footballTeamConfig.maxTotalSize;
            const roster = (0, football_roster_validation_1.validateFootballRosterSelection)({
                leaderId: userId,
                memberIds: registerTournamentDto.memberIds?.length
                    ? registerTournamentDto.memberIds
                    : footballTeam.members.map((member) => member.userId),
                reserveMemberIds: registerTournamentDto.reserveMemberIds ?? [],
                activeMemberIds: new Set(footballTeam.members.map((member) => member.userId)),
                minMainSize: 1,
                maxMainSize: selectedTeamSize,
                maxReserve,
                maxTotalSize: maxTeamSize,
            });
            userIds = roster.allMemberIds;
        }
        await this.validateEloLimits(tournament, userIds, {
            division: requestedDivision,
        });
        await this.validateGenderRestriction(requestedDivision, userIds);
        const result = await this.tournamentsRepository.registerParticipant(id, userId, registerTournamentDto, inviteCode);
        if (footballTeam && result.participant.tournamentDivisionId) {
            const selectedMemberIds = [
                ...new Set([
                    ...(registerTournamentDto.memberIds?.length
                        ? registerTournamentDto.memberIds
                        : footballTeam.members.map((member) => member.userId)),
                    ...(registerTournamentDto.reserveMemberIds ?? []),
                ]),
            ].filter((memberId) => memberId !== userId);
            try {
                await this.sendNotificationBatch(selectedMemberIds.map((receiverId) => this.notificationsService.sendNotification((0, notification_builder_1.buildFootballRosterConfirmationNotification)({
                    receiverId,
                    tournamentId: id,
                    tournamentName: tournament.name,
                    divisionId: result.participant.tournamentDivisionId ?? undefined,
                    participantId: result.participant.id,
                }))));
            }
            catch (error) {
                console.error('Failed to send football roster confirmation notifications:', error);
            }
        }
        try {
            const canceledLeaders = await this.tournamentsRepository.cancelPendingRegistrationsIfFull(id);
            for (const canceledLeader of canceledLeaders) {
                await this.notificationsService.sendNotification((0, notification_builder_1.buildRegistrationCancelledFullNotification)({
                    receiverId: canceledLeader.leaderId,
                    tournamentId: id,
                    divisionId: canceledLeader.divisionId,
                }));
            }
        }
        catch (err) {
            console.error('Failed to cancel pending registrations on full:', err);
        }
        try {
            const notifications = [];
            if (tournament.createdBy !== userId) {
                notifications.push(this.notificationsService.sendNotification((0, notification_builder_1.buildOrganizerNewRegistrationNotification)({
                    receiverId: tournament.createdBy,
                    tournamentId: id,
                    tournamentName: tournament.name,
                    teamName: result.participant.teamName,
                    divisionId: result.participant.tournamentDivisionId,
                })));
            }
            if (result.teamInviteLink) {
                notifications.push(this.notificationsService.sendNotification((0, notification_builder_1.buildParticipantPendingTeammateNotification)({
                    receiverId: userId,
                    tournamentId: id,
                    tournamentName: tournament.name,
                    divisionId: result.participant.tournamentDivisionId,
                })));
            }
            else if (result.participant.teamStatus === 'PENDING_PARTNER' &&
                partnerUser) {
                notifications.push(this.notificationsService.sendNotification((0, notification_builder_1.buildPartnerInviteReceivedNotification)({
                    tournamentId: id,
                    tournamentName: tournament.name,
                    receiverId: partnerUser.id,
                    senderId: userId,
                    teamName: result.participant.teamName,
                    participantId: result.participant.id,
                })));
            }
            else if (result.participant.teamStatus === 'PENDING_APPROVAL') {
                notifications.push(this.notificationsService.sendNotification((0, notification_builder_1.buildParticipantRegistrationPendingNotification)({
                    receiverId: userId,
                    tournamentId: id,
                    tournamentName: tournament.name,
                    divisionId: result.participant.tournamentDivisionId,
                })));
            }
            else if (result.participant.teamStatus === 'COMPLETE' &&
                result.participant.isPaid) {
                notifications.push(this.notificationsService.sendNotification((0, notification_builder_1.buildParticipantRegistrationSuccessNotification)({
                    receiverId: userId,
                    tournamentId: id,
                    tournamentName: tournament.name,
                    divisionId: result.participant.tournamentDivisionId,
                })));
            }
            await this.sendNotificationBatch(notifications);
        }
        catch (err) {
            console.error('Failed to send registration notifications:', err);
        }
        try {
            const config = (tournament.tournamentConfig || {});
            if (config.seedingMethod === 'ELO') {
                const divisionId = result.participant.tournamentDivisionId;
                await this.autoSeedFromElo(id, userId, [], divisionId ?? undefined);
            }
        }
        catch (err) {
            console.error('Failed to auto-seed after registration:', err);
        }
        this.broadcastRegistrationChanged(id, {
            participantId: result.participant.id,
            divisionId: result.participant.tournamentDivisionId,
            action: 'REGISTERED',
        });
        return result;
    }
    async joinTeam(tournamentId, userId, participantId, teamInviteToken) {
        await this.validateProfileComplete(userId);
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        this.assertRegistrationAccessible(tournament, { allowDraft: true });
        if (tournament.communityId && tournament.tournamentType === 'CLUB') {
            const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
            if (!member || member.status !== 'JOINED') {
                throw new common_1.ForbiddenException('Giải đấu này chỉ dành cho thành viên của câu lạc bộ.');
            }
        }
        const leaderRoster = await this.tournamentsRepository.findLeaderByParticipantId(participantId);
        const userIds = [userId];
        if (leaderRoster) {
            userIds.push(leaderRoster.userId);
        }
        const participant = await this.tournamentsRepository.findParticipantById(participantId);
        if (participant?.rosterLockedAt) {
            throw new common_1.BadRequestException('Roster đội đã được khóa, không thể thêm thành viên.');
        }
        const division = participant?.tournamentDivisionId
            ? await this.tournamentsRepository.findDivisionById(participant.tournamentDivisionId)
            : null;
        await this.validateEloLimits(tournament, userIds, { division });
        await this.validateGenderRestriction(division, [
            userId,
            leaderRoster?.userId,
        ]);
        const result = await this.tournamentsRepository.joinTeam(tournamentId, userId, participantId, teamInviteToken);
        try {
            const canceledLeaders = await this.tournamentsRepository.cancelPendingRegistrationsIfFull(tournamentId);
            for (const canceledLeader of canceledLeaders) {
                await this.notificationsService.sendNotification((0, notification_builder_1.buildRegistrationCancelledFullNotification)({
                    receiverId: canceledLeader.leaderId,
                    tournamentId,
                    divisionId: canceledLeader.divisionId,
                }));
            }
        }
        catch (err) {
            console.error('Failed to cancel pending registrations on full:', err);
        }
        try {
            const participantRosters = await this.tournamentsRepository.getParticipantRosters(result.participant.id);
            const notifications = [];
            if (leaderRoster && leaderRoster.userId !== userId) {
                notifications.push(this.notificationsService.sendNotification((0, notification_builder_1.buildParticipantTeammateJoinedNotification)({
                    receiverId: leaderRoster.userId,
                    tournamentId,
                    tournamentName: tournament.name,
                    divisionId: result.participant.tournamentDivisionId,
                })));
            }
            if (tournament.createdBy !== userId) {
                notifications.push(this.notificationsService.sendNotification((0, notification_builder_1.buildOrganizerTeamCompletedNotification)({
                    receiverId: tournament.createdBy,
                    tournamentId,
                    tournamentName: tournament.name,
                    teamName: result.participant.teamName,
                    divisionId: result.participant.tournamentDivisionId,
                })));
            }
            for (const roster of participantRosters) {
                if (result.participant.teamStatus === 'PENDING_APPROVAL') {
                    notifications.push(this.notificationsService.sendNotification((0, notification_builder_1.buildParticipantRegistrationPendingNotification)({
                        receiverId: roster.userId,
                        tournamentId,
                        tournamentName: tournament.name,
                        divisionId: result.participant.tournamentDivisionId,
                    })));
                }
                else if (result.participant.teamStatus === 'COMPLETE' &&
                    result.participant.isPaid) {
                    notifications.push(this.notificationsService.sendNotification((0, notification_builder_1.buildParticipantRegistrationSuccessNotification)({
                        receiverId: roster.userId,
                        tournamentId,
                        tournamentName: tournament.name,
                        divisionId: result.participant.tournamentDivisionId,
                    })));
                }
            }
            await this.sendNotificationBatch(notifications);
        }
        catch (err) {
            console.error('Failed to send joinTeam notifications:', err);
        }
        this.broadcastRegistrationChanged(tournamentId, {
            participantId: result.participant.id,
            divisionId: result.participant.tournamentDivisionId,
            action: 'TEAM_JOINED',
        });
        return result;
    }
    async addTeamMember(participantId, userId, memberUserId, role) {
        if (!memberUserId) {
            throw new common_1.BadRequestException('Thiếu ID thành viên cần mời.');
        }
        const participant = await this.tournamentsRepository.findParticipantById(participantId);
        if (!participant)
            throw new common_1.NotFoundException('Đội thi đấu không tồn tại.');
        const tournament = await this.tournamentsRepository.findById(participant.tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        if (participant.registeredBy !== userId) {
            throw new common_1.ForbiddenException('Chỉ đội trưởng mới được mời thành viên.');
        }
        if (tournament.status !== 'REGISTRATION_OPEN' &&
            tournament.status !== 'UPCOMING') {
            throw new common_1.BadRequestException('Giải đấu không trong thời gian đăng ký.');
        }
        if (participant.rosterLockedAt) {
            throw new common_1.BadRequestException('Roster đội đã được khóa, không thể thêm thành viên.');
        }
        if (memberUserId === userId) {
            throw new common_1.BadRequestException('Bạn đã là đội trưởng của đội.');
        }
        const config = (tournament.tournamentConfig || {});
        const maxTeamSize = (0, football_team_config_1.resolveFootballTeamConfig)(config).maxTotalSize;
        if (Number.isFinite(maxTeamSize) && maxTeamSize > 0) {
            const rosters = await this.tournamentsRepository.getParticipantRosters(participantId);
            if (rosters.length >= maxTeamSize) {
                throw new common_1.BadRequestException('Đội đã đạt số thành viên tối đa.');
            }
        }
        const existing = await this.tournamentsRepository.getParticipantRosters(participantId);
        if (existing.some((r) => r.userId === memberUserId)) {
            throw new common_1.BadRequestException('Thành viên này đã ở trong đội.');
        }
        const result = await this.tournamentsRepository.addRoster(participantId, memberUserId, role, maxTeamSize);
        this.broadcastRegistrationChanged(participant.tournamentId, {
            participantId,
            divisionId: participant.tournamentDivisionId,
            action: 'ROSTER_UPDATED',
        });
        return result;
    }
    async removeTeamMember(participantId, userId, memberUserId) {
        const participant = await this.tournamentsRepository.findParticipantById(participantId);
        if (!participant)
            throw new common_1.NotFoundException('Đội thi đấu không tồn tại.');
        if (participant.registeredBy !== userId) {
            throw new common_1.ForbiddenException('Chỉ đội trưởng mới được xoá thành viên.');
        }
        if (memberUserId === userId) {
            throw new common_1.BadRequestException('Không thể tự xoá đội trưởng. Hãy rút đội.');
        }
        if (participant.rosterLockedAt) {
            throw new common_1.BadRequestException('Roster đội đã được khóa, không thể xóa thành viên.');
        }
        const result = await this.tournamentsRepository.removeRoster(participantId, memberUserId);
        this.broadcastRegistrationChanged(participant.tournamentId, {
            participantId,
            divisionId: participant.tournamentDivisionId,
            action: 'ROSTER_UPDATED',
        });
        return result;
    }
    async withdraw(tournamentId, userId, bankData, divisionId) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        const now = new Date();
        if (['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(tournament.status)) {
            throw new common_1.BadRequestException('Giải đấu đã bắt đầu hoặc kết thúc, không thể tự rút lui.');
        }
        if (tournament.registrationEndDate &&
            now > new Date(tournament.registrationEndDate) &&
            tournament.status !== 'UPCOMING') {
            throw new common_1.BadRequestException('Đã quá thời hạn rút lui của giải đấu.');
        }
        const currentRegistration = await this.tournamentsRepository.myRegistration(tournamentId, userId, divisionId);
        const result = await this.tournamentsRepository.withdraw(tournamentId, userId, bankData, divisionId);
        try {
            if (tournament.createdBy !== userId &&
                currentRegistration.registered &&
                currentRegistration.participant) {
                await this.notificationsService.sendNotification((0, notification_builder_1.buildParticipantWithdrawnNotification)({
                    receiverId: tournament.createdBy,
                    tournamentId,
                    tournamentName: tournament.name,
                    teamName: currentRegistration.participant.teamName,
                }));
            }
            if (currentRegistration.registered &&
                currentRegistration.participant &&
                currentRegistration.participant.teamStatus === 'PENDING_PARTNER' &&
                currentRegistration.participant.partnerUserId) {
                await this.notificationsService.sendNotification((0, notification_builder_1.buildPartnerInviteCancelledNotification)({
                    receiverId: currentRegistration.participant.partnerUserId,
                    tournamentId,
                    divisionId: currentRegistration.participant.tournamentDivisionId,
                }));
            }
        }
        catch (err) {
            console.error('Failed to send withdraw notification:', err);
        }
        if (currentRegistration.participant) {
            this.broadcastRegistrationChanged(tournamentId, {
                participantId: currentRegistration.participant.id,
                divisionId: currentRegistration.participant.tournamentDivisionId,
                action: 'WITHDRAWN',
            });
        }
        return result;
    }
    async myRegistration(tournamentId, userId, divisionId) {
        return this.tournamentsRepository.myRegistration(tournamentId, userId, divisionId);
    }
    async findParticipants(id, divisionId) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        const config = (tournament.tournamentConfig || {});
        if (config.isLite === true) {
            return this.tournamentsRepository.findLiteParticipantsWithRosters(id);
        }
        return this.tournamentsRepository.findPublicParticipants(id, tournament.categoryId, divisionId);
    }
    async findParticipantsForOrganizer(id, divisionId, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        if (!(await this.isManager(tournament, userId, systemRoles))) {
            throw new common_1.ForbiddenException('Bạn không có quyền xem hồ sơ đăng ký của giải đấu này.');
        }
        return this.tournamentsRepository.findParticipants(id, tournament.categoryId, divisionId, false, true);
    }
    async findBracket(id, divisionId) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        if (divisionId) {
            const divisions = await this.tournamentsRepository.getDivisionsByTournament(id);
            const exists = divisions.some((division) => division.id === divisionId);
            if (!exists) {
                throw new common_1.NotFoundException('Không tìm thấy bảng đấu cho giải đấu này');
            }
        }
        return this.tournamentsRepository.findBracket(id, divisionId);
    }
    async findByInviteCode(inviteCode) {
        const tournament = await this.tournamentsRepository.findByInviteCode(inviteCode);
        if (!tournament) {
            throw new common_1.NotFoundException('Không tìm thấy giải đấu cho mã mời này');
        }
        this.assertInviteReachable(tournament);
        return this.mapTournamentFormat(tournament);
    }
    async joinByInviteCode(inviteCode, userId, registerTournamentDto) {
        const tournament = await this.tournamentsRepository.findByInviteCode(inviteCode);
        if (!tournament) {
            throw new common_1.NotFoundException('Không tìm thấy giải đấu cho mã mời này');
        }
        this.assertInviteReachable(tournament);
        return this.register(tournament.id, userId, registerTournamentDto, inviteCode);
    }
    assertInviteReachable(tournament) {
        const status = tournament.status || '';
        if (['DRAFT', 'PENDING_APPROVAL', 'PENDING_DELETE'].includes(status)) {
            throw new common_1.NotFoundException('Không tìm thấy giải đấu cho mã mời này');
        }
        if (status === 'SUSPENDED') {
            throw new common_1.ForbiddenException('Giải đấu đang bị tạm đình chỉ do vi phạm điều khoản dịch vụ');
        }
        if (status === 'CANCELLED') {
            throw new common_1.ForbiddenException('Giải đấu đã bị cấm hoặc hủy vĩnh viễn');
        }
    }
    async regenerateInviteCode(id, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        const isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền tạo lại mã mời');
        }
        const updated = await this.tournamentsRepository.regenerateInviteCode(id, userId);
        return this.mapTournamentFormat(updated);
    }
    async getGallery(id) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        if (tournament.tournamentType !== 'PUBLIC') {
            throw new common_1.BadRequestException('Thư viện ảnh chỉ dành cho giải đấu công khai');
        }
        return tournament.galleryImages || [];
    }
    async addGalleryImage(id, userId, url, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        if (tournament.tournamentType !== 'PUBLIC') {
            throw new common_1.BadRequestException('Thư viện ảnh chỉ dành cho giải đấu công khai');
        }
        const isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền thêm ảnh thư viện');
        }
        const galleryImages = [...(tournament.galleryImages || []), url];
        const updated = await this.tournamentsRepository.update(id, userId, {
            galleryImages,
        });
        return this.mapTournamentFormat(updated);
    }
    async removeGalleryImage(id, userId, index, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        if (tournament.tournamentType !== 'PUBLIC') {
            throw new common_1.BadRequestException('Thư viện ảnh chỉ dành cho giải đấu công khai');
        }
        const isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền xóa ảnh thư viện');
        }
        const currentImages = tournament.galleryImages || [];
        if (index < 0 || index >= currentImages.length) {
            throw new common_1.BadRequestException('Chỉ số ảnh thư viện không hợp lệ');
        }
        const removedUrl = currentImages[index];
        if ((0, cloudinary_helper_1.isStoredImageUrl)(removedUrl)) {
            try {
                const publicId = (0, cloudinary_helper_1.extractStoredImagePublicId)(removedUrl);
                if (publicId) {
                    await this.storageService.deleteFile(publicId);
                }
            }
            catch (err) {
                console.error('Failed to delete gallery image from storage:', err);
            }
        }
        const galleryImages = currentImages.filter((_, idx) => idx !== index);
        const updated = await this.tournamentsRepository.update(id, userId, {
            galleryImages,
        });
        return this.mapTournamentFormat(updated);
    }
    async publish(id, userId, systemRoles = []) {
        const existing = await this.tournamentsRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        let isAuthorized = await this.isManager(existing, userId, systemRoles);
        if (!isAuthorized && existing.communityId) {
            const member = await this.tournamentsRepository.findCommunityMember(existing.communityId, userId);
            if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
                isAuthorized = true;
            }
        }
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền xuất bản giải đấu này');
        }
        if (existing.status !== 'DRAFT') {
            throw new common_1.BadRequestException('Tournament is not in DRAFT status');
        }
        if (!existing.description || existing.description.trim().length < 10) {
            throw new common_1.BadRequestException('Mô tả giải đấu phải có ít nhất 10 ký tự trước khi công bố.');
        }
        const defaultBanner = 'https://qlgiaidau.vndcsport.vn/default-banner.png';
        const defaultLogo = 'https://qlgiaidau.vndcsport.vn/default-logo.png';
        const updateData = {};
        if (!existing.bannerUrl)
            updateData.bannerUrl = defaultBanner;
        if (!existing.logoUrl)
            updateData.logoUrl = defaultLogo;
        if (!existing.startDate) {
            throw new common_1.BadRequestException('Vui lòng cấu hình ngày bắt đầu giải đấu trước khi công bố.');
        }
        if (!existing.endDate) {
            throw new common_1.BadRequestException('Vui lòng cấu hình ngày kết thúc giải đấu trước khi công bố.');
        }
        if (existing.startDate &&
            existing.endDate &&
            new Date(existing.startDate) >= new Date(existing.endDate)) {
            throw new common_1.BadRequestException('Ngày bắt đầu phải trước ngày kết thúc giải đấu.');
        }
        if (!existing.registrationStartDate) {
            throw new common_1.BadRequestException('Vui lòng cấu hình ngày bắt đầu đăng ký trước khi công bố.');
        }
        if (!existing.registrationEndDate) {
            throw new common_1.BadRequestException('Vui lòng cấu hình ngày kết thúc đăng ký trước khi công bố.');
        }
        if (existing.registrationStartDate &&
            existing.registrationEndDate &&
            new Date(existing.registrationStartDate) >=
                new Date(existing.registrationEndDate)) {
            throw new common_1.BadRequestException('Ngày mở đăng ký phải trước ngày đóng đăng ký.');
        }
        if (existing.registrationEndDate &&
            existing.startDate &&
            new Date(existing.registrationEndDate) > new Date(existing.startDate)) {
            throw new common_1.BadRequestException('Ngày đóng đăng ký phải trước ngày khởi tranh.');
        }
        if (!existing.venueId) {
            throw new common_1.BadRequestException('Vui lòng cấu hình địa điểm thi đấu (sân đấu) trước khi công bố.');
        }
        const contactInfo = existing.contactInfo;
        const hasContact = contactInfo &&
            ((contactInfo.phone &&
                typeof contactInfo.phone === 'string' &&
                contactInfo.phone.trim() !== '') ||
                (contactInfo.email &&
                    typeof contactInfo.email === 'string' &&
                    contactInfo.email.trim() !== '') ||
                (contactInfo.phone && typeof contactInfo.phone === 'number'));
        if (!hasContact) {
            throw new common_1.BadRequestException('Vui lòng cập nhật ít nhất 1 thông tin liên hệ (email hoặc số điện thoại) trước khi công bố.');
        }
        if (existing.entryFee === undefined || existing.entryFee === null) {
            throw new common_1.BadRequestException('Vui lòng cấu hình lệ phí tham gia trước khi công bố giải đấu.');
        }
        const divisions = await this.tournamentsRepository.getDivisionsByTournament(id);
        if (!divisions || divisions.length === 0) {
            throw new common_1.BadRequestException('Vui lòng tạo ít nhất 1 nội dung thi đấu trước khi công bố.');
        }
        if (Object.keys(updateData).length > 0) {
            await this.tournamentsRepository.update(id, userId, updateData);
        }
        const publishFee = await this.getPublishFee(existing.tournamentType, existing.isRanked);
        if (publishFee > 0) {
            throw new common_1.BadRequestException(`Vui lòng thanh toán phí công bố giải đấu ${publishFee.toLocaleString('vi-VN')}đ trước khi công bố.`);
        }
        await this.tournamentsRepository.clearMockParticipants(id);
        const isAdmin = systemRoles.includes('ADMIN');
        const notYetOpen = existing.registrationStartDate &&
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
    async lock(id, userId, systemRoles = []) {
        const existing = await this.tournamentsRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        let isAuthorized = await this.isManager(existing, userId, systemRoles);
        if (!isAuthorized && existing.communityId) {
            const member = await this.tournamentsRepository.findCommunityMember(existing.communityId, userId);
            if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
                isAuthorized = true;
            }
        }
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền chốt giải đấu này');
        }
        if (existing.status !== 'REGISTRATION_OPEN' &&
            existing.status !== 'REGISTRATION_CLOSED') {
            throw new common_1.BadRequestException('Đăng ký giải đấu phải mở hoặc đã đóng để có thể chốt');
        }
        const allDivs = await this.tournamentsRepository.getDivisionsByTournament(id);
        const category = await this.tournamentsRepository.findCategory(existing.categoryId);
        for (const d of allDivs) {
            if (!category) {
                throw new common_1.NotFoundException('Hạng đấu không tồn tại');
            }
            const resolvedRules = (0, resolve_effective_sport_rules_1.resolveEffectiveSportRules)({
                tournamentSportRules: existing.sportRules,
                categoryConfig: category.categoryConfig,
                categoryName: category.name,
                categorySlug: category.slug,
                stageRoundConfig: d.roundConfig,
            });
            if (resolvedRules.setsToWin < 1 || resolvedRules.pointsPerSet < 1) {
                throw new common_1.BadRequestException('Vui lòng cấu hình luật thi đấu hợp lệ cho "' +
                    d.name +
                    '" trước khi chốt danh sách.');
            }
        }
        const participants = await this.tournamentsRepository.findPublicParticipants(id, existing.categoryId);
        if (participants.length < 2) {
            throw new common_1.BadRequestException('Cần ít nhất 2 người tham gia để chốt và tạo sơ đồ thi đấu');
        }
        const lockConfig = (existing.tournamentConfig || {});
        const lockFootballConfig = (0, football_team_config_1.resolveFootballTeamConfig)(lockConfig);
        const lockMinTeamSize = lockFootballConfig.isTeamSport
            ? lockFootballConfig.mainSize
            : 0;
        if (lockMinTeamSize > 0) {
            for (const p of participants) {
                const members = p.members ||
                    [];
                const mainCount = members.filter((m) => (m.role || 'MAIN') === 'MAIN').length;
                if (mainCount < lockMinTeamSize) {
                    throw new common_1.BadRequestException(`Đội "${p.teamName}" chưa đủ đội hình (cần tối thiểu ${lockMinTeamSize} cầu thủ chính thức, hiện có ${mainCount}).`);
                }
            }
        }
        const totalPlayers = participants.reduce((sum, p) => sum + (p.members?.length || 0), 0);
        const entryFee = Number(existing.entryFee || 0);
        const platformFeePercentage = Number(existing.platformFeePercentage || 0);
        const feePerPlayer = (0, platform_fee_helper_1.calcPlatformFee)(entryFee, platformFeePercentage);
        const totalPlatformFee = totalPlayers * feePerPlayer;
        const isClubOrFree = existing.tournamentType === 'CLUB' || totalPlatformFee === 0;
        const targetStatus = isClubOrFree ? 'UPCOMING' : 'REGISTRATION_CLOSED';
        let bracket = null;
        try {
            bracket = await this.generateBracket(id, userId, systemRoles);
        }
        catch (err) {
            throw new common_1.BadRequestException('Failed to generate tournament bracket: ' + err.message);
        }
        const updated = await this.tournamentsRepository.update(id, userId, {
            status: targetStatus,
        });
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
    async confirmRoster(id, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        if (!(await this.isManager(tournament, userId, systemRoles))) {
            throw new common_1.ForbiddenException('Bạn không có quyền chốt danh sách giải đấu này');
        }
        const config = (tournament.tournamentConfig || {});
        const isLegacyLite = config.mode === 'LITE' && config.hideAdvancedSettings === true;
        if (config.isLite !== true && !isLegacyLite) {
            throw new common_1.BadRequestException('Chỉ giải đấu Lite mới hỗ trợ chốt danh sách hiện tại');
        }
        if (!['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'].includes(tournament.status)) {
            throw new common_1.BadRequestException('Chỉ có thể chốt danh sách khi giải đang mở hoặc đã đóng đăng ký');
        }
        const updated = await this.tournamentsRepository.update(id, userId, {
            isRegistrationLocked: true,
        });
        return this.mapTournamentFormat(updated);
    }
    async updateStage(stageId, userId, data, systemRoles = []) {
        const stage = await this.tournamentsRepository.findStageById(stageId);
        if (!stage)
            throw new common_1.NotFoundException('Vòng đấu không tồn tại');
        const tournament = await this.tournamentsRepository.findById(stage.tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        let isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized && tournament.communityId) {
            const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
            if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
                isAuthorized = true;
            }
        }
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền cập nhật vòng đấu này');
        }
        if (data.roundConfig) {
            const category = await this.tournamentsRepository.findCategory(tournament.categoryId);
            if (!category) {
                throw new common_1.NotFoundException('Hạng đấu không tồn tại');
            }
            (0, validate_sport_rules_config_1.validateSportRuleConfig)(data.roundConfig, {
                expectedKind: (0, validate_sport_rules_config_1.inferExpectedSportRuleKind)({
                    categoryConfig: category.categoryConfig,
                    categoryName: category.name,
                    categorySlug: category.slug,
                }),
                allowedKinds: (0, validate_sport_rules_config_1.inferAllowedSportRuleKinds)({
                    categoryConfig: category.categoryConfig,
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
    async updateGroup(groupId, userId, data, systemRoles = []) {
        const group = await this.tournamentsRepository.findGroupById(groupId);
        if (!group)
            throw new common_1.NotFoundException('Bảng đấu không tồn tại');
        const tournament = await this.tournamentsRepository.findById(group.tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        let isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized && tournament.communityId) {
            const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
            isAuthorized = member?.role === 'OWNER' || member?.role === 'MODERATOR';
        }
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền cập nhật bảng đấu này');
        }
        if (data.roundConfig) {
            const category = await this.tournamentsRepository.findCategory(tournament.categoryId);
            if (!category)
                throw new common_1.NotFoundException('Hạng đấu không tồn tại');
            (0, validate_sport_rules_config_1.validateSportRuleConfig)(data.roundConfig, {
                expectedKind: (0, validate_sport_rules_config_1.inferExpectedSportRuleKind)({
                    categoryConfig: category.categoryConfig,
                    categoryName: category.name,
                    categorySlug: category.slug,
                }),
                allowedKinds: (0, validate_sport_rules_config_1.inferAllowedSportRuleKinds)({
                    categoryConfig: category.categoryConfig,
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
    async validateInvite(id, inviteCode) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament || tournament.inviteCode !== inviteCode) {
            throw new common_1.BadRequestException('Mã mời không hợp lệ');
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
    async createParent(userId, data, systemRoles = []) {
        if (!this.isSystemTournamentCreator(systemRoles)) {
            throw new common_1.ForbiddenException('Chỉ tài khoản Organizer hoặc Admin mới có thể tạo giải ngoài CLB.');
        }
        return this.tournamentsRepository.createParent(userId, data);
    }
    async updateParent(id, userId, data, systemRoles = []) {
        const existing = await this.tournamentsRepository.findParentById(id);
        if (!existing)
            throw new common_1.NotFoundException('Giải đấu cha không tồn tại');
        const canUpdate = await this.isManager(existing, userId, systemRoles);
        if (!canUpdate) {
            throw new common_1.ForbiddenException('Bạn không có quyền cập nhật giải đấu lớn này');
        }
        return this.tournamentsRepository.updateParent(id, userId, data);
    }
    async findParentById(id) {
        const parent = await this.tournamentsRepository.findParentById(id);
        if (!parent)
            throw new common_1.NotFoundException('Giải đấu cha không tồn tại');
        return parent;
    }
    async findParentsByUser(userId) {
        return this.tournamentsRepository.findParentsByUser(userId);
    }
    async getParentWithAggregation(parentId) {
        const aggregation = await this.tournamentsRepository.getParentWithAggregation(parentId);
        return aggregation;
    }
    async seedMockParticipants(tournamentId, userId, names, systemRoles = [], divisionId) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        const isLite = tournament.tournamentConfig?.isLite === true;
        if (tournament.status !== 'DRAFT' &&
            !isLite &&
            tournament.status !== 'REGISTRATION_OPEN' &&
            tournament.status !== 'UPCOMING') {
            throw new common_1.BadRequestException('Chỉ có thể tạo dữ liệu ảo khi giải đấu ở trạng thái Nháp hoặc Mở đăng ký.');
        }
        const isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền tạo dữ liệu ảo');
        }
        return this.tournamentsRepository.seedMockParticipants(tournamentId, names, divisionId);
    }
    async clearMockParticipants(tournamentId, userId, systemRoles = [], divisionId) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        const isLite = tournament.tournamentConfig?.isLite === true;
        if (tournament.status !== 'DRAFT' &&
            !isLite &&
            tournament.status !== 'REGISTRATION_OPEN' &&
            tournament.status !== 'UPCOMING') {
            throw new common_1.BadRequestException('Chỉ có thể xóa dữ liệu ảo ở trạng thái Nháp hoặc Đang mở đăng ký.');
        }
        const isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền xóa dữ liệu ảo');
        }
        return this.tournamentsRepository.clearMockParticipants(tournamentId, divisionId);
    }
    async deleteMockParticipant(tournamentId, participantId, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        const isLite = tournament.tournamentConfig?.isLite === true;
        if (tournament.status !== 'DRAFT' &&
            !isLite &&
            tournament.status !== 'REGISTRATION_OPEN' &&
            tournament.status !== 'UPCOMING') {
            throw new common_1.BadRequestException('Chỉ có thể xoá dữ liệu giả lập ở trạng thái Nháp hoặc Đang mở đăng ký.');
        }
        const isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền xóa người tham gia ảo');
        }
        const result = await this.tournamentsRepository.deleteMockParticipant(tournamentId, participantId);
        this.broadcastRegistrationChanged(tournamentId, {
            participantId,
            action: 'PARTICIPANT_REMOVED',
        });
        return result;
    }
    async createPlayoffMatch(tournamentId, dto, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        let isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized && tournament.communityId) {
            const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
            if (member && (member.role === 'OWNER' || member.role === 'MODERATOR'))
                isAuthorized = true;
        }
        if (!isAuthorized)
            throw new common_1.ForbiddenException('Bạn không có quyền tạo trận playoff');
        const stage = await this.tournamentsRepository.findStageById(dto.stageId);
        if (!stage || stage.tournamentId !== tournamentId)
            throw new common_1.NotFoundException('Vòng đấu không tồn tại');
        if (stage.type !== 'ROUND_ROBIN')
            throw new common_1.BadRequestException('Vòng loại trực tiếp chỉ khả dụng cho vòng đấu vòng tròn');
        const { maxRound, maxOrder } = await this.tournamentsRepository.getMaxRoundAndMatchOrder(dto.stageId);
        const firstGroup = await this.tournamentsRepository.getGroupByStageId(dto.stageId);
        if (!firstGroup)
            throw new common_1.BadRequestException('No group found in this stage');
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
    async finalizeStage(tournamentId, stageId, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        let isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized && tournament.communityId) {
            const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
            if (member && (member.role === 'OWNER' || member.role === 'MODERATOR'))
                isAuthorized = true;
        }
        if (!isAuthorized)
            throw new common_1.ForbiddenException('Bạn không có quyền hoàn tất vòng đấu');
        const stage = await this.tournamentsRepository.findStageById(stageId);
        if (!stage || stage.tournamentId !== tournamentId)
            throw new common_1.NotFoundException('Vòng đấu không tồn tại');
        await this.tournamentsRepository.cancelScheduledMatchesInStage(stageId);
        return { message: 'Đã hoàn tất vòng đấu thành công' };
    }
    async advanceStandings(tournamentId, divisionId, stageId, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        let isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized && tournament.communityId) {
            const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
            if (member && (member.role === 'OWNER' || member.role === 'MODERATOR'))
                isAuthorized = true;
        }
        if (!isAuthorized)
            throw new common_1.ForbiddenException('Bạn không có quyền cập nhật tiến trình vòng đấu');
        return this.bracketGeneratorService.advanceStandings(tournamentId, divisionId, stageId);
    }
    async updateParticipantStatus(tournamentId, participantId, status, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        if (tournament.status !== 'REGISTRATION_OPEN') {
            throw new common_1.BadRequestException('Giải đấu đã chốt danh sách, không thể duyệt hoặc từ chối vận động viên.');
        }
        const isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền cập nhật trạng thái');
        }
        if (status !== 'COMPLETE' && status !== 'REJECTED') {
            throw new common_1.BadRequestException('Chỉ hỗ trợ duyệt hoặc từ chối hồ sơ đăng ký.');
        }
        const participant = await this.tournamentsRepository.findParticipantById(participantId);
        if (!participant || participant.tournamentId !== tournamentId) {
            throw new common_1.NotFoundException('Người tham gia không tồn tại');
        }
        if (participant.teamStatus !== 'PENDING_APPROVAL') {
            throw new common_1.BadRequestException('Chỉ hồ sơ đang chờ duyệt mới được phép duyệt hoặc từ chối.');
        }
        if (status === 'COMPLETE') {
            const division = participant.tournamentDivisionId
                ? await this.tournamentsRepository.findDivisionById(participant.tournamentDivisionId)
                : null;
            const entryFeeAmount = Number(division?.entryFee ?? tournament.entryFee ?? '0');
            if (entryFeeAmount > 0 && !participant.isPaid) {
                throw new common_1.BadRequestException('Hồ sơ có lệ phí chưa thanh toán, không thể duyệt hoàn tất.');
            }
        }
        const updated = await this.tournamentsRepository.updateParticipantStatus(participantId, status);
        if (!updated) {
            throw new common_1.NotFoundException('Người tham gia không tồn tại');
        }
        try {
            const rosters = await this.tournamentsRepository.getParticipantRosters(participantId);
            for (const roster of rosters) {
                if (status === 'COMPLETE') {
                    await this.notificationsService.sendNotification((0, notification_builder_1.buildParticipantRegistrationSuccessNotification)({
                        receiverId: roster.userId,
                        tournamentId: tournament.id,
                        tournamentName: tournament.name,
                        divisionId: updated.tournamentDivisionId,
                    }));
                }
                else if (status === 'REJECTED') {
                    await this.notificationsService.sendNotification((0, notification_builder_1.buildParticipantRegistrationRejectedNotification)({
                        receiverId: roster.userId,
                        tournamentId: tournament.id,
                        tournamentName: tournament.name,
                        divisionId: updated.tournamentDivisionId,
                    }));
                }
            }
        }
        catch (err) {
            console.error('Failed to send notification for updateParticipantStatus:', err);
        }
        this.broadcastRegistrationChanged(tournamentId, {
            participantId: updated.id,
            divisionId: updated.tournamentDivisionId,
            action: status === 'COMPLETE' ? 'APPROVED' : 'REJECTED',
        });
        return updated;
    }
    async lockParticipantRoster(tournamentId, participantId, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        if (!['REGISTRATION_CLOSED', 'UPCOMING', 'IN_PROGRESS', 'ONGOING'].includes(tournament.status)) {
            throw new common_1.BadRequestException('Chỉ được khóa roster sau khi đóng đăng ký.');
        }
        if (!(await this.isManager(tournament, userId, systemRoles))) {
            throw new common_1.ForbiddenException('Bạn không có quyền khóa roster.');
        }
        const participant = await this.tournamentsRepository.findParticipantById(participantId);
        if (!participant || participant.tournamentId !== tournamentId) {
            throw new common_1.NotFoundException('Người tham gia không tồn tại');
        }
        const updated = await this.tournamentsRepository.lockParticipantRoster(participantId, userId);
        this.broadcastRegistrationChanged(tournamentId, {
            participantId,
            divisionId: participant.tournamentDivisionId,
            action: 'ROSTER_LOCKED',
        });
        return updated;
    }
    async unlockParticipantRoster(tournamentId, participantId, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        if (!['REGISTRATION_CLOSED', 'UPCOMING'].includes(tournament.status)) {
            throw new common_1.BadRequestException('Chỉ được mở khóa roster trước khi giải bắt đầu.');
        }
        if (!(await this.isManager(tournament, userId, systemRoles))) {
            throw new common_1.ForbiddenException('Bạn không có quyền mở khóa roster.');
        }
        const participant = await this.tournamentsRepository.findParticipantById(participantId);
        if (!participant || participant.tournamentId !== tournamentId) {
            throw new common_1.NotFoundException('Người tham gia không tồn tại');
        }
        if (!participant.footballTeamId) {
            throw new common_1.BadRequestException('Chỉ đăng ký đội bóng mới có roster để mở khóa.');
        }
        const updated = await this.tournamentsRepository.unlockParticipantRoster(participantId, userId);
        this.broadcastRegistrationChanged(tournamentId, {
            participantId,
            divisionId: participant.tournamentDivisionId,
            action: 'ROSTER_UNLOCKED',
        });
        return updated;
    }
    async getFootballRosterStatus(tournamentId, participantId, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        const participant = await this.tournamentsRepository.findParticipantById(participantId);
        if (!participant ||
            participant.tournamentId !== tournamentId ||
            !participant.footballTeamId) {
            throw new common_1.NotFoundException('Đăng ký đội bóng không tồn tại.');
        }
        const result = await this.tournamentsRepository.findFootballEntryForParticipant(participantId);
        if (!result?.entry)
            return { entry: null, roster: [] };
        const roster = await this.tournamentsRepository.getFootballEntryRoster(result.entry.id);
        const current = roster.find((member) => member.userId === userId);
        const canManage = await this.isManager(tournament, userId, systemRoles);
        const teamAccess = participant.footballTeamId
            ? await this.tournamentsRepository.findFootballTeamForRegistration(participant.footballTeamId, userId)
            : null;
        const canManageTeam = Boolean(teamAccess && ['CAPTAIN', 'MANAGER'].includes(teamAccess.membership.role));
        if (!current && !canManage && !canManageTeam) {
            throw new common_1.ForbiddenException('Bạn không có quyền xem roster của đội này.');
        }
        return {
            entry: result.entry,
            roster,
            currentMember: current ?? null,
        };
    }
    async respondFootballRoster(tournamentId, participantId, userId, action) {
        if (action !== 'CONFIRM' && action !== 'DECLINE') {
            throw new common_1.BadRequestException('Hành động xác nhận roster không hợp lệ.');
        }
        const participant = await this.tournamentsRepository.findParticipantById(participantId);
        if (!participant ||
            participant.tournamentId !== tournamentId ||
            !participant.footballTeamId) {
            throw new common_1.NotFoundException('Đăng ký đội bóng không tồn tại.');
        }
        const result = await this.tournamentsRepository.findFootballEntryForParticipant(participantId);
        if (!result?.entry)
            throw new common_1.NotFoundException('Roster đội bóng chưa được tạo.');
        if (result.entry.status === 'LOCKED') {
            throw new common_1.BadRequestException('Roster đã khóa, không thể thay đổi xác nhận.');
        }
        const updated = await this.tournamentsRepository.respondFootballRoster(result.entry.id, userId, action);
        this.broadcastRegistrationChanged(tournamentId, {
            participantId,
            divisionId: participant.tournamentDivisionId,
            action: 'ROSTER_UPDATED',
        });
        return updated;
    }
    async updateFootballRoster(tournamentId, participantId, dto, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        if (!['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'UPCOMING'].includes(tournament.status)) {
            throw new common_1.BadRequestException('Chỉ được cập nhật roster trước khi giải bắt đầu.');
        }
        const participant = await this.tournamentsRepository.findParticipantById(participantId);
        if (!participant ||
            participant.tournamentId !== tournamentId ||
            !participant.footballTeamId) {
            throw new common_1.NotFoundException('Đăng ký đội bóng không tồn tại.');
        }
        const entryResult = await this.tournamentsRepository.findFootballEntryForParticipant(participantId);
        if (!entryResult?.entry)
            throw new common_1.NotFoundException('Roster đội bóng chưa được tạo.');
        if (entryResult.entry.status === 'LOCKED' || participant.rosterLockedAt) {
            throw new common_1.BadRequestException('Roster đã khóa, không thể thay đổi.');
        }
        const manager = await this.isManager(tournament, userId, systemRoles);
        if (!manager) {
            const team = await this.tournamentsRepository.findFootballTeamForRegistration(participant.footballTeamId, userId);
            if (!team || !['CAPTAIN', 'MANAGER'].includes(team.membership.role)) {
                throw new common_1.ForbiddenException('Chỉ đội trưởng, quản lý đội hoặc ban tổ chức mới được sửa roster.');
            }
        }
        const updated = await this.tournamentsRepository.updateFootballRoster(participantId, dto.memberIds ?? [], dto.reserveMemberIds ?? [], userId);
        this.broadcastRegistrationChanged(tournamentId, {
            participantId,
            divisionId: participant.tournamentDivisionId,
            action: 'ROSTER_UPDATED',
        });
        return updated;
    }
    async assignReservedSlot(tournamentId, userEmailOrPhone, teamName, userId, systemRoles = [], partnerEmailOrPhone, divisionId) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        const isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền cấp đặc cách');
        }
        if (tournament.status !== 'REGISTRATION_OPEN') {
            throw new common_1.BadRequestException('Giải đấu đã chốt danh sách, không thể gán slot giữ chỗ.');
        }
        const foundUser = await this.tournamentsRepository.findUserByEmailOrPhone(userEmailOrPhone);
        if (!foundUser) {
            throw new common_1.NotFoundException('Không tìm thấy tài khoản Sporto cho người chơi thứ nhất');
        }
        let foundPartnerId = undefined;
        if (partnerEmailOrPhone) {
            const foundPartner = await this.tournamentsRepository.findUserByEmailOrPhone(partnerEmailOrPhone);
            if (!foundPartner) {
                throw new common_1.NotFoundException('Không tìm thấy tài khoản Sporto cho đồng đội (người thứ 2)');
            }
            if (foundPartner.id === foundUser.id) {
                throw new common_1.BadRequestException('Tài khoản đồng đội phải khác tài khoản người chơi thứ nhất');
            }
            foundPartnerId = foundPartner.id;
        }
        const assignedParticipant = await this.tournamentsRepository.assignReservedSlot(tournamentId, foundUser.id, teamName, foundPartnerId, divisionId);
        try {
            await this.notificationsService.sendNotification((0, notification_builder_1.buildReservedSlotAssignedNotification)({
                receiverId: foundUser.id,
                tournamentId,
                tournamentName: tournament.name,
                divisionId: assignedParticipant.tournamentDivisionId,
            }));
            if (foundPartnerId) {
                await this.notificationsService.sendNotification((0, notification_builder_1.buildReservedSlotAssignedNotification)({
                    receiverId: foundPartnerId,
                    tournamentId,
                    tournamentName: tournament.name,
                    divisionId: assignedParticipant.tournamentDivisionId,
                }));
            }
        }
        catch (err) {
            console.error('Failed to send reserved slot notification:', err);
        }
        return assignedParticipant;
    }
    async kickParticipant(tournamentId, participantId, userId, reason, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        let isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized && tournament.communityId) {
            const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
            if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
                isAuthorized = true;
            }
        }
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền loại người tham gia này');
        }
        const rosters = await this.tournamentsRepository.getParticipantRosters(participantId);
        const result = await this.tournamentsRepository.kickParticipant(tournamentId, participantId, userId);
        try {
            for (const roster of rosters) {
                await this.notificationsService.sendNotification((0, notification_builder_1.buildParticipantKickedNotification)({
                    receiverId: roster.userId,
                    tournamentId: tournament.id,
                    tournamentName: tournament.name,
                    reason,
                }));
            }
        }
        catch (err) {
            console.error('Failed to send notification for kickParticipant:', err);
        }
        this.broadcastRegistrationChanged(tournamentId, {
            participantId,
            action: 'PARTICIPANT_REMOVED',
        });
        return result;
    }
    async getOpsAuditLogs(tournamentId, userId, systemRoles = [], divisionId) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        let isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized && tournament.communityId) {
            const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
            if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
                isAuthorized = true;
            }
        }
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền xem nhật ký vận hành');
        }
        return this.tournamentsRepository.findOpsAuditLogs(tournamentId, divisionId);
    }
    async cancelTournament(id, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        let isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized && tournament.communityId) {
            const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
            if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
                isAuthorized = true;
            }
        }
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền hủy giải đấu này');
        }
        if (tournament.status === 'CANCELLED' ||
            tournament.status === 'COMPLETED') {
            throw new common_1.BadRequestException('Giải đấu đã bị hủy hoặc đã hoàn thành, không thể hủy.');
        }
        const updatedTournament = await this.tournamentsRepository.cancelTournament(id);
        try {
            const participants = await this.tournamentsRepository.findParticipants(id, tournament.categoryId);
            const notifications = [];
            for (const participant of participants) {
                for (const member of participant.members || []) {
                    notifications.push(this.notificationsService.sendNotification((0, notification_builder_1.buildTournamentCancelledNotification)({
                        receiverId: member.userId,
                        tournamentId: id,
                        tournamentName: tournament.name,
                        divisionId: participant.tournamentDivisionId,
                    })));
                }
            }
            await this.sendNotificationBatch(notifications);
        }
        catch (err) {
            console.error('Failed to send cancelTournament notifications:', err);
        }
        return updatedTournament;
    }
    async getFeesConfig() {
        return this.tournamentsRepository.getFeesConfig();
    }
    async getPublishFee(tournamentType, isRanked) {
        const fees = await this.getFeesConfig();
        if (tournamentType === 'CLUB')
            return fees.feeClub;
        return isRanked ? fees.feePublicRanked : fees.feePublicUnranked;
    }
    async handleRegistrationsTimeout() {
        try {
            const expiredList = await this.tournamentsRepository.processPendingRegistrationsTimeout();
            for (const item of expiredList) {
                await this.notificationsService.sendNotification((0, notification_builder_1.buildRegistrationTimeoutNotification)({
                    receiverId: item.leaderId,
                    tournamentId: item.tournamentId,
                    tournamentName: item.tournamentName,
                    divisionId: item.divisionId,
                }));
            }
        }
        catch (err) {
            console.error('Error handling registrations timeout cron:', err);
        }
    }
    async findStaffByTournament(id) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        return this.tournamentsRepository.findStaffByTournament(id);
    }
    async addStaffMember(id, email, role, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        const isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized)
            throw new common_1.ForbiddenException('Bạn không có quyền thêm thành viên ban tổ chức');
        const userToInvite = await this.tournamentsRepository.findUserByEmail(email);
        if (!userToInvite) {
            throw new common_1.NotFoundException(`Email "${email}" chưa đăng ký tài khoản trên hệ thống. Người được mời cần có tài khoản trước khi trở thành ${role === 'REFEREE' ? 'trọng tài' : role === 'SPECTATOR' ? 'khách xem' : 'ban tổ chức'}.`);
        }
        const record = await this.tournamentsRepository.addStaffMember(id, userToInvite.id, role, userId);
        const roleLabel = role === 'REFEREE'
            ? 'trọng tài'
            : role === 'SPECTATOR'
                ? 'khách xem'
                : 'đồng tổ chức';
        try {
            await this.notificationsService.sendNotification((0, notification_builder_1.buildStaffAddedNotification)({
                tournamentId: id,
                tournamentName: tournament.name,
                receiverId: userToInvite.id,
                roleLabel,
            }));
        }
        catch (error) {
            console.error('Failed to send staff-add notification:', error);
        }
        return record;
    }
    async removeStaffMember(id, staffUserId, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        const isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized)
            throw new common_1.ForbiddenException('Bạn không có quyền xóa thành viên ban tổ chức');
        return this.tournamentsRepository.removeStaffMember(id, staffUserId);
    }
    async findReferees(id, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        const isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền xem danh sách trọng tài của giải đấu này');
        }
        return this.tournamentsRepository.findReferees(id);
    }
    async followTournament(id, userId) {
        return this.tournamentsRepository.followTournament(id, userId);
    }
    async unfollowTournament(id, userId) {
        await this.tournamentsRepository.unfollowTournament(id, userId);
    }
    async getFollowerUserIds(tournamentId) {
        return this.tournamentsRepository.getFollowerUserIds(tournamentId);
    }
    async getFollowedTournaments(userId) {
        const rows = await this.tournamentsRepository.getFollowedTournaments(userId);
        return rows.map((row) => this.mapTournamentFormat(row.tournaments));
    }
    async updateSeeds(id, seeds, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        const isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền cập nhật hạt giống');
        }
        if (tournament.status === 'IN_PROGRESS' ||
            tournament.status === 'COMPLETED') {
            throw new common_1.BadRequestException('Không thể cập nhật hạt giống cho giải đang diễn ra hoặc đã kết thúc');
        }
        return this.tournamentsRepository.updateSeeds(id, seeds);
    }
    async createDivision(tournamentId, createDivisionDto, userId, systemRoles = []) {
        try {
            const tournament = await this.tournamentsRepository.findById(tournamentId);
            if (!tournament) {
                throw new common_1.NotFoundException('Giải đấu không tồn tại');
            }
            if (!(await this.isManager(tournament, userId, systemRoles))) {
                throw new common_1.ForbiddenException('Bạn không có quyền tạo bảng thi đấu cho giải này');
            }
            const divisionEntryFee = createDivisionDto.entryFee ??
                (tournament.entryFee ? Number(tournament.entryFee) : 0);
            await this.assertEntryFeeAllowed(divisionEntryFee);
            const category = await this.tournamentsRepository.findCategory(tournament.categoryId);
            if (!category) {
                throw new common_1.NotFoundException('Hạng đấu không tồn tại');
            }
            if (tournament.isRegistrationLocked || ['REGISTRATION_CLOSED', 'UPCOMING', 'IN_PROGRESS', 'ONGOING', 'COMPLETED', 'CANCELLED'].includes(tournament.status)) {
                throw new common_1.BadRequestException('Không thể thêm hình thức sau khi danh sách hoặc giải đấu đã được chốt.');
            }
            if (tournament.status === 'REGISTRATION_OPEN') {
                const participants = await this.tournamentsRepository.findParticipants(tournamentId, tournament.categoryId);
                if (participants.length > 0) {
                    throw new common_1.BadRequestException('Không thể thêm hình thức sau khi đã có người đăng ký.');
                }
            }
            const categoryConfig = category.categoryConfig;
            this.validateMatchTypeAgainstCategory(categoryConfig, createDivisionDto.matchType, 'division');
            this.validateMatchTypeGenderRestriction(createDivisionDto.matchType, createDivisionDto.genderRestriction, 'division');
            if (createDivisionDto.roundConfig) {
                (0, validate_sport_rules_config_1.validateSportRuleConfig)(createDivisionDto.roundConfig, {
                    expectedKind: (0, validate_sport_rules_config_1.inferExpectedSportRuleKind)({
                        categoryConfig: category.categoryConfig,
                        categoryName: category.name,
                        categorySlug: category.slug,
                    }),
                    allowedKinds: (0, validate_sport_rules_config_1.inferAllowedSportRuleKinds)({
                        categoryConfig: category.categoryConfig,
                        categoryName: category.name,
                        categorySlug: category.slug,
                    }),
                    sourceLabel: 'roundConfig',
                    allowRoundStructure: true,
                    allowRoundMetadata: true,
                });
            }
            return await this.tournamentsRepository.createDivision({
                name: createDivisionDto.name.trim(),
                matchType: createDivisionDto.matchType,
                genderRestriction: createDivisionDto.genderRestriction,
                maxParticipants: createDivisionDto.maxParticipants ??
                    tournament.maxParticipants ??
                    undefined,
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
            }, userId);
        }
        catch (error) {
            console.error(`Failed to create division for tournament ${tournamentId}:`, error);
            throw error;
        }
    }
    async getDivisionsForTournament(tournamentId) {
        try {
            const tournament = await this.tournamentsRepository.findById(tournamentId);
            if (!tournament) {
                throw new common_1.NotFoundException('Giải đấu không tồn tại');
            }
            return await this.tournamentsRepository.getDivisionsByTournament(tournamentId);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException ||
                error instanceof common_1.ForbiddenException ||
                error instanceof common_1.BadRequestException) {
                throw error;
            }
            console.error(`Failed to get divisions for tournament ${tournamentId}:`, error);
            throw error;
        }
    }
    async updateDivision(divisionId, updateDivisionDto, userId, systemRoles = []) {
        const isSystemAuthorized = systemRoles.includes('ADMIN') || systemRoles.includes('ORGANIZER');
        if (!isSystemAuthorized && !userId) {
            throw new common_1.ForbiddenException('Bạn không có quyền cập nhật bảng thi đấu này');
        }
        const division = await this.tournamentsRepository.findDivisionById(divisionId);
        if (!division) {
            throw new common_1.NotFoundException('Bảng đấu không tồn tại');
        }
        const tournament = await this.tournamentsRepository.findById(division.tournamentId);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        if (!(await this.isManager(tournament, userId, systemRoles))) {
            throw new common_1.ForbiddenException('Bạn không có quyền cập nhật bảng thi đấu này');
        }
        await this.assertEntryFeeAllowed(updateDivisionDto.entryFee);
        const category = await this.tournamentsRepository.findCategory(tournament.categoryId);
        if (!category) {
            throw new common_1.NotFoundException('Hạng đấu không tồn tại');
        }
        const nextMatchType = updateDivisionDto.matchType ?? division.matchType;
        let nextGenderRestriction = updateDivisionDto.genderRestriction !== undefined
            ? updateDivisionDto.genderRestriction
            : division.genderRestriction;
        if (nextMatchType === 'MIXED_DOUBLES' &&
            nextGenderRestriction !== 'MIXED') {
            nextGenderRestriction = create_division_dto_1.GenderRestriction.MIXED;
            updateDivisionDto.genderRestriction = create_division_dto_1.GenderRestriction.MIXED;
        }
        else if ((nextMatchType === 'SINGLES' || nextMatchType === 'DOUBLES') &&
            nextGenderRestriction === 'MIXED') {
            nextGenderRestriction = null;
            updateDivisionDto.genderRestriction = null;
        }
        const categoryConfig = category.categoryConfig;
        this.validateMatchTypeAgainstCategory(categoryConfig, nextMatchType, 'division');
        this.validateMatchTypeGenderRestriction(nextMatchType, nextGenderRestriction, 'division');
        if (updateDivisionDto.roundConfig) {
            (0, validate_sport_rules_config_1.validateSportRuleConfig)(updateDivisionDto.roundConfig, {
                expectedKind: (0, validate_sport_rules_config_1.inferExpectedSportRuleKind)({
                    categoryConfig: category.categoryConfig,
                    categoryName: category.name,
                    categorySlug: category.slug,
                }),
                allowedKinds: (0, validate_sport_rules_config_1.inferAllowedSportRuleKinds)({
                    categoryConfig: category.categoryConfig,
                    categoryName: category.name,
                    categorySlug: category.slug,
                }),
                sourceLabel: 'roundConfig',
                allowRoundStructure: true,
                allowRoundMetadata: true,
            });
        }
        if (updateDivisionDto.name !== undefined) {
            updateDivisionDto.name = updateDivisionDto.name.trim();
            if (!updateDivisionDto.name) {
                throw new common_1.BadRequestException('Tên nội dung thi đấu không được để trống');
            }
        }
        return this.tournamentsRepository.updateDivision(divisionId, updateDivisionDto, userId);
    }
    async updateDivisionConfig(tournamentId, divisionId, updateDivisionDto, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        const canManage = await this.isManager(tournament, userId, systemRoles);
        if (!canManage) {
            throw new common_1.ForbiddenException('Bạn không có quyền cập nhật cấu hình hình thức này');
        }
        await this.assertEntryFeeAllowed(updateDivisionDto.entryFee);
        const currentDivision = await this.tournamentsRepository.findDivisionById(divisionId);
        if (!currentDivision) {
            throw new common_1.NotFoundException('Bảng đấu không tồn tại');
        }
        if (updateDivisionDto.matchType &&
            updateDivisionDto.matchType !== currentDivision.matchType &&
            (tournament.status === 'REGISTRATION_OPEN' ||
                tournament.status === 'REGISTRATION_CLOSED')) {
            throw new common_1.BadRequestException('Không thể thay đổi hình thức thi đấu khi giải đấu đang mở đăng ký');
        }
        const category = await this.tournamentsRepository.findCategory(tournament.categoryId);
        if (!category) {
            throw new common_1.NotFoundException('Hạng đấu không tồn tại');
        }
        const nextMatchType = updateDivisionDto.matchType ?? currentDivision.matchType;
        let nextGenderRestriction = updateDivisionDto.genderRestriction !== undefined
            ? updateDivisionDto.genderRestriction
            : currentDivision.genderRestriction;
        if (nextMatchType === 'MIXED_DOUBLES' &&
            nextGenderRestriction !== 'MIXED') {
            nextGenderRestriction = create_division_dto_1.GenderRestriction.MIXED;
            updateDivisionDto.genderRestriction = create_division_dto_1.GenderRestriction.MIXED;
        }
        else if ((nextMatchType === 'SINGLES' || nextMatchType === 'DOUBLES') &&
            nextGenderRestriction === 'MIXED') {
            nextGenderRestriction = null;
            updateDivisionDto.genderRestriction = null;
        }
        const categoryConfig = category.categoryConfig;
        this.validateMatchTypeAgainstCategory(categoryConfig, nextMatchType, 'division');
        this.validateMatchTypeGenderRestriction(nextMatchType, nextGenderRestriction, 'division');
        if (updateDivisionDto.roundConfig) {
            (0, validate_sport_rules_config_1.validateSportRuleConfig)(updateDivisionDto.roundConfig, {
                expectedKind: (0, validate_sport_rules_config_1.inferExpectedSportRuleKind)({
                    categoryConfig: category.categoryConfig,
                    categoryName: category.name,
                    categorySlug: category.slug,
                }),
                allowedKinds: (0, validate_sport_rules_config_1.inferAllowedSportRuleKinds)({
                    categoryConfig: category.categoryConfig,
                    categoryName: category.name,
                    categorySlug: category.slug,
                }),
                sourceLabel: 'roundConfig',
                allowRoundStructure: true,
                allowRoundMetadata: true,
            });
        }
        if (!(await this.isManager(tournament, userId, systemRoles))) {
            throw new common_1.ForbiddenException('Bạn không có quyền cập nhật cấu hình hình thức này');
        }
        return this.tournamentsRepository.updateDivisionConfig(divisionId, updateDivisionDto, userId);
    }
    async deleteDivision(divisionId, userId, systemRoles = []) {
        const isSystemAuthorized = systemRoles.includes('ADMIN') || systemRoles.includes('ORGANIZER');
        if (!isSystemAuthorized && !userId) {
            throw new common_1.ForbiddenException('Bạn không có quyền xóa bảng thi đấu này');
        }
        const division = await this.tournamentsRepository.findDivisionById(divisionId);
        if (!division)
            throw new common_1.NotFoundException('Bảng thi đấu không tồn tại');
        const tournament = await this.tournamentsRepository.findById(division.tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        if (!(await this.isManager(tournament, userId, systemRoles))) {
            throw new common_1.ForbiddenException('Bạn không có quyền xóa bảng thi đấu này');
        }
        return this.tournamentsRepository.deleteDivision(divisionId, userId);
    }
    async getParticipantsByDivision(tournamentId, divisionId) {
        const divisions = await this.tournamentsRepository.getDivisionsByTournament(tournamentId);
        const exists = divisions.some((division) => division.id === divisionId);
        if (!exists) {
            throw new common_1.NotFoundException('Không tìm thấy bảng đấu cho giải đấu này');
        }
        return this.tournamentsRepository.getParticipantsByDivision(divisionId);
    }
    async updateParentAggregation(parentId) {
        try {
            return await this.tournamentsRepository.getParentWithAggregation(parentId);
        }
        catch (error) {
            console.error(`Failed to update parent aggregation for ${parentId}:`, error);
            throw error;
        }
    }
    async getGroupStandings(tournamentId, divisionId) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        return this.tournamentsRepository.findGroupStandings(tournamentId, divisionId);
    }
    async getTournamentResults(tournamentId, divisionId) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
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
            .filter((match) => match.status === 'COMPLETED' &&
            ['GRAND_FINALS', 'FINAL', 'MAIN'].includes(match.bracketBranch))
            .sort((a, b) => b.roundNumber - a.roundNumber || b.matchOrder - a.matchOrder)[0];
        const participant = (id, name) => id ? { participantId: id, teamName: name || 'Chưa xác định' } : null;
        const awards = final
            ? [
                {
                    rank: 1,
                    shared: false,
                    participant: participant(final.winnerId, final.winnerId === final.participant1Id
                        ? final.participant1Name
                        : final.participant2Name),
                },
                {
                    rank: 2,
                    shared: false,
                    participant: participant(final.winnerId === final.participant1Id
                        ? final.participant2Id
                        : final.participant1Id, final.winnerId === final.participant1Id
                        ? final.participant2Name
                        : final.participant1Name),
                },
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
    async getTournamentResultsV2(tournamentId, divisionId) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        const matches = await this.tournamentsRepository.findTournamentResultMatches(tournamentId, divisionId);
        const standings = await this.tournamentsRepository.findGroupStandings(tournamentId, divisionId);
        const standingRows = Array.isArray(standings)
            ? standings
            : Array.isArray(standings?.standings)
                ? standings.standings
                : [];
        const participant = (id, name) => id ? { participantId: id, teamName: name || 'Chua xac dinh' } : null;
        const completed = tournament.status === 'COMPLETED';
        const knockout = matches.filter((match) => match.stageType !== 'ROUND_ROBIN' &&
            match.status === 'COMPLETED' &&
            match.winnerId);
        const finalCandidates = knockout.filter((match) => {
            const branch = (match.bracketBranch || '').toUpperCase();
            const stageName = (match.stageName || '').toLowerCase();
            return (branch === 'GRAND_FINALS' ||
                branch === 'FINAL' ||
                stageName.includes('chung kết') ||
                stageName.includes('chung ket') ||
                stageName.includes('grand final'));
        });
        const final = [
            ...(finalCandidates.length > 0
                ? finalCandidates
                : knockout.filter((match) => {
                    const branch = (match.bracketBranch || '').toUpperCase();
                    return branch === 'MAIN' || branch === '';
                })),
        ].sort((a, b) => b.roundNumber - a.roundNumber || b.matchOrder - a.matchOrder)[0];
        const loserOf = (match) => match?.winnerId === match.participant1Id
            ? participant(match.participant2Id, match.participant2Name)
            : participant(match?.participant1Id ?? null, match?.participant1Name ?? null);
        const awards = [];
        if (final) {
            awards.push({
                rank: 1,
                shared: false,
                participant: participant(final.winnerId, final.winnerId === final.participant1Id
                    ? final.participant1Name
                    : final.participant2Name),
            });
            awards.push({ rank: 2, shared: false, participant: loserOf(final) });
            const config = (tournament.tournamentConfig ?? {});
            const semifinalLosers = knockout
                .filter((match) => match.roundNumber === final.roundNumber - 1)
                .map(loserOf)
                .filter((item) => item !== null);
            const thirdPlace = config.thirdPlaceMatch
                ? knockout.find((match) => match.roundNumber === final.roundNumber &&
                    match.id !== final.id &&
                    [match.participant1Id, match.participant2Id].some((id) => semifinalLosers.some((loser) => loser.participantId === id)))
                : undefined;
            if (thirdPlace) {
                awards.push({
                    rank: 3,
                    shared: false,
                    participant: participant(thirdPlace.winnerId, thirdPlace.winnerId === thirdPlace.participant1Id
                        ? thirdPlace.participant1Name
                        : thirdPlace.participant2Name),
                });
            }
            else {
                for (const loser of semifinalLosers)
                    awards.push({ rank: 3, shared: true, participant: loser });
            }
        }
        else if (standingRows.length) {
            const groups = new Map();
            for (const row of standingRows)
                groups.set(row.groupId, [...(groups.get(row.groupId) ?? []), row]);
            for (const rows of groups.values())
                rows
                    .slice(0, 3)
                    .forEach((row, index) => awards.push({
                    rank: index + 1,
                    shared: false,
                    participant: participant(row.participantId, row.teamName),
                }));
        }
        return {
            tournamentId,
            status: tournament.status,
            finalized: completed &&
                awards.length > 0 &&
                awards.every((award) => award.participant !== null),
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
    async addReferee(id, email, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(id);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        const isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền mời trọng tài cho giải đấu này');
        }
        const userToInvite = await this.tournamentsRepository.findUserByEmail(email);
        if (!userToInvite) {
            throw new common_1.NotFoundException('Không tìm thấy tài khoản hệ thống với email đã nhập');
        }
        const existingReferee = await this.tournamentsRepository.findRefereeByTournamentAndUser(id, userToInvite.id);
        if (existingReferee?.status === 'INVITED') {
            throw new common_1.BadRequestException('Lời mời trọng tài này vẫn đang chờ người dùng phản hồi.');
        }
        if (existingReferee?.status === 'ACCEPTED') {
            throw new common_1.BadRequestException('Người dùng này đã là trọng tài đã xác nhận của giải.');
        }
        const invite = await this.tournamentsRepository.addReferee(id, userToInvite.id, userId);
        try {
            await this.notificationsService.sendNotification((0, notification_builder_1.buildRefereeInviteNotification)({
                tournamentId: id,
                tournamentName: tournament.name,
                receiverId: userToInvite.id,
                refereeId: invite.id,
            }));
        }
        catch (error) {
            console.error('Failed to send referee invite notification:', error);
        }
        return invite;
    }
    async respondToRefereeInvite(tournamentId, refereeId, userId, action) {
        const referee = await this.tournamentsRepository.findRefereeById(refereeId);
        if (!referee)
            throw new common_1.NotFoundException('Không tìm thấy lời mời trọng tài');
        if (referee.userId !== userId)
            throw new common_1.ForbiddenException('Bạn không phải người được mời');
        if (referee.status !== 'INVITED')
            throw new common_1.BadRequestException('Lời mời đã được phản hồi trước đó');
        const status = action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
        const [tournament, refereeUser] = await Promise.all([
            this.tournamentsRepository.findById(tournamentId),
            this.tournamentsRepository.findUserBasicById(userId),
        ]);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        const updatedReferee = await this.tournamentsRepository.updateRefereeStatus(refereeId, status);
        const organizerReceiverId = referee.assignedBy || tournament.createdBy;
        const refereeName = refereeUser?.fullName || refereeUser?.email || 'Trọng tài';
        if (organizerReceiverId) {
            try {
                await this.notificationsService.sendNotification(action === 'ACCEPT'
                    ? (0, notification_builder_1.buildRefereeInviteAcceptedNotification)({
                        tournamentId,
                        tournamentName: tournament.name,
                        receiverId: organizerReceiverId,
                        refereeName,
                    })
                    : (0, notification_builder_1.buildRefereeInviteDeclinedNotification)({
                        tournamentId,
                        tournamentName: tournament.name,
                        receiverId: organizerReceiverId,
                        refereeName,
                    }));
            }
            catch (error) {
                console.error('Failed to send referee response notification:', error);
            }
        }
        return updatedReferee;
    }
    async revokeRefereeInvite(tournamentId, refereeId, userId, systemRoles = []) {
        const [tournament, referee] = await Promise.all([
            this.tournamentsRepository.findById(tournamentId),
            this.tournamentsRepository.findRefereeById(refereeId),
        ]);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        if (!referee || referee.tournamentId !== tournamentId) {
            throw new common_1.NotFoundException('Không tìm thấy lời mời trọng tài');
        }
        const isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền thu hồi lời mời trọng tài của giải đấu này');
        }
        if (referee.status !== 'INVITED') {
            throw new common_1.BadRequestException('Chỉ có thể thu hồi lời mời đang chờ phản hồi.');
        }
        const removedInvite = await this.tournamentsRepository.removeRefereeInvite(refereeId);
        await this.notificationsService.deleteByReceiverTypeAndRedirect(referee.userId, 'REFEREE_INVITED', `/notifications?action=referee-invite&tournamentId=${tournamentId}&refereeId=${refereeId}`);
        try {
            await this.notificationsService.sendNotification((0, notification_builder_1.buildRefereeInviteRevokedNotification)({
                tournamentId,
                tournamentName: tournament.name,
                receiverId: referee.userId,
            }));
        }
        catch (error) {
            console.error('Failed to send referee revoked notification:', error);
        }
        return removedInvite;
    }
    async checkLiteAuthorization(tournamentId, userId, systemRoles = []) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        const config = (tournament.tournamentConfig || {});
        if (config.isLite !== true && config.mode !== 'LITE') {
            throw new common_1.BadRequestException('Thao tác này chỉ hỗ trợ giải đấu Lite.');
        }
        let isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized && tournament.communityId) {
            const member = await this.tournamentsRepository.findCommunityMember(tournament.communityId, userId);
            if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
                isAuthorized = true;
            }
        }
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
        }
        return { tournament, config };
    }
    async getLiteParticipants(id, userId, systemRoles = []) {
        await this.checkLiteAuthorization(id, userId, systemRoles);
        return this.tournamentsRepository.findLiteParticipantsWithRosters(id);
    }
    async pairLiteParticipants(id, userId, systemRoles = [], dto) {
        const { tournament, config } = await this.checkLiteAuthorization(id, userId, systemRoles);
        if (tournament.matchType !== 'DOUBLES' &&
            tournament.matchType !== 'MIXED_DOUBLES') {
            throw new common_1.BadRequestException('Ghép cặp chỉ hỗ trợ giải đấu đánh đôi.');
        }
        const hasActiveBracket = await this.tournamentsRepository.hasNonDeletedStagesOrMatches(id);
        if (hasActiveBracket) {
            throw new common_1.BadRequestException('Không thể ghép cặp sau khi đã sinh nhánh đấu.');
        }
        const registrationMode = config.registrationMode === 'INVITE_ONLY'
            ? 'INVITE_ONLY'
            : 'OPEN';
        const p1Profile = await this.tournamentsRepository.findUserBasicById((await this.tournamentsRepository.findLeaderByParticipantId(dto.participant1Id))?.userId ?? '');
        const p2Profile = await this.tournamentsRepository.findUserBasicById((await this.tournamentsRepository.findLeaderByParticipantId(dto.participant2Id))?.userId ?? '');
        const teamName = [p1Profile?.fullName, p2Profile?.fullName]
            .filter(Boolean)
            .join(' / ');
        return await this.tournamentsRepository.lockTournamentAndPair(id, dto.participant1Id, dto.participant2Id, userId, registrationMode, teamName);
    }
    async generateLitePairs(id, userId, systemRoles = [], dto) {
        const { tournament } = await this.checkLiteAuthorization(id, userId, systemRoles);
        if (tournament.matchType !== 'DOUBLES' &&
            tournament.matchType !== 'MIXED_DOUBLES') {
            throw new common_1.BadRequestException('Ghép cặp chỉ hỗ trợ giải đấu đánh đôi.');
        }
        const hasActiveBracket = await this.tournamentsRepository.hasNonDeletedStagesOrMatches(id);
        if (hasActiveBracket) {
            throw new common_1.BadRequestException('Không thể ghép cặp sau khi đã sinh nhánh đấu.');
        }
        return await this.tournamentsRepository.generateLitePairsTx(id, userId, dto.strategy);
    }
    async unpairLiteParticipant(id, participantId, userId, systemRoles = []) {
        await this.checkLiteAuthorization(id, userId, systemRoles);
        const hasActiveBracket = await this.tournamentsRepository.hasNonDeletedStagesOrMatches(id);
        if (hasActiveBracket) {
            throw new common_1.BadRequestException('Không thể tách cặp sau khi đã sinh nhánh đấu.');
        }
        return await this.tournamentsRepository.lockTournamentAndUnpair(id, participantId, userId);
    }
    async acceptPartnerInvite(participantId, partnerUserId) {
        const participant = await this.tournamentsRepository.findParticipantById(participantId);
        if (participant) {
            const division = participant.tournamentDivisionId
                ? await this.tournamentsRepository.findDivisionById(participant.tournamentDivisionId)
                : null;
            const leaderRoster = await this.tournamentsRepository.findLeaderByParticipantId(participantId);
            await this.validateGenderRestriction(division, [
                leaderRoster?.userId,
                partnerUserId,
            ]);
        }
        const updated = await this.tournamentsRepository.acceptPartnerInvite(participantId, partnerUserId);
        if (updated && updated.registeredBy) {
            await this.notificationsService.sendNotification((0, notification_builder_1.buildPartnerInviteAcceptedNotification)({
                receiverId: updated.registeredBy,
                tournamentId: updated.tournamentId,
                divisionId: updated.tournamentDivisionId,
            }));
        }
        if (updated) {
            this.broadcastRegistrationChanged(updated.tournamentId, {
                participantId: updated.id,
                divisionId: updated.tournamentDivisionId,
                action: 'PARTNER_ACCEPTED',
            });
        }
        return updated;
    }
    async rejectPartnerInvite(participantId, partnerUserId) {
        const updated = await this.tournamentsRepository.rejectPartnerInvite(participantId, partnerUserId);
        if (updated && updated.registeredBy) {
            await this.notificationsService.sendNotification((0, notification_builder_1.buildPartnerInviteRejectedNotification)({
                receiverId: updated.registeredBy,
                tournamentId: updated.tournamentId,
                divisionId: updated.tournamentDivisionId,
            }));
        }
        return updated;
    }
    async importParticipantsFromForm(tournamentId, userId, systemRoles, dto) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        const isAuthorized = await this.isManager(tournament, userId, systemRoles);
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền nhập danh sách VĐV');
        }
        if (tournament.status === 'COMPLETED') {
            throw new common_1.BadRequestException('Giải đấu đã kết thúc');
        }
        const result = await this.tournamentsRepository.importParticipants(tournamentId, userId, dto.participants, dto.divisionId);
        if (dto.sendInvitationEmail && this.mailService && result.unregisteredEmails?.length) {
            for (const recipient of result.unregisteredEmails) {
                try {
                    const html = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
              <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; padding: 28px 24px; text-align: center;">
                <h1 style="margin: 0; font-size: 22px; font-weight: bold; letter-spacing: 0.5px;">SPORTO - THƯ MỜI THI ĐẤU</h1>
              </div>
              <div style="padding: 28px 24px;">
                <p style="font-size: 15px; margin-top: 0;">Xin chào <strong>${recipient.name || 'VĐV'}</strong>,</p>
                <p style="font-size: 14px; color: #475569;">
                  Ban tổ chức đã ghi danh bạn tham gia giải đấu <strong>${tournament.name}</strong> (Tên đội / Cặp: <strong>${recipient.teamName}</strong>).
                </p>
                <p style="font-size: 14px; color: #475569;">
                  Để theo dõi sơ đồ thi đấu, lịch thi đấu theo thời gian thực và nhận thông báo khi trọng tài xếp sân, bạn vui lòng kích hoạt tài khoản Sporto bằng cách bấm vào nút bên dưới:
                </p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="https://sporto.asia/auth/register?email=${encodeURIComponent(recipient.email)}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">
                    Kích hoạt tài khoản & Xem giải đấu
                  </a>
                </div>
                <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 24px;">
                  <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                    Thư này được gửi tự động từ hệ thống quản lý giải đấu Sporto theo ủy quyền của Ban tổ chức.
                  </p>
                </div>
              </div>
            </div>
          `;
                    await this.mailService.sendMail(recipient.email, `[Sporto] Thư mời tham gia giải đấu: ${tournament.name}`, html);
                }
                catch {
                }
            }
        }
        this.broadcastRegistrationChanged(tournamentId, {
            divisionId: dto.divisionId,
            action: 'IMPORT_PARTICIPANTS',
        });
        return {
            message: `Đã nạp thành công ${result.importedCount} VĐV / Đội vào giải đấu!`,
            importedCount: result.importedCount,
            emailsSent: dto.sendInvitationEmail ? (result.unregisteredEmails?.length ?? 0) : 0,
        };
    }
};
exports.TournamentsService = TournamentsService;
__decorate([
    (0, schedule_1.Cron)('*/5 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TournamentsService.prototype, "handleRegistrationsTimeout", null);
exports.TournamentsService = TournamentsService = __decorate([
    (0, common_1.Injectable)(),
    __param(7, (0, common_1.Optional)()),
    __param(8, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [tournaments_repository_1.TournamentsRepository,
        bracket_generator_service_1.BracketGeneratorService,
        notifications_service_1.NotificationsService,
        storage_service_1.StorageService,
        redis_service_1.RedisService,
        config_1.ConfigService,
        community_social_repository_1.CommunitySocialRepository,
        live_score_gateway_1.LiveScoreGateway,
        mail_service_1.MailService])
], TournamentsService);
//# sourceMappingURL=tournaments.service.js.map