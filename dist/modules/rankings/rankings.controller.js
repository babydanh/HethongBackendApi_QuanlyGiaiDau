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
exports.RankingsController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const rankings_service_1 = require("./rankings.service");
const football_team_elo_service_1 = require("./football-team-elo.service");
const query_ranking_dto_1 = require("./dto/query-ranking.dto");
const update_elo_dto_1 = require("./dto/update-elo.dto");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const enums_1 = require("../../common/constants/enums");
let RankingsController = class RankingsController {
    rankingsService;
    footballTeamEloService;
    constructor(rankingsService, footballTeamEloService) {
        this.rankingsService = rankingsService;
        this.footballTeamEloService = footballTeamEloService;
    }
    async getFootballTeamLeaderboard(query) {
        return this.footballTeamEloService.getLeaderboard(query.categoryId, query.limit, query.cursor, query.communityId);
    }
    async getLeaderboard(query) {
        return this.rankingsService.getLeaderboard(query);
    }
    async getUserRankings(userId) {
        return this.rankingsService.getUserRankings(userId);
    }
    async getEloHistory(userId, categoryId, scope, communityId, limit, cursor) {
        return this.rankingsService.getEloHistory(userId, {
            categoryId,
            scope,
            communityId,
            limit: limit ? Number(limit) : 20,
            cursor,
        });
    }
    async updateElo(updateEloDto) {
        return this.rankingsService.updateMatchElo(updateEloDto);
    }
};
exports.RankingsController = RankingsController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('football-teams'),
    (0, swagger_1.ApiOperation)({ summary: 'Bảng xếp hạng ELO bóng đá theo đội' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_ranking_dto_1.QueryRankingDto]),
    __metadata("design:returntype", Promise)
], RankingsController.prototype, "getFootballTeamLeaderboard", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, throttler_1.Throttle)({ default: { limit: 1800, ttl: 60000 } }),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy bảng xếp hạng theo môn thể thao' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_ranking_dto_1.QueryRankingDto]),
    __metadata("design:returntype", Promise)
], RankingsController.prototype, "getLeaderboard", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('user/:userId'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy tổng hợp ELO của user (Public + các CLB)' }),
    __param(0, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RankingsController.prototype, "getUserRankings", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('user/:userId/history'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy lịch sử biến động ELO của user' }),
    __param(0, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)('categoryId')),
    __param(2, (0, common_1.Query)('scope')),
    __param(3, (0, common_1.Query)('communityId')),
    __param(4, (0, common_1.Query)('limit')),
    __param(5, (0, common_1.Query)('cursor')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Number, String]),
    __metadata("design:returntype", Promise)
], RankingsController.prototype, "getEloHistory", null);
__decorate([
    (0, common_1.Post)('update-elo'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Tính lại ELO cho 1 trận đấu (Admin)' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_elo_dto_1.UpdateEloDto]),
    __metadata("design:returntype", Promise)
], RankingsController.prototype, "updateElo", null);
exports.RankingsController = RankingsController = __decorate([
    (0, swagger_1.ApiTags)('rankings'),
    (0, common_1.Controller)('rankings'),
    __metadata("design:paramtypes", [rankings_service_1.RankingsService,
        football_team_elo_service_1.FootballTeamEloService])
], RankingsController);
//# sourceMappingURL=rankings.controller.js.map