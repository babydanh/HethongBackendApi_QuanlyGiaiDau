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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchesService = void 0;
const common_1 = require("@nestjs/common");
const matches_repository_1 = require("./matches.repository");
const operate_match_dto_1 = require("./dto/operate-match.dto");
const live_score_gateway_1 = require("./live-score.gateway");
const rankings_service_1 = require("../rankings/rankings.service");
const notifications_service_1 = require("../notifications/notifications.service");
const notification_builder_1 = require("../notifications/notification-builder");
const redis_service_1 = require("../../providers/redis/redis.service");
const resolve_effective_sport_rules_1 = require("../tournaments/utils/sport-rules/resolve-effective-sport-rules");
const validate_sport_rules_config_1 = require("../tournaments/utils/sport-rules/validate-sport-rules-config");
const validate_score_details_1 = require("./utils/score-validation/validate-score-details");
const football_two_leg_aggregate_1 = require("./utils/football-two-leg-aggregate");
const role_helper_1 = require("../../common/helpers/role.helper");
let MatchesService = class MatchesService {
    matchesRepository;
    liveScoreGateway;
    rankingsService;
    notificationsService;
    redisService;
    constructor(matchesRepository, liveScoreGateway, rankingsService, notificationsService, redisService) {
        this.matchesRepository = matchesRepository;
        this.liveScoreGateway = liveScoreGateway;
        this.rankingsService = rankingsService;
        this.notificationsService = notificationsService;
        this.redisService = redisService;
    }
    isAdmin(user) {
        return (0, role_helper_1.isAdminUser)(user);
    }
    async isTournamentManager(match, user) {
        if (!match)
            return false;
        if (this.isAdmin(user) || match.tournament?.createdBy === user.sub) {
            return true;
        }
        return this.matchesRepository.isTournamentManager(match.tournamentId, user.sub);
    }
    resolveOperationalWinner(match, winnerId) {
        if (!match) {
            throw new common_1.NotFoundException('Match not found');
        }
        if (!winnerId) {
            throw new common_1.BadRequestException('Phải chỉ định đội thắng cho quyết định nghiệp vụ này.');
        }
        if (winnerId !== match.participant1Id &&
            winnerId !== match.participant2Id) {
            throw new common_1.BadRequestException('Người thắng phải thuộc một trong hai participant của trận.');
        }
        return winnerId;
    }
    async finalizeCompletedMatch(existing, matchId, winnerId, auditUserId, overrideOutcome) {
        if (!existing) {
            throw new common_1.NotFoundException('Match not found');
        }
        const isRoundRobin = existing.stage?.type === 'ROUND_ROBIN';
        const updatedMatch = await this.matchesRepository.completeMatch(matchId, winnerId, {
            nextMatchId: existing.nextMatchId,
            loserNextMatchId: existing.loserNextMatchId,
            matchOrder: existing.matchOrder,
            participant1Id: existing.participant1Id,
            participant2Id: existing.participant2Id,
            groupId: existing.groupId,
            isRoundRobin,
            p1SetsWon: overrideOutcome?.p1SetsWon ?? existing.p1SetsWon,
            p2SetsWon: overrideOutcome?.p2SetsWon ?? existing.p2SetsWon,
            scoreDetails: overrideOutcome?.scoreDetails ??
                existing.scoreDetails,
            auditUserId,
            expectedRevision: overrideOutcome?.expectedRevision,
        });
        if (updatedMatch &&
            typeof updatedMatch === 'object' &&
            'conflict' in updatedMatch) {
            const conflict = updatedMatch;
            throw new common_1.ConflictException({
                message: 'Điểm đã thay đổi từ thiết bị khác. Vui lòng làm mới trước khi chốt kết quả.',
                currentRevision: conflict.currentMatch.revision,
            });
        }
        if (!updatedMatch)
            return existing;
        try {
            await this.redisService.del(`match:live:${matchId}`);
        }
        catch (err) {
            console.error('Failed to delete live score cache:', err);
        }
        try {
            await this.redisService.delByPattern('matches:list:*');
        }
        catch (err) {
            console.error('Failed to invalidate matches list cache:', err);
        }
        if (existing.tournamentId) {
            try {
                const allCompleted = await this.matchesRepository.checkAllMatchesCompleted(existing.tournamentId);
                if (allCompleted) {
                    await this.matchesRepository.updateTournamentStatus(existing.tournamentId, 'COMPLETED');
                }
            }
            catch (err) {
                console.error('Failed to auto-complete tournament:', err.message);
            }
        }
        this.liveScoreGateway.broadcastMatchStatus(matchId, updatedMatch, existing.tournamentId);
        this.liveScoreGateway.broadcastScoreUpdate(matchId, updatedMatch, existing.tournamentId);
        try {
            const participantIds = [];
            if (existing.participant1Id)
                participantIds.push(existing.participant1Id);
            if (existing.participant2Id)
                participantIds.push(existing.participant2Id);
            if (participantIds.length > 0) {
                const rosters = await this.matchesRepository.getRostersForParticipants(participantIds);
                for (const roster of rosters) {
                    await this.notificationsService.sendNotification((0, notification_builder_1.buildMatchCompletedNotification)({
                        receiverId: roster.userId,
                        tournamentId: existing.tournamentId,
                        tournamentName: existing.tournament?.name || 'giải đấu',
                        divisionId: existing.participant1?.tournamentDivisionId ||
                            existing.participant2?.tournamentDivisionId ||
                            undefined,
                    }));
                }
            }
        }
        catch (err) {
            console.error('Failed to send MATCH_COMPLETED notifications:', err);
        }
        if (existing.tournamentId) {
            try {
                const followers = await this.matchesRepository.getFollowerUserIds(existing.tournamentId);
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
            }
            catch (err) {
                console.error('Failed to send follower match notifications:', err);
            }
        }
        return updatedMatch;
    }
    resolveMatchConfig(match) {
        if (!match) {
            throw new common_1.NotFoundException('Match not found');
        }
        return (0, resolve_effective_sport_rules_1.resolveEffectiveSportRules)({
            tournamentSportRules: match.tournament?.sportRules,
            categoryConfig: match.tournament?.categoryConfig,
            categoryName: match.tournament?.categoryName,
            categorySlug: match.tournament?.categorySlug,
            stageRoundConfig: match.stage?.roundConfig,
            groupConfig: match.group?.roundConfig,
            roundNumber: match.roundNumber,
            matchConfig: match.matchConfig,
        });
    }
    resolveFootballForfeitGoals(match) {
        const rules = match?.tournament?.sportRules;
        const source = rules && typeof rules === 'object' && !Array.isArray(rules)
            ? rules
            : {};
        const scoring = source.scoring &&
            typeof source.scoring === 'object' &&
            !Array.isArray(source.scoring)
            ? source.scoring
            : source;
        const configured = scoring.forfeitGoals;
        return typeof configured === 'number' &&
            Number.isInteger(configured) &&
            configured > 0 &&
            configured <= 99
            ? configured
            : 3;
    }
    validateFootballShootout(match, scoreDetails, options) {
        if (!match || !scoreDetails) {
            throw new common_1.BadRequestException('Trận bóng đá loại trực tiếp hòa cần tỷ số luân lưu hợp lệ.');
        }
        const config = this.resolveMatchConfig(match);
        const tournamentConfig = match.tournament?.tournamentConfig;
        if (config.kind !== 'FOOTBALL' ||
            tournamentConfig?.penaltyShootout !== true ||
            match.stage?.type === 'ROUND_ROBIN') {
            throw new common_1.BadRequestException('Luân lưu chỉ được dùng cho trận bóng đá loại trực tiếp khi giải đã bật luân lưu.');
        }
        const football = scoreDetails.football;
        const regulation1 = football?.team1Goals;
        const regulation2 = football?.team2Goals;
        const shootout = (scoreDetails.shootout ?? football?.shootout);
        const team1Goals = shootout?.team1Goals;
        const team2Goals = shootout?.team2Goals;
        if (!football ||
            !Number.isInteger(regulation1) ||
            !Number.isInteger(regulation2) ||
            regulation1 < 0 ||
            regulation2 < 0 ||
            (!options?.aggregateTie && regulation1 !== regulation2) ||
            !shootout ||
            !Number.isInteger(team1Goals) ||
            !Number.isInteger(team2Goals) ||
            team1Goals < 0 ||
            team2Goals < 0 ||
            team1Goals === team2Goals) {
            throw new common_1.BadRequestException('Luân lưu chỉ hợp lệ khi tỷ số chính hòa và có hai số nguyên khác nhau.');
        }
        const winnerId = team1Goals > team2Goals
            ? match.participant1Id
            : match.participant2Id;
        if (!winnerId || shootout.winnerId !== winnerId) {
            throw new common_1.BadRequestException('WinnerId phải khớp với đội thắng luân lưu.');
        }
        return winnerId;
    }
    validateFootballPhaseTransition(match, previousScoreDetails, nextScoreDetails) {
        const config = this.resolveMatchConfig(match);
        if (config.kind !== 'FOOTBALL')
            return;
        const previous = previousScoreDetails && typeof previousScoreDetails === 'object'
            ? previousScoreDetails.football
            : undefined;
        const next = nextScoreDetails.football;
        if (!previous ||
            typeof previous !== 'object' ||
            !next ||
            typeof next !== 'object' ||
            Array.isArray(next))
            return;
        const previousPhase = previous.phase;
        const nextPhase = next.phase;
        if (typeof previousPhase !== 'string' ||
            typeof nextPhase !== 'string' ||
            previousPhase === nextPhase)
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
            throw new common_1.BadRequestException(`football.phase không thể chuyển từ ${previousPhase} sang ${nextPhase}.`);
        }
    }
    validateBasicOverrideScoreDetails(scoreDetails) {
        const rawSets = scoreDetails.sets;
        if (!Array.isArray(rawSets)) {
            throw new common_1.BadRequestException('Override score yêu cầu scoreDetails.sets là một mảng hợp lệ.');
        }
        if (rawSets.length === 0 || rawSets.length > 99) {
            throw new common_1.BadRequestException('Số set của giải Lite phải nằm trong khoảng từ 1 đến 99.');
        }
        let p1SetsWon = 0;
        let p2SetsWon = 0;
        const lastSetIndex = rawSets.length - 1;
        rawSets.forEach((setValue, index) => {
            if (!setValue ||
                typeof setValue !== 'object' ||
                Array.isArray(setValue)) {
                throw new common_1.BadRequestException(`set ${index + 1} không hợp lệ.`);
            }
            const setRecord = setValue;
            const team1Score = Number(setRecord.team1Score);
            const team2Score = Number(setRecord.team2Score);
            if (!Number.isFinite(team1Score) ||
                !Number.isFinite(team2Score) ||
                !Number.isInteger(team1Score) ||
                !Number.isInteger(team2Score) ||
                team1Score < 0 ||
                team2Score < 0) {
                throw new common_1.BadRequestException(`set ${index + 1} có điểm số không hợp lệ.`);
            }
            const isFinished = setRecord.isFinished !== false;
            if (!isFinished && index !== lastSetIndex) {
                throw new common_1.BadRequestException(`set ${index + 1} đang diễn ra nhưng không phải set cuối cùng.`);
            }
            if (!isFinished) {
                return;
            }
            if (team1Score === team2Score) {
                throw new common_1.BadRequestException(`set ${index + 1} không được phép hòa khi chốt ngoại lệ.`);
            }
            if (team1Score > team2Score) {
                p1SetsWon += 1;
            }
            else if (team2Score > team1Score) {
                p2SetsWon += 1;
            }
        });
        return {
            p1SetsWon,
            p2SetsWon,
        };
    }
    mergeTrustedSetOverrides(scoreDetails, existingScoreDetails, overrideReason, userId) {
        if (!Array.isArray(scoreDetails.sets)) {
            return scoreDetails;
        }
        const existingDetails = existingScoreDetails &&
            typeof existingScoreDetails === 'object' &&
            !Array.isArray(existingScoreDetails)
            ? existingScoreDetails
            : {};
        const existingSets = Array.isArray(existingDetails.sets)
            ? existingDetails.sets
            : [];
        let overrideTargetIndex = -1;
        if (overrideReason) {
            scoreDetails.sets.forEach((setValue, index) => {
                if (!setValue ||
                    typeof setValue !== 'object' ||
                    Array.isArray(setValue))
                    return;
                const existingSet = existingSets[index];
                const wasFinished = existingSet &&
                    typeof existingSet === 'object' &&
                    !Array.isArray(existingSet)
                    ? existingSet.isFinished === true
                    : false;
                if (setValue.isFinished === true &&
                    !wasFinished) {
                    overrideTargetIndex = index;
                }
            });
        }
        const hasPerSetOverride = existingSets.some((setValue) => {
            if (!setValue || typeof setValue !== 'object' || Array.isArray(setValue))
                return false;
            const setOverride = setValue.scoreOverride;
            return (!!setOverride &&
                typeof setOverride === 'object' &&
                !Array.isArray(setOverride));
        });
        const legacyOverride = !hasPerSetOverride &&
            existingDetails.scoreOverride &&
            typeof existingDetails.scoreOverride === 'object' &&
            !Array.isArray(existingDetails.scoreOverride) &&
            typeof existingDetails.scoreOverride
                .reason === 'string'
            ? existingDetails.scoreOverride
            : undefined;
        const legacyOverrideTargetIndex = legacyOverride
            ? existingSets.findLastIndex((setValue) => {
                if (!setValue ||
                    typeof setValue !== 'object' ||
                    Array.isArray(setValue))
                    return false;
                const setRecord = setValue;
                return setRecord.isFinished === true && !setRecord.scoreOverride;
            })
            : -1;
        const sets = scoreDetails.sets.map((setValue, index) => {
            if (!setValue || typeof setValue !== 'object' || Array.isArray(setValue))
                return setValue;
            const safeSet = { ...setValue };
            delete safeSet.scoreOverride;
            const existingSet = existingSets[index];
            const existingOverride = existingSet &&
                typeof existingSet === 'object' &&
                !Array.isArray(existingSet)
                ? existingSet.scoreOverride
                : undefined;
            if (index === overrideTargetIndex && overrideReason) {
                safeSet.scoreOverride = {
                    reason: overrideReason,
                    decidedAt: new Date().toISOString(),
                    decidedBy: userId,
                };
            }
            else if (existingOverride &&
                typeof existingOverride === 'object' &&
                !Array.isArray(existingOverride) &&
                typeof existingOverride.reason === 'string') {
                safeSet.scoreOverride = existingOverride;
            }
            else if (index === legacyOverrideTargetIndex && legacyOverride) {
                safeSet.scoreOverride = legacyOverride;
            }
            return safeSet;
        });
        return { ...scoreDetails, sets };
    }
    async findAll(query) {
        const cacheKey = `matches:list:${JSON.stringify(query)}`;
        try {
            const cached = await this.redisService.get(cacheKey);
            if (cached)
                return JSON.parse(cached);
        }
        catch (e) {
        }
        const result = await this.matchesRepository.findAll(query);
        try {
            await this.redisService.set(cacheKey, JSON.stringify(result), 30);
        }
        catch (e) {
        }
        return result;
    }
    async findOne(id) {
        const match = await this.matchesRepository.findById(id);
        if (!match) {
            throw new common_1.NotFoundException('Match not found');
        }
        const t = match.tournament;
        if (t &&
            (t.visibility !== 'PUBLIC' ||
                [
                    'DRAFT',
                    'PENDING_APPROVAL',
                    'SUSPENDED',
                    'CANCELLED',
                    'PENDING_DELETE',
                    'pending_delete',
                ].includes(t.status))) {
            throw new common_1.NotFoundException('Match not found');
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
                    if (live.winnerId)
                        match.winnerId = live.winnerId;
                }
            }
            catch (err) {
                console.error('Failed to get live score from Redis:', err);
            }
        }
        return match;
    }
    async updateScore(id, user, updateMatchScoreDto) {
        const existing = await this.matchesRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Match not found');
        if (existing.status === 'COMPLETED') {
            throw new common_1.BadRequestException('Trận đấu đã kết thúc, không thể nhập điểm nữa.');
        }
        if (existing.status !== 'ONGOING') {
            throw new common_1.BadRequestException('Chỉ có thể nhập điểm khi trận đấu đang diễn ra. Hãy bắt đầu trận trước.');
        }
        const isReferee = existing.refereeId === user.sub;
        const isTournamentManager = await this.isTournamentManager(existing, user);
        const acceptedReferee = await this.matchesRepository.isRefereeAccepted(existing.tournamentId, user.sub);
        if (!isTournamentManager && !isReferee && !acceptedReferee) {
            throw new common_1.ForbiddenException('Bạn không có quyền nhập điểm cho trận đấu này');
        }
        if (!existing.participant1Id || !existing.participant2Id) {
            throw new common_1.BadRequestException('Trận đấu chưa xác định đủ đối thủ, không thể nhập điểm.');
        }
        let p1SetsWon = updateMatchScoreDto.p1SetsWon;
        let p2SetsWon = updateMatchScoreDto.p2SetsWon;
        let scoreDetails = updateMatchScoreDto.scoreDetails;
        let winnerId = updateMatchScoreDto.winnerId;
        const overrideReason = updateMatchScoreDto.overrideReason?.trim();
        const resolvedMatchConfig = this.resolveMatchConfig(existing);
        const isFootballMatch = resolvedMatchConfig.kind === 'FOOTBALL';
        let twoLegAggregate = null;
        if (isFootballMatch) {
            const football = scoreDetails?.football;
            if (!football ||
                typeof football !== 'object' ||
                Array.isArray(football)) {
                throw new common_1.BadRequestException('Trận bóng đá bắt buộc phải gửi scoreDetails.football.');
            }
        }
        if (scoreDetails) {
            scoreDetails = this.mergeTrustedSetOverrides(scoreDetails, existing.scoreDetails, overrideReason, user.sub);
            this.validateFootballPhaseTransition(existing, existing.scoreDetails, scoreDetails);
        }
        if (scoreDetails) {
            if (overrideReason) {
                const resolvedConfig = resolvedMatchConfig;
                const tournamentConfig = existing.tournament?.tournamentConfig;
                const sportRules = existing.tournament?.sportRules;
                const matchConfig = existing.matchConfig;
                resolvedConfig.mode =
                    tournamentConfig?.mode ||
                        sportRules?.mode ||
                        matchConfig?.mode;
                const validation = resolvedConfig.kind === 'FOOTBALL'
                    ? (0, validate_score_details_1.validateScoreDetails)(scoreDetails, resolvedConfig)
                    : this.validateBasicOverrideScoreDetails(scoreDetails);
                p1SetsWon = validation.p1SetsWon;
                p2SetsWon = validation.p2SetsWon;
                if (resolvedConfig.kind === 'FOOTBALL' && !winnerId) {
                    const football = scoreDetails.football;
                    if (football &&
                        typeof football === 'object' &&
                        !Array.isArray(football)) {
                        const goals1 = Number(football.team1Goals);
                        const goals2 = Number(football.team2Goals);
                        if (goals1 > goals2)
                            winnerId = existing.participant1Id || undefined;
                        if (goals2 > goals1)
                            winnerId = existing.participant2Id || undefined;
                    }
                }
            }
            else {
                const resolvedConfig = resolvedMatchConfig;
                const tournamentConfig = existing.tournament?.tournamentConfig;
                const sportRules = existing.tournament?.sportRules;
                const matchConfig = existing.matchConfig;
                resolvedConfig.mode =
                    tournamentConfig?.mode ||
                        sportRules?.mode ||
                        matchConfig?.mode;
                const validation = (0, validate_score_details_1.validateScoreDetails)(scoreDetails, resolvedConfig);
                p1SetsWon = validation.p1SetsWon;
                p2SetsWon = validation.p2SetsWon;
                if (p1SetsWon >= validation.setsToWin) {
                    if (winnerId && winnerId !== existing.participant1Id) {
                        throw new common_1.BadRequestException('WinnerId không khớp với kết quả set thắng.');
                    }
                    winnerId = existing.participant1Id || undefined;
                }
                else if (p2SetsWon >= validation.setsToWin) {
                    if (winnerId && winnerId !== existing.participant2Id) {
                        throw new common_1.BadRequestException('WinnerId không khớp với kết quả set thắng.');
                    }
                    winnerId = existing.participant2Id || undefined;
                }
            }
        }
        if (isFootballMatch && existing.tieId && existing.leg && scoreDetails) {
            const otherLeg = await this.matchesRepository.findCompletedTieLeg(existing.tieId, existing.id);
            if (otherLeg) {
                const currentLeg = { ...existing, scoreDetails, status: 'COMPLETED' };
                const leg1 = existing.leg === 1 ? currentLeg : otherLeg;
                const leg2 = existing.leg === 2 ? currentLeg : otherLeg;
                twoLegAggregate = (0, football_two_leg_aggregate_1.aggregateFootballTwoLegs)(leg1, leg2);
                if (!twoLegAggregate.winnerId && winnerId) {
                    const scorePayload = scoreDetails;
                    const footballPayload = scorePayload.football;
                    const shootout = (scorePayload.shootout ??
                        footballPayload?.shootout);
                    if (shootout?.winnerId) {
                        winnerId = this.validateFootballShootout(existing, scoreDetails, {
                            aggregateTie: true,
                        });
                    }
                    else {
                        winnerId = undefined;
                    }
                }
            }
        }
        if (winnerId) {
            if (winnerId !== existing.participant1Id &&
                winnerId !== existing.participant2Id) {
                throw new common_1.BadRequestException('WinnerId không thuộc một trong hai participant của trận.');
            }
            const scorePayload = scoreDetails;
            const footballPayload = scorePayload?.football;
            const shootout = (scorePayload?.shootout ?? footballPayload?.shootout);
            const isShootoutDecided = shootout?.winnerId === winnerId;
            if (shootout) {
                const shootoutWinner = this.validateFootballShootout(existing, scoreDetails, {
                    aggregateTie: Boolean(twoLegAggregate && !twoLegAggregate.winnerId),
                });
                if (shootout.winnerId !== shootoutWinner) {
                    throw new common_1.BadRequestException('WinnerId phải khớp với tỷ số luân lưu cao hơn.');
                }
            }
            if (!isShootoutDecided &&
                winnerId === existing.participant1Id &&
                p1SetsWon <= p2SetsWon) {
                throw new common_1.BadRequestException('Đội 1 chỉ có thể được chốt thắng khi số set/game thắng cao hơn.');
            }
            if (!isShootoutDecided &&
                winnerId === existing.participant2Id &&
                p2SetsWon <= p1SetsWon) {
                throw new common_1.BadRequestException('Đội 2 chỉ có thể được chốt thắng khi số set/game thắng cao hơn.');
            }
        }
        const nextScoreDetails = overrideReason && scoreDetails
            ? {
                ...scoreDetails,
                scoreOverride: {
                    reason: overrideReason,
                    decidedAt: new Date().toISOString(),
                    decidedBy: user.sub,
                },
            }
            : scoreDetails;
        if (winnerId) {
            return await this.finalizeCompletedMatch(existing, id, winnerId, user.sub, {
                p1SetsWon,
                p2SetsWon,
                scoreDetails: nextScoreDetails,
                expectedRevision: updateMatchScoreDto.expectedRevision,
            });
        }
        const updatedMatch = await this.matchesRepository.updateScore(id, user.sub, {
            p1SetsWon,
            p2SetsWon,
            scoreDetails: nextScoreDetails,
            expectedRevision: updateMatchScoreDto.expectedRevision,
        });
        if (updatedMatch &&
            typeof updatedMatch === 'object' &&
            'conflict' in updatedMatch) {
            const conflict = updatedMatch;
            throw new common_1.ConflictException({
                message: 'Điểm đã thay đổi từ thiết bị khác. Vui lòng làm mới trước khi nhập tiếp.',
                currentRevision: conflict.currentMatch.revision,
            });
        }
        if (!updatedMatch) {
            throw new common_1.NotFoundException('Match not found after score update');
        }
        if (existing.status === 'ONGOING' || existing.status === 'SCHEDULED') {
            try {
                const cacheKey = `match:live:${id}`;
                if (p1SetsWon !== undefined)
                    await this.redisService.hset(cacheKey, 'p1SetsWon', String(p1SetsWon));
                if (p2SetsWon !== undefined)
                    await this.redisService.hset(cacheKey, 'p2SetsWon', String(p2SetsWon));
                if (nextScoreDetails)
                    await this.redisService.hset(cacheKey, 'scoreDetails', JSON.stringify(nextScoreDetails));
                if (winnerId)
                    await this.redisService.hset(cacheKey, 'winnerId', winnerId);
                await this.redisService.getClient().expire(cacheKey, 86400);
            }
            catch (err) {
                console.error('Failed to cache live score to Redis:', err);
            }
        }
        this.liveScoreGateway.broadcastScoreUpdate(id, updatedMatch, existing.tournamentId);
        try {
            await this.redisService.delByPattern('matches:list:*');
        }
        catch (err) {
            console.error('Failed to invalidate matches list cache:', err);
        }
        return updatedMatch;
    }
    async updateStatus(id, user, updateMatchStatusDto) {
        const existing = await this.matchesRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Match not found');
        if (existing.status === 'COMPLETED') {
            throw new common_1.BadRequestException('Trận đấu đã kết thúc, không thể đổi trạng thái nữa.');
        }
        const nextStatus = updateMatchStatusDto.status;
        if (nextStatus === 'ONGOING' && existing.status !== 'SCHEDULED') {
            throw new common_1.BadRequestException('A match must be scheduled before it can start.');
        }
        if (nextStatus === 'COMPLETED' && existing.status !== 'ONGOING') {
            throw new common_1.BadRequestException('A match must be ongoing before it can be completed.');
        }
        if (nextStatus === 'SCHEDULED' && existing.status !== 'SCHEDULED') {
            throw new common_1.BadRequestException('An ongoing match cannot return to scheduled.');
        }
        const isReferee = existing.refereeId === user.sub;
        const isTournamentManager = await this.isTournamentManager(existing, user);
        const acceptedReferee = await this.matchesRepository.isRefereeAccepted(existing.tournamentId, user.sub);
        if (!isTournamentManager && !isReferee && !acceptedReferee) {
            throw new common_1.ForbiddenException('Bạn không có quyền thay đổi trạng thái trận đấu này');
        }
        if (updateMatchStatusDto.status === 'ONGOING') {
            if (!existing.participant1Id || !existing.participant2Id) {
                throw new common_1.BadRequestException('Chưa đủ đối thủ để bắt đầu trận đấu.');
            }
            if (acceptedReferee && !existing.refereeId) {
                await this.matchesRepository.updateRefereeId(id, user.sub, user.sub);
            }
        }
        if (updateMatchStatusDto.status === 'COMPLETED') {
            if (existing.status === 'COMPLETED') {
                return existing;
            }
            const resolvedConfig = this.resolveMatchConfig(existing);
            if (resolvedConfig.kind === 'FOOTBALL') {
                const scoreDetails = existing.scoreDetails;
                const football = scoreDetails?.football;
                const phase = football?.phase;
                const team1Goals = football?.team1Goals;
                const team2Goals = football?.team2Goals;
                const terminalPhase = [
                    'FULL_TIME',
                    'PENALTY_SHOOTOUT',
                    'COMPLETED',
                ].includes(String(phase));
                if (!football ||
                    !terminalPhase ||
                    !Number.isInteger(team1Goals) ||
                    !Number.isInteger(team2Goals) ||
                    team1Goals < 0 ||
                    team2Goals < 0) {
                    throw new common_1.BadRequestException('Chỉ có thể chốt trận bóng đá sau khi có tỷ số hợp lệ ở trạng thái toàn thời gian.');
                }
                const isRoundRobin = existing.stage?.type === 'ROUND_ROBIN';
                const tournamentConfig = existing.tournament?.tournamentConfig;
                const isDraw = team1Goals === team2Goals;
                const isTwoLegTie = Boolean(existing.tieId && existing.leg);
                if (isTwoLegTie) {
                    const currentLeg = {
                        ...existing,
                        scoreDetails,
                        status: 'COMPLETED',
                    };
                    const otherLeg = await this.matchesRepository.findCompletedTieLeg(existing.tieId, existing.id);
                    const currentLegWinner = isDraw
                        ? null
                        : team1Goals > team2Goals
                            ? existing.participant1Id
                            : existing.participant2Id;
                    if (!otherLeg) {
                        return this.finalizeCompletedMatch(existing, id, currentLegWinner, user.sub);
                    }
                    const leg1 = existing.leg === 1 ? currentLeg : otherLeg;
                    const leg2 = existing.leg === 2 ? currentLeg : otherLeg;
                    const aggregate = (0, football_two_leg_aggregate_1.aggregateFootballTwoLegs)(leg1, leg2);
                    if (aggregate.winnerId) {
                        return this.finalizeCompletedMatch(existing, id, currentLegWinner, user.sub);
                    }
                    if (tournamentConfig?.penaltyShootout !== true) {
                        throw new common_1.BadRequestException('Tổng tỷ số hai lượt đang hòa; giải chưa bật luân lưu.');
                    }
                    const shootoutWinner = this.validateFootballShootout(existing, scoreDetails, {
                        aggregateTie: true,
                    });
                    return this.finalizeCompletedMatch(existing, id, shootoutWinner, user.sub);
                }
                if (isDraw) {
                    if (isRoundRobin) {
                        return this.finalizeCompletedMatch(existing, id, null, user.sub);
                    }
                    if (tournamentConfig?.penaltyShootout !== true) {
                        throw new common_1.BadRequestException('Trận bóng đá loại trực tiếp đang hòa; giải chưa bật luân lưu.');
                    }
                    const shootoutWinner = this.validateFootballShootout(existing, scoreDetails);
                    return this.finalizeCompletedMatch(existing, id, shootoutWinner, user.sub);
                }
                const winnerId = team1Goals > team2Goals
                    ? existing.participant1Id
                    : existing.participant2Id;
                if (!winnerId) {
                    throw new common_1.BadRequestException('Trận bóng đá chưa xác định đủ đội thắng.');
                }
                return this.finalizeCompletedMatch(existing, id, winnerId, user.sub);
            }
            let winnerId = existing.winnerId;
            if (!winnerId) {
                const setsToWin = resolvedConfig.setsToWin;
                if (existing.p1SetsWon >= setsToWin) {
                    winnerId = existing.participant1Id;
                }
                else if (existing.p2SetsWon >= setsToWin) {
                    winnerId = existing.participant2Id;
                }
            }
            if (!winnerId) {
                throw new common_1.BadRequestException('Chưa xác định được người chiến thắng. Vui lòng cập nhật tỉ số trước.');
            }
            return this.finalizeCompletedMatch(existing, id, winnerId, user.sub);
        }
        else {
            const updatedMatch = await this.matchesRepository.updateStatus(id, updateMatchStatusDto);
            if (!updatedMatch) {
                throw new common_1.NotFoundException('Match not found after status update');
            }
            this.liveScoreGateway.broadcastMatchStatus(id, updatedMatch, existing.tournamentId);
            try {
                await this.redisService.delByPattern('matches:list:*');
            }
            catch (err) {
                console.error('Failed to invalidate matches list cache:', err);
            }
            return updatedMatch;
        }
    }
    async operateMatch(id, user, data) {
        const existing = await this.matchesRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Match not found');
        if (existing.status === 'COMPLETED') {
            throw new common_1.BadRequestException('Trận đấu đã kết thúc, không thể áp dụng quyết định lần nữa.');
        }
        if (!(await this.isTournamentManager(existing, user))) {
            throw new common_1.ForbiddenException('Bạn không có quyền áp dụng quyết định nghiệp vụ cho trận này');
        }
        if (!operate_match_dto_1.MATCH_OPERATION_ACTIONS.includes(data.action)) {
            throw new common_1.BadRequestException('Hành động nghiệp vụ không hợp lệ.');
        }
        if (data.action === 'POSTPONE' || data.action === 'ABANDON') {
            if (data.action === 'POSTPONE' &&
                existing.status !== 'SCHEDULED') {
                throw new common_1.BadRequestException('Chỉ có thể hoãn trận chưa bắt đầu. Trận đang diễn ra cần xử lý bỏ trận hoặc chốt kết quả.');
            }
            if (data.action === 'ABANDON' &&
                existing.status !== 'SCHEDULED' &&
                existing.status !== 'ONGOING') {
                throw new common_1.BadRequestException('Chỉ có thể bỏ trận khi trận đang chờ hoặc đang diễn ra.');
            }
            const currentScoreDetails = existing.scoreDetails && typeof existing.scoreDetails === 'object'
                ? existing.scoreDetails
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
            const updated = await this.matchesRepository.recordNonFinalOperation(id, user.sub, {
                status: data.action === 'POSTPONE' ? 'SCHEDULED' : 'DISPUTED',
                scoreDetails: data.action === 'POSTPONE'
                    ? { specialResult }
                    : { ...currentScoreDetails, specialResult },
                ...(data.action === 'POSTPONE'
                    ? { p1SetsWon: 0, p2SetsWon: 0 }
                    : {}),
                scheduledAt: null,
                startedAt: null,
                winnerId: null,
            });
            if (!updated) {
                throw new common_1.NotFoundException('Không tìm thấy trận sau khi ghi quyết định.');
            }
            this.liveScoreGateway.broadcastMatchStatus(id, updated, existing.tournamentId);
            this.liveScoreGateway.broadcastScoreUpdate(id, updated, existing.tournamentId);
            try {
                const participantIds = [
                    existing.participant1Id,
                    existing.participant2Id,
                ].filter((participantId) => Boolean(participantId));
                if (participantIds.length > 0) {
                    const rosters = await this.matchesRepository.getRostersForParticipants(participantIds);
                    for (const roster of rosters) {
                        await this.notificationsService.sendNotification(data.action === 'POSTPONE'
                            ? (0, notification_builder_1.buildMatchScheduledNotification)({
                                receiverId: roster.userId,
                                tournamentId: existing.tournamentId,
                                tournamentName: existing.tournament?.name || 'giải đấu',
                                scheduledTime: 'chưa xác định',
                                court: 'Chưa xếp sân',
                                divisionId: existing.participant1?.tournamentDivisionId ||
                                    existing.participant2?.tournamentDivisionId ||
                                    undefined,
                            })
                            : {
                                receiverId: roster.userId,
                                type: 'MATCH_DISPUTED',
                                title: 'Trận đấu cần được xử lý',
                                content: `Trận đấu trong giải ${existing.tournament?.name || 'giải đấu'} đã bị bỏ và đang chờ BTC phân xử.`,
                                redirectUrl: `/tournaments/${existing.tournamentId}`,
                            });
                    }
                }
            }
            catch (err) {
                console.error('Failed to send match operation notifications:', err);
            }
            try {
                await this.redisService.del(`match:live:${id}`);
                await this.redisService.delByPattern('matches:list:*');
            }
            catch (err) {
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
        const currentScoreDetails = existing.scoreDetails && typeof existing.scoreDetails === 'object'
            ? existing.scoreDetails
            : {};
        const isFootball = resolvedConfig.kind === 'FOOTBALL';
        const usesFootballForfeitScore = isFootball &&
            ['WALKOVER', 'NO_SHOW', 'DISQUALIFICATION'].includes(data.action);
        const currentFootball = currentScoreDetails.football &&
            typeof currentScoreDetails.football === 'object' &&
            !Array.isArray(currentScoreDetails.football)
            ? currentScoreDetails.football
            : {};
        const footballForfeitGoals = usesFootballForfeitScore
            ? this.resolveFootballForfeitGoals(existing)
            : null;
        let scoreDetails = {
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
        if (isFootball && !usesFootballForfeitScore) {
            if (!currentFootball ||
                typeof currentFootball.team1Goals !== 'number' ||
                typeof currentFootball.team2Goals !== 'number') {
                throw new common_1.BadRequestException('Quyết định bóng đá này cần scoreDetails.football hợp lệ trước khi chốt trận.');
            }
            scoreDetails = {
                ...scoreDetails,
                football: {
                    ...currentFootball,
                    phase: 'COMPLETED',
                },
            };
            const validation = (0, validate_score_details_1.validateScoreDetails)(scoreDetails, resolvedConfig);
            nextP1SetsWon = validation.p1SetsWon;
            nextP2SetsWon = validation.p2SetsWon;
        }
        return this.finalizeCompletedMatch(existing, id, winnerId, user.sub, {
            p1SetsWon: nextP1SetsWon,
            p2SetsWon: nextP2SetsWon,
            scoreDetails,
        });
    }
    async getComments(id) {
        const existing = await this.matchesRepository.findById(id);
        if (!existing) {
            throw new common_1.NotFoundException('Match not found');
        }
        const mutedUserIds = await this.matchesRepository.getMutedUserIds(id);
        return this.matchesRepository.findCommentsByMatchId(id, mutedUserIds);
    }
    async createComment(id, user, createMatchCommentDto) {
        const existing = await this.matchesRepository.findById(id);
        if (!existing) {
            throw new common_1.NotFoundException('Match not found');
        }
        const userId = user?.sub ?? null;
        const comment = await this.matchesRepository.createComment(id, userId, createMatchCommentDto.commentText.trim());
        this.liveScoreGateway.broadcastComment(id, comment);
        return comment;
    }
    async updateSchedule(id, user, data) {
        const existing = await this.matchesRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Match not found');
        if (!(await this.isTournamentManager(existing, user))) {
            throw new common_1.ForbiddenException('Bạn không có quyền chỉnh lịch thi đấu của giải này');
        }
        if (data.refereeId) {
            const isAccepted = await this.matchesRepository.isRefereeAccepted(existing.tournamentId, data.refereeId);
            if (!isAccepted) {
                throw new common_1.BadRequestException('Trọng tài được chọn chưa xác nhận tham gia giải đấu này (status ACCEPTED)');
            }
        }
        if (data.matchConfig) {
            const expectedKind = (0, resolve_effective_sport_rules_1.resolveEffectiveSportRules)({
                tournamentSportRules: existing.tournament?.sportRules,
                categoryName: existing.tournament?.categoryName,
                categorySlug: existing.tournament?.categorySlug,
                stageRoundConfig: existing.stage?.roundConfig,
                groupConfig: existing.group?.roundConfig,
                roundNumber: existing.roundNumber,
            }).kind;
            (0, validate_sport_rules_config_1.validateSportRuleConfig)(data.matchConfig, {
                expectedKind,
                sourceLabel: 'matchConfig',
                allowRoundMetadata: true,
            });
        }
        const updatedMatch = await this.matchesRepository.updateSchedule(id, user.sub, data);
        if (updatedMatch) {
            this.liveScoreGateway.broadcastScoreUpdate(id, updatedMatch, existing.tournamentId);
        }
        if (data.refereeId && data.refereeId !== existing.refereeId) {
            try {
                const matchName = `${existing.participant1?.teamName || 'TBD'} vs ${existing.participant2?.teamName || 'TBD'}`;
                const scheduledTime = data.scheduledAt
                    ? new Date(data.scheduledAt).toLocaleString('vi-VN')
                    : existing.scheduledAt
                        ? new Date(existing.scheduledAt).toLocaleString('vi-VN')
                        : 'chưa xác định';
                await this.notificationsService.sendNotification((0, notification_builder_1.buildRefereeAssignedNotification)({
                    receiverId: data.refereeId,
                    tournamentId: existing.tournamentId,
                    matchName,
                    scheduledTime,
                    divisionId: existing.participant1?.tournamentDivisionId ||
                        existing.participant2?.tournamentDivisionId ||
                        undefined,
                }));
            }
            catch (err) {
                console.error('Failed to send referee assignment notification:', err);
            }
        }
        const toIsoOrNull = (value) => value ? new Date(value).toISOString() : null;
        const isScheduleChanged = Boolean(updatedMatch) &&
            (toIsoOrNull(updatedMatch?.scheduledAt) !==
                toIsoOrNull(existing.scheduledAt) ||
                (updatedMatch?.courtName ?? null) !== (existing.courtName ?? null) ||
                (updatedMatch?.courtAddress ?? null) !==
                    (existing.courtAddress ?? null));
        if (isScheduleChanged) {
            try {
                const participantIds = [];
                if (existing.participant1Id)
                    participantIds.push(existing.participant1Id);
                if (existing.participant2Id)
                    participantIds.push(existing.participant2Id);
                if (participantIds.length > 0) {
                    const rosters = await this.matchesRepository.getRostersForParticipants(participantIds);
                    const scheduledTime = updatedMatch?.scheduledAt
                        ? new Date(updatedMatch.scheduledAt).toLocaleString('vi-VN')
                        : 'chưa xác định';
                    const court = updatedMatch?.courtName || 'Chưa xếp sân';
                    for (const roster of rosters) {
                        await this.notificationsService.sendNotification((0, notification_builder_1.buildMatchScheduledNotification)({
                            receiverId: roster.userId,
                            tournamentId: existing.tournamentId,
                            tournamentName: existing.tournament?.name || 'giải đấu',
                            scheduledTime,
                            court,
                            divisionId: existing.participant1?.tournamentDivisionId ||
                                existing.participant2?.tournamentDivisionId ||
                                undefined,
                        }));
                    }
                }
            }
            catch (err) {
                console.error('Failed to send MATCH_SCHEDULED notifications:', err);
            }
        }
        try {
            await this.redisService.delByPattern('matches:list:*');
        }
        catch (err) {
            console.error('Failed to invalidate matches list cache:', err);
        }
        return updatedMatch;
    }
    async assignReferee(id, refereeId, user) {
        const existing = await this.matchesRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Match not found');
        if (!(await this.isTournamentManager(existing, user))) {
            throw new common_1.ForbiddenException('Bạn không có quyền phân công trọng tài cho trận đấu này');
        }
        if (refereeId) {
            const isAccepted = await this.matchesRepository.isRefereeAccepted(existing.tournamentId, refereeId);
            if (!isAccepted) {
                throw new common_1.BadRequestException('Trọng tài được chọn chưa xác nhận tham gia giải đấu này (status ACCEPTED)');
            }
        }
        return this.updateSchedule(id, user, { refereeId });
    }
    async muteUser(id, targetUserId, type, reason, user) {
        const existing = await this.matchesRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Match not found');
        const isCreator = existing.tournament?.createdBy === user.sub;
        const isAdmin = this.isAdmin(user);
        if (!isAdmin && !isCreator) {
            throw new common_1.ForbiddenException('Bạn không có quyền quản lý bình luận trận đấu này');
        }
        await this.matchesRepository.muteUser(id, targetUserId, type, reason ?? null, user.sub);
        this.liveScoreGateway.broadcastComment(id, {
            type: 'MUTE_UPDATE',
            userId: targetUserId,
            action: type,
        });
        return {
            message: type === 'BAN' ? 'Đã cấm người dùng này' : 'Đã mute người dùng này',
        };
    }
    async unmuteUser(id, targetUserId, user) {
        const existing = await this.matchesRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Match not found');
        const isCreator = existing.tournament?.createdBy === user.sub;
        const isAdmin = this.isAdmin(user);
        if (!isAdmin && !isCreator) {
            throw new common_1.ForbiddenException('Bạn không có quyền quản lý bình luận trận đấu này');
        }
        await this.matchesRepository.unmuteUser(id, targetUserId);
        this.liveScoreGateway.broadcastComment(id, {
            type: 'MUTE_UPDATE',
            userId: targetUserId,
            action: 'UNMUTE',
        });
        return { message: 'Đã bỏ cấm/mute người dùng' };
    }
    async getMutedUsers(id, user) {
        const existing = await this.matchesRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Match not found');
        if (!(0, role_helper_1.isMatchOwnerOrAdmin)(user, existing.tournament?.createdBy)) {
            throw new common_1.ForbiddenException('Bạn không có quyền xem danh sách người dùng bị hạn chế');
        }
        return this.matchesRepository.getMutedUsers(id);
    }
    async cheerMatch(id) {
        const existing = await this.matchesRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Match not found');
        const updated = await this.matchesRepository.incrementCheerCount(id);
        if (!updated) {
            throw new common_1.NotFoundException('Match not found after cheer update');
        }
        try {
            await this.redisService.delByPattern('matches:list:*');
        }
        catch (e) {
        }
        this.liveScoreGateway.broadcastCheerUpdate(id, updated.cheerCount);
        return { cheerCount: updated.cheerCount };
    }
    async getCheerCount(id) {
        const existing = await this.matchesRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Match not found');
        return { cheerCount: existing.cheerCount ?? 0 };
    }
};
exports.MatchesService = MatchesService;
exports.MatchesService = MatchesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [matches_repository_1.MatchesRepository,
        live_score_gateway_1.LiveScoreGateway,
        rankings_service_1.RankingsService,
        notifications_service_1.NotificationsService,
        redis_service_1.RedisService])
], MatchesService);
//# sourceMappingURL=matches.service.js.map