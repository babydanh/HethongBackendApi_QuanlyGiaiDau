"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TournamentSchedulerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentSchedulerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const drizzle_orm_1 = require("drizzle-orm");
const tournament_cleanup_policy_1 = require("./utils/tournament-cleanup-policy");
let TournamentSchedulerService = TournamentSchedulerService_1 = class TournamentSchedulerService {
    db;
    logger = new common_1.Logger(TournamentSchedulerService_1.name);
    constructor(db) {
        this.db = db;
    }
    async handleAutoCloseRegistration() {
        this.logger.log('Running auto-close registration cron job...');
        try {
            const now = new Date();
            const expiredTournaments = await this.db
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.status, 'REGISTRATION_OPEN'), (0, drizzle_orm_1.lte)(schema.tournaments.registrationEndDate, now)));
            if (expiredTournaments.length === 0) {
                return;
            }
            this.logger.log(`Found ${expiredTournaments.length} tournament(s) to close registration.`);
            for (const tournament of expiredTournaments) {
                await this.db
                    .update(schema.tournaments)
                    .set({
                    status: 'REGISTRATION_CLOSED',
                    updatedAt: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournament.id));
                this.logger.log(`Tournament ${tournament.id} ("${tournament.name}") registration auto-closed.`);
            }
        }
        catch (err) {
            this.logger.error('Error in handleAutoCloseRegistration cron job:', err.message);
        }
    }
    async handleAutoOpenRegistration() {
        this.logger.log('Running auto-open registration cron job...');
        try {
            const now = new Date();
            const prematurelyOpenTournaments = await this.db
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.status, 'REGISTRATION_OPEN'), (0, drizzle_orm_1.gt)(schema.tournaments.registrationStartDate, now)));
            for (const tournament of prematurelyOpenTournaments) {
                await this.db
                    .update(schema.tournaments)
                    .set({ status: 'UPCOMING', updatedAt: now })
                    .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournament.id));
                this.logger.warn(`Tournament ${tournament.id} was open before its registration start; moved back to UPCOMING.`);
            }
            const openingTournaments = await this.db
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.status, 'UPCOMING'), (0, drizzle_orm_1.lte)(schema.tournaments.registrationStartDate, now)));
            if (openingTournaments.length === 0)
                return;
            this.logger.log(`Found ${openingTournaments.length} tournament(s) to open registration.`);
            for (const tournament of openingTournaments) {
                await this.db
                    .update(schema.tournaments)
                    .set({
                    status: 'REGISTRATION_OPEN',
                    updatedAt: now,
                })
                    .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournament.id));
                const followers = await this.db
                    .select({ userId: schema.tournamentFollows.userId })
                    .from(schema.tournamentFollows)
                    .where((0, drizzle_orm_1.eq)(schema.tournamentFollows.tournamentId, tournament.id));
                if (followers.length > 0) {
                    const notiData = followers.map(f => ({
                        receiverId: f.userId,
                        type: 'TOURNAMENT_REGISTRATION_OPEN',
                        title: `${tournament.name} đã mở đăng ký`,
                        content: `Giải đấu "${tournament.name}" đã mở đăng ký tham gia.`,
                        redirectUrl: `/tournaments/${tournament.id}`,
                    }));
                    await this.db.insert(schema.notifications).values(notiData);
                    this.logger.log(`Sent ${notiData.length} notifications to followers of ${tournament.id}`);
                }
                this.logger.log(`Tournament ${tournament.id} ("${tournament.name}") registration auto-opened.`);
            }
        }
        catch (err) {
            this.logger.error('Error in handleAutoOpenRegistration cron job:', err.message);
        }
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
            ? daysOfWeek.length > 0 ? daysOfWeek : [6]
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
    async handleRecurringLiteTournaments() {
        this.logger.log('Running recurring lite tournaments cron job...');
        try {
            const now = new Date();
            const recurringTournaments = await this.db
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt), (0, drizzle_orm_1.ne)(schema.tournaments.status, 'CANCELLED'), (0, drizzle_orm_1.sql) `(${schema.tournaments.tournamentConfig}->'recurring'->>'enabled')::boolean = true`, (0, drizzle_orm_1.sql) `(${schema.tournaments.tournamentConfig}->'recurring'->>'nextRunAt')::timestamptz <= ${now}`));
            if (recurringTournaments.length === 0)
                return;
            this.logger.log(`Found ${recurringTournaments.length} recurring lite tournament template(s) to generate.`);
            for (const t of recurringTournaments) {
                const config = t.tournamentConfig || {};
                const rec = config.recurring || {};
                const frequency = rec.frequency || 'WEEKLY';
                const daysOfWeek = rec.daysOfWeek && rec.daysOfWeek.length > 0
                    ? rec.daysOfWeek
                    : [rec.dayOfWeek ?? 6];
                const timeOfDay = rec.timeOfDay || '18:00';
                const advanceDays = Math.max(0, Number(rec.advanceDays ?? 0));
                const nextTournamentDate = new Date(rec.nextEventAt ||
                    rec.nextRunAt ||
                    now);
                const dateStr = nextTournamentDate.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' });
                const newName = `${rec.templateName || t.name} (${dateStr})`;
                const [hours, minutes] = timeOfDay.split(':').map(Number);
                nextTournamentDate.setHours(hours, minutes, 0, 0);
                const newTournamentConfig = {
                    ...config,
                    isLite: true,
                    recurring: {
                        ...rec,
                        enabled: false,
                    },
                };
                const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
                const newTournament = await this.db
                    .insert(schema.tournaments)
                    .values({
                    name: newName,
                    tournamentType: 'CLUB',
                    visibility: t.visibility,
                    communityId: t.communityId,
                    categoryId: t.categoryId,
                    matchType: t.matchType,
                    description: t.description,
                    maxParticipants: t.maxParticipants,
                    entryFee: t.entryFee,
                    isRanked: t.isRanked,
                    venueId: t.venueId,
                    bannerUrl: t.bannerUrl,
                    logoUrl: t.logoUrl,
                    galleryImages: t.galleryImages,
                    prizeDescription: t.prizeDescription,
                    contactInfo: t.contactInfo,
                    city: t.city,
                    sportRules: t.sportRules,
                    tournamentConfig: newTournamentConfig,
                    startDate: nextTournamentDate,
                    registrationStartDate: now,
                    registrationEndDate: new Date(nextTournamentDate.getTime() - 60 * 60 * 1000),
                    status: 'REGISTRATION_OPEN',
                    inviteCode,
                    createdBy: t.createdBy,
                })
                    .returning();
                const templateDivisions = await this.db
                    .select()
                    .from(schema.tournamentDivisions)
                    .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.tournamentId, t.id));
                if (templateDivisions.length > 0) {
                    await this.db.insert(schema.tournamentDivisions).values(templateDivisions.map((division) => ({
                        tournamentId: newTournament[0].id,
                        name: division.name,
                        matchType: division.matchType,
                        genderRestriction: division.genderRestriction,
                        maxParticipants: division.maxParticipants,
                        entryFee: division.entryFee,
                        isConfigOverride: division.isConfigOverride,
                        venueId: division.venueId,
                        bracketType: division.bracketType,
                        roundConfig: division.roundConfig,
                        startDate: nextTournamentDate,
                        registrationEndDate: new Date(nextTournamentDate.getTime() - 60 * 60 * 1000),
                        minElo: division.minElo,
                        maxElo: division.maxElo,
                        prizeDescription: division.prizeDescription,
                        status: division.status,
                    })));
                }
                const nextNextRun = this.calculateNextRecurringDate(frequency, daysOfWeek, timeOfDay, nextTournamentDate);
                const nextCreateAt = new Date(nextNextRun.getTime() - advanceDays * 24 * 60 * 60 * 1000);
                const updatedConfig = {
                    ...config,
                    recurring: {
                        ...rec,
                        lastGeneratedAt: now.toISOString(),
                        nextRunAt: nextCreateAt.toISOString(),
                        nextEventAt: nextNextRun.toISOString(),
                    },
                };
                await this.db
                    .update(schema.tournaments)
                    .set({
                    tournamentConfig: updatedConfig,
                    updatedAt: now,
                })
                    .where((0, drizzle_orm_1.eq)(schema.tournaments.id, t.id));
                if (t.communityId) {
                    const members = await this.db
                        .select({ userId: schema.communityMembers.userId })
                        .from(schema.communityMembers)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, t.communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.status, 'JOINED')));
                    if (members.length > 0) {
                        const notiData = members.map((m) => ({
                            receiverId: m.userId,
                            type: 'TOURNAMENT_REGISTRATION_OPEN',
                            title: `🏆 Giải đấu định kỳ mới: ${newName}`,
                            content: `Giải đấu định kỳ "${newName}" của câu lạc bộ đã được tự động tạo và mở đăng ký!`,
                            redirectUrl: `/tournaments/${newTournament[0].id}`,
                        }));
                        await this.db.insert(schema.notifications).values(notiData);
                    }
                    try {
                        const [recurringPost] = await this.db.insert(schema.communityPosts).values({
                            communityId: t.communityId,
                            authorId: t.createdBy,
                            tournamentId: newTournament[0].id,
                            type: 'TOURNAMENT_ANNOUNCEMENT',
                            body: `⚡ CLB vừa mở giải đấu định kỳ: **${newName}**! Bình chọn tham gia ngay bên dưới hoặc quét mã QR để vào phòng đấu.`,
                            mediaUrls: newTournament[0].bannerUrl ? [newTournament[0].bannerUrl] : [],
                            status: 'PUBLISHED',
                        }).returning();
                        if (recurringPost) {
                            const [newPoll] = await this.db.insert(schema.communityPolls).values({
                                communityId: t.communityId,
                                creatorId: t.createdBy,
                                postId: recurringPost.id,
                                question: `Bạn có tham gia giải "${newName}" không?`,
                                allowMultipleAnswers: false,
                                allowAddOptions: false,
                            }).returning();
                            if (newPoll) {
                                await this.db.insert(schema.communityPollOptions).values([
                                    { pollId: newPoll.id, creatorId: t.createdBy, optionText: '✅ Có tham gia (Đăng ký ngay)' },
                                    { pollId: newPoll.id, creatorId: t.createdBy, optionText: '⏳ Chưa chắc chắn' },
                                    { pollId: newPoll.id, creatorId: t.createdBy, optionText: '❌ Bận / Không tham gia' },
                                ]);
                            }
                        }
                    }
                    catch (feedErr) {
                        this.logger.error('Failed to post recurring tournament to community feed:', feedErr.message);
                    }
                }
                this.logger.log(`Generated recurring tournament "${newName}" (ID: ${newTournament[0]?.id})`);
            }
        }
        catch (err) {
            this.logger.error('Error in handleRecurringLiteTournaments cron job:', err.message);
        }
    }
    async handleAutoCleanupAbandonedTournaments() {
        this.logger.log('Running auto-cleanup abandoned tournaments cron job...');
        try {
            const now = new Date();
            const cleanupCutoff = new Date(now.getTime() - tournament_cleanup_policy_1.TOURNAMENT_CLEANUP_GRACE_DAYS * 24 * 60 * 60 * 1000);
            const candidates = await this.db
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.tournamentType, 'CLUB'), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt), (0, drizzle_orm_1.ne)(schema.tournaments.visibility, 'PUBLIC'), (0, drizzle_orm_1.sql) `${schema.tournaments.status} IN ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'UPCOMING')`, (0, drizzle_orm_1.lte)(schema.tournaments.registrationEndDate, cleanupCutoff)));
            for (const candidate of candidates) {
                await this.db.transaction(async (tx) => {
                    const [tournament] = await tx
                        .select()
                        .from(schema.tournaments)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.id, candidate.id), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt), (0, drizzle_orm_1.ne)(schema.tournaments.visibility, 'PUBLIC'), (0, drizzle_orm_1.sql) `${schema.tournaments.status} IN ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'UPCOMING')`, (0, drizzle_orm_1.lte)(schema.tournaments.registrationEndDate, cleanupCutoff)))
                        .for('update');
                    if (!tournament)
                        return;
                    const [activeRegistration] = await tx
                        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                        .from(schema.tournamentParticipants)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournament.id), (0, drizzle_orm_1.sql) `(${schema.tournamentParticipants.teamStatus} IS NULL OR ${schema.tournamentParticipants.teamStatus} NOT IN ('WITHDRAWN', 'REJECTED', 'KICKED', 'EXPIRED'))`));
                    const [protectedPayment] = await tx
                        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                        .from(schema.payments)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.tournamentId, tournament.id), (0, drizzle_orm_1.sql) `(
                  ${schema.payments.status} IS NULL
                  OR ${schema.payments.status} NOT IN ('FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'COMPLETED')
                  OR (
                    ${schema.payments.status} = 'COMPLETED'
                    AND ${schema.payments.refundStatus} IS DISTINCT FROM 'REFUNDED'
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM ${schema.paymentRefunds}
                    WHERE ${schema.paymentRefunds.paymentId} = ${schema.payments.id}
                      AND ${schema.paymentRefunds.status} IN ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING')
                  )
                )`));
                    const [protectedMatch] = await tx
                        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                        .from(schema.matches)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.tournamentId, tournament.id), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)));
                    const [bracketData] = await tx
                        .select({ id: schema.tournamentStages.id })
                        .from(schema.tournamentStages)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournament.id), (0, drizzle_orm_1.isNull)(schema.tournamentStages.deletedAt)))
                        .limit(1);
                    const decision = (0, tournament_cleanup_policy_1.evaluateTournamentCleanup)({
                        status: tournament.status,
                        registrationEndDate: tournament.registrationEndDate,
                        registrationStartDate: tournament.registrationStartDate,
                        startDate: tournament.startDate,
                        activeRegistrationCount: activeRegistration?.count,
                        protectedPaymentCount: protectedPayment?.count,
                        protectedMatchCount: protectedMatch?.count,
                        hasBracketData: Boolean(bracketData),
                    }, now);
                    if (!decision.eligible) {
                        this.logger.log(`Skipped cleanup for tournament ${tournament.id}: ${decision.reason}`);
                        return;
                    }
                    const [cancelledTournament] = await tx
                        .update(schema.tournaments)
                        .set({ status: 'CANCELLED', updatedAt: now })
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.id, tournament.id), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt), (0, drizzle_orm_1.ne)(schema.tournaments.visibility, 'PUBLIC'), (0, drizzle_orm_1.sql) `${schema.tournaments.status} IN ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'UPCOMING')`, (0, drizzle_orm_1.lte)(schema.tournaments.registrationEndDate, cleanupCutoff), (0, drizzle_orm_1.lte)(schema.tournaments.startDate, now), (0, drizzle_orm_1.sql) `NOT EXISTS (
                  SELECT 1 FROM ${schema.tournamentParticipants}
                  WHERE ${schema.tournamentParticipants.tournamentId} = ${schema.tournaments.id}
                    AND (${schema.tournamentParticipants.teamStatus} IS NULL OR ${schema.tournamentParticipants.teamStatus} NOT IN ('WITHDRAWN', 'REJECTED', 'KICKED', 'EXPIRED'))
                )`, (0, drizzle_orm_1.sql) `NOT EXISTS (
                  SELECT 1 FROM ${schema.payments}
                  WHERE ${schema.payments.tournamentId} = ${schema.tournaments.id}
                    AND (
                      ${schema.payments.status} IS NULL
                      OR ${schema.payments.status} NOT IN ('FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'COMPLETED')
                      OR (${schema.payments.status} = 'COMPLETED' AND ${schema.payments.refundStatus} IS DISTINCT FROM 'REFUNDED')
                      OR EXISTS (
                        SELECT 1 FROM ${schema.paymentRefunds}
                        WHERE ${schema.paymentRefunds.paymentId} = ${schema.payments.id}
                          AND ${schema.paymentRefunds.status} IN ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING')
                      )
                    )
                )`, (0, drizzle_orm_1.sql) `NOT EXISTS (
                  SELECT 1 FROM ${schema.matches}
                  WHERE ${schema.matches.tournamentId} = ${schema.tournaments.id}
                    AND ${schema.matches.deletedAt} IS NULL
                )`, (0, drizzle_orm_1.sql) `NOT EXISTS (
                  SELECT 1 FROM ${schema.tournamentStages}
                  WHERE ${schema.tournamentStages.tournamentId} = ${schema.tournaments.id}
                    AND ${schema.tournamentStages.deletedAt} IS NULL
                )`))
                        .returning({ id: schema.tournaments.id });
                    if (!cancelledTournament)
                        return;
                    if (tournament.tournamentType === 'CLUB' && tournament.communityId) {
                        await tx
                            .update(schema.communityPosts)
                            .set({ status: 'HIDDEN', updatedAt: now })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityPosts.tournamentId, tournament.id), (0, drizzle_orm_1.isNull)(schema.communityPosts.deletedAt)));
                    }
                    this.logger.warn(`Auto-cancelled empty ${tournament.tournamentType} tournament ${tournament.id} after registration grace period.`);
                });
            }
        }
        catch (err) {
            this.logger.error('Error in handleAutoCleanupAbandonedTournaments cron job:', err.message);
        }
    }
};
exports.TournamentSchedulerService = TournamentSchedulerService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TournamentSchedulerService.prototype, "handleAutoCloseRegistration", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TournamentSchedulerService.prototype, "handleAutoOpenRegistration", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_10_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TournamentSchedulerService.prototype, "handleRecurringLiteTournaments", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_30_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TournamentSchedulerService.prototype, "handleAutoCleanupAbandonedTournaments", null);
exports.TournamentSchedulerService = TournamentSchedulerService = TournamentSchedulerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object])
], TournamentSchedulerService);
//# sourceMappingURL=tournament-scheduler.service.js.map