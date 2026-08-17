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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeriesService = void 0;
const common_1 = require("@nestjs/common");
const series_repository_1 = require("./series.repository");
const drizzle_orm_1 = require("drizzle-orm");
const schema = __importStar(require("../../database/schema"));
let SeriesService = class SeriesService {
    seriesRepository;
    constructor(seriesRepository) {
        this.seriesRepository = seriesRepository;
    }
    async create(userId, data) {
        return this.seriesRepository.create(userId, data);
    }
    async update(id, userId, data, roles) {
        const existing = await this.seriesRepository.findById(id);
        if (!existing) {
            throw new common_1.NotFoundException('Không tìm thấy chuỗi giải đấu.');
        }
        const isAuthorized = roles.includes('ADMIN') || existing.organizerId === userId;
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền chỉnh sửa chuỗi giải đấu này.');
        }
        return this.seriesRepository.update(id, data);
    }
    async remove(id, userId, roles) {
        const existing = await this.seriesRepository.findById(id);
        if (!existing) {
            throw new common_1.NotFoundException('Không tìm thấy chuỗi giải đấu.');
        }
        const isAuthorized = roles.includes('ADMIN') || existing.organizerId === userId;
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền xóa chuỗi giải đấu này.');
        }
        return this.seriesRepository.softDelete(id);
    }
    async findOne(idOrSlug) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        let result;
        if (uuidRegex.test(idOrSlug)) {
            const series = await this.seriesRepository.findById(idOrSlug);
            if (series) {
                result = { series };
            }
        }
        else {
            result = await this.seriesRepository.findBySlug(idOrSlug);
        }
        if (!result) {
            throw new common_1.NotFoundException('Không tìm thấy chuỗi giải đấu.');
        }
        const legs = await this.seriesRepository.findLegsBySeriesId(result.series.id);
        return {
            ...result,
            legs,
        };
    }
    async findAll(query) {
        return this.seriesRepository.findAll(query);
    }
    async createLeg(seriesId, userId, data, roles) {
        const series = await this.seriesRepository.findById(seriesId);
        if (!series) {
            throw new common_1.NotFoundException('Không tìm thấy chuỗi giải đấu.');
        }
        const isAuthorized = roles.includes('ADMIN') || series.organizerId === userId;
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền thêm chặng vào chuỗi giải đấu này.');
        }
        return this.seriesRepository.createLeg(seriesId, data);
    }
    async updateLeg(seriesId, legId, userId, data, roles) {
        const series = await this.seriesRepository.findById(seriesId);
        if (!series) {
            throw new common_1.NotFoundException('Không tìm thấy chuỗi giải đấu.');
        }
        const isAuthorized = roles.includes('ADMIN') || series.organizerId === userId;
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền cập nhật chặng thuộc chuỗi giải đấu này.');
        }
        const leg = await this.seriesRepository.findLegById(legId);
        if (!leg || leg.seriesId !== seriesId) {
            throw new common_1.NotFoundException('Không tìm thấy chặng đấu trong chuỗi này.');
        }
        return this.seriesRepository.updateLeg(legId, data);
    }
    async deleteLeg(seriesId, legId, userId, roles) {
        const series = await this.seriesRepository.findById(seriesId);
        if (!series) {
            throw new common_1.NotFoundException('Không tìm thấy chuỗi giải đấu.');
        }
        const isAuthorized = roles.includes('ADMIN') || series.organizerId === userId;
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền xóa chặng thuộc chuỗi giải đấu này.');
        }
        const leg = await this.seriesRepository.findLegById(legId);
        if (!leg || leg.seriesId !== seriesId) {
            throw new common_1.NotFoundException('Không tìm thấy chặng đấu trong chuỗi này.');
        }
        return this.seriesRepository.deleteLeg(legId);
    }
    async findLegs(seriesId) {
        const series = await this.seriesRepository.findById(seriesId);
        if (!series) {
            throw new common_1.NotFoundException('Không tìm thấy chuỗi giải đấu.');
        }
        return this.seriesRepository.findLegsBySeriesId(seriesId);
    }
    async linkTournament(seriesId, legId, userId, data, roles) {
        const series = await this.seriesRepository.findById(seriesId);
        if (!series) {
            throw new common_1.NotFoundException('Không tìm thấy chuỗi giải đấu.');
        }
        const isAuthorized = roles.includes('ADMIN') || series.organizerId === userId;
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền liên kết giải đấu vào chuỗi này.');
        }
        const leg = await this.seriesRepository.findLegById(legId);
        if (!leg || leg.seriesId !== seriesId) {
            throw new common_1.NotFoundException('Không tìm thấy chặng đấu trong chuỗi này.');
        }
        const existingLink = await this.seriesRepository.findEventByTournamentId(data.tournamentId);
        if (existingLink) {
            throw new common_1.BadRequestException('Giải đấu đã được liên kết với một chuỗi giải khác.');
        }
        return this.seriesRepository.linkTournament(legId, data);
    }
    async unlinkTournament(seriesId, eventId, userId, roles) {
        const series = await this.seriesRepository.findById(seriesId);
        if (!series) {
            throw new common_1.NotFoundException('Không tìm thấy chuỗi giải đấu.');
        }
        const isAuthorized = roles.includes('ADMIN') || series.organizerId === userId;
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền hủy liên kết giải đấu khỏi chuỗi này.');
        }
        return this.seriesRepository.unlinkTournament(eventId);
    }
    async findEvents(legId) {
        return this.seriesRepository.findEventsByLegId(legId);
    }
    async getStandings(seriesId, query) {
        const series = await this.seriesRepository.findById(seriesId);
        if (!series) {
            throw new common_1.NotFoundException('Không tìm thấy chuỗi giải đấu.');
        }
        return this.seriesRepository.getStandings(query.legId, query.categoryId, query.limit, query.page, query.cursor);
    }
    async computePsrForTournament(tournamentId) {
        const eventInfo = await this.seriesRepository.findEventByTournamentId(tournamentId);
        if (!eventInfo) {
            return;
        }
        const { event, leg, series, tournament } = eventInfo;
        const rules = (leg.rulesOverride || series.rules);
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
        const sortedRankKeys = Object.keys(pointsByRank)
            .map(Number)
            .sort((a, b) => b - a);
        for (const ranking of rankings) {
            const { userId, participantId, rank } = ranking;
            let standing = await this.seriesRepository.getStandingForUser(leg.id, userId, tournament.categoryId);
            if (!standing) {
                standing = await this.seriesRepository.createStanding(leg.id, userId, tournament.categoryId);
            }
            if (standing.lockedOut) {
                continue;
            }
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
            await this.seriesRepository.updateStandingPoints(standing.id, totalPoints, rank, isDirectEntry, isDirectEntry ? event.id : null);
            await this.seriesRepository.createPointLog(standing.id, event.id, participantId, rank, basePoints, multiplier, totalPoints, isDirectEntry);
        }
    }
    async resetSeason(seriesId, userId, userRoles) {
        const series = await this.seriesRepository.findById(seriesId);
        if (!series) {
            throw new common_1.NotFoundException('Series not found');
        }
        const isOwner = series.organizerId === userId;
        const isAdmin = userRoles.includes('ADMIN');
        if (!isOwner && !isAdmin) {
            throw new common_1.ForbiddenException('You do not have permission to reset this series season.');
        }
        await this.seriesRepository.resetSeason(seriesId);
        return { success: true, message: 'Season reset successfully.' };
    }
    async inviteStaff(seriesId, userId, inviteeEmailOrPhone, role, userRoles) {
        const series = await this.seriesRepository.findById(seriesId);
        if (!series) {
            throw new common_1.NotFoundException('Không tìm thấy chuỗi giải đấu.');
        }
        const isAuthorized = userRoles.includes('ADMIN') || series.organizerId === userId;
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền mời nhân sự cho chuỗi giải đấu này.');
        }
        const user = await this.seriesRepository.findUserByEmailOrPhone(inviteeEmailOrPhone);
        if (!user) {
            throw new common_1.NotFoundException('Không tìm thấy tài khoản người chơi với email hoặc số điện thoại này.');
        }
        const email = user.email || null;
        const phone = null;
        const managers = await this.seriesRepository.findManagers(seriesId);
        if (managers.some((m) => m.manager.userId === user.id)) {
            throw new common_1.BadRequestException('Người dùng này đã là quản trị viên hoặc nhân sự của chuỗi giải đấu.');
        }
        const invitations = await this.seriesRepository.findInvitations(seriesId);
        if (invitations.some((inv) => inv.status === 'PENDING' &&
            ((email && inv.email === email) || (phone && inv.phone === phone)))) {
            throw new common_1.BadRequestException('Đã có một lời mời đang chờ xử lý dành cho người dùng này.');
        }
        return this.seriesRepository.createInvitation(seriesId, email, phone, role);
    }
    async listInvitations(seriesId, userId, userRoles) {
        const series = await this.seriesRepository.findById(seriesId);
        if (!series) {
            throw new common_1.NotFoundException('Không tìm thấy chuỗi giải đấu.');
        }
        const isAuthorized = userRoles.includes('ADMIN') || series.organizerId === userId;
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền xem danh sách lời mời của chuỗi giải đấu này.');
        }
        return this.seriesRepository.findInvitations(seriesId);
    }
    async acceptInvitation(invitationId, currentUser) {
        const invitation = await this.seriesRepository.findInvitationById(invitationId);
        if (!invitation) {
            throw new common_1.NotFoundException('Không tìm thấy lời mời.');
        }
        if (invitation.status !== 'PENDING') {
            throw new common_1.BadRequestException('Lời mời này đã được xử lý hoặc không còn hiệu lực.');
        }
        const matchesEmail = invitation.email && currentUser.email === invitation.email;
        const matchesPhone = invitation.phone && currentUser.phoneNumber === invitation.phone;
        if (!matchesEmail && !matchesPhone) {
            throw new common_1.ForbiddenException('Tài khoản của bạn không khớp với thông tin trên lời mời.');
        }
        const currentUserId = currentUser.sub || currentUser.id;
        if (!currentUserId) {
            throw new common_1.ForbiddenException('Không tìm thấy thông tin định danh người dùng.');
        }
        const db = this.seriesRepository.getDbInstance();
        return await db.transaction(async (tx) => {
            await tx
                .update(schema.seriesInvitations)
                .set({ status: 'ACCEPTED' })
                .where((0, drizzle_orm_1.eq)(schema.seriesInvitations.id, invitationId));
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
    async rejectInvitation(invitationId, currentUser) {
        const invitation = await this.seriesRepository.findInvitationById(invitationId);
        if (!invitation) {
            throw new common_1.NotFoundException('Không tìm thấy lời mời.');
        }
        if (invitation.status !== 'PENDING') {
            throw new common_1.BadRequestException('Lời mời này đã được xử lý hoặc không còn hiệu lực.');
        }
        const matchesEmail = invitation.email && currentUser.email === invitation.email;
        const matchesPhone = invitation.phone && currentUser.phoneNumber === invitation.phone;
        if (!matchesEmail && !matchesPhone) {
            throw new common_1.ForbiddenException('Tài khoản của bạn không khớp với thông tin trên lời mời.');
        }
        return this.seriesRepository.updateInvitationStatus(invitationId, 'REJECTED');
    }
    async revokeManager(seriesId, managerUserId, userId, userRoles) {
        const series = await this.seriesRepository.findById(seriesId);
        if (!series) {
            throw new common_1.NotFoundException('Không tìm thấy chuỗi giải đấu.');
        }
        const isAuthorized = userRoles.includes('ADMIN') || series.organizerId === userId;
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Bạn không có quyền thu hồi nhân sự của chuỗi giải đấu này.');
        }
        if (series.organizerId === managerUserId) {
            throw new common_1.BadRequestException('Không thể thu hồi quyền của Chủ sở hữu chuỗi giải đấu.');
        }
        return this.seriesRepository.removeManager(seriesId, managerUserId);
    }
    async listManagers(seriesId) {
        const series = await this.seriesRepository.findById(seriesId);
        if (!series) {
            throw new common_1.NotFoundException('Không tìm thấy chuỗi giải đấu.');
        }
        return this.seriesRepository.findManagers(seriesId);
    }
    async calculateTourFinalsQualifiers(seriesId, legId, categoryId) {
        const leg = await this.seriesRepository.findLegById(legId);
        if (!leg || leg.seriesId !== seriesId) {
            throw new common_1.NotFoundException('Không tìm thấy chặng đấu trong chuỗi này.');
        }
        const series = await this.seriesRepository.findById(seriesId);
        if (!series) {
            throw new common_1.NotFoundException('Không tìm thấy chuỗi giải đấu.');
        }
        const rules = (leg.rulesOverride || series.rules);
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
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.seriesStandings.userId, schema.users.id))
            .innerJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.seriesStandings.legId, legId), (0, drizzle_orm_1.eq)(schema.seriesStandings.categoryId, categoryId)))
            .orderBy((0, drizzle_orm_1.desc)(schema.seriesStandings.totalPsrPoints));
        const events = await this.seriesRepository.findEventsByLegId(legId);
        const directEntryThreshold = rules?.directEntryThreshold || 2;
        const totalEventDirectSlots = events.length * directEntryThreshold;
        const validDirectQualifiers = standings.filter((s) => s.standing.directEntry && s.standing.eventsPlayed >= minStagesRequired);
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
};
exports.SeriesService = SeriesService;
exports.SeriesService = SeriesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [series_repository_1.SeriesRepository])
], SeriesService);
//# sourceMappingURL=series.service.js.map