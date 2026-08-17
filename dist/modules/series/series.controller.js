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
exports.OrganizerSeriesController = exports.SeriesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const series_service_1 = require("./series.service");
const create_series_dto_1 = require("./dto/create-series.dto");
const update_series_dto_1 = require("./dto/update-series.dto");
const query_series_dto_1 = require("./dto/query-series.dto");
const leg_dto_1 = require("./dto/leg.dto");
const query_standings_dto_1 = require("./dto/query-standings.dto");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const verified_decorator_1 = require("../../common/decorators/verified.decorator");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const enums_1 = require("../../common/constants/enums");
let SeriesController = class SeriesController {
    seriesService;
    constructor(seriesService) {
        this.seriesService = seriesService;
    }
    async findAll(query) {
        return this.seriesService.findAll(query);
    }
    async findOne(slug) {
        return this.seriesService.findOne(slug);
    }
    async findLegs(id) {
        return this.seriesService.findLegs(id);
    }
    async findEvents(id, legId) {
        return this.seriesService.findEvents(legId);
    }
    async getStandings(id, query) {
        return this.seriesService.getStandings(id, query);
    }
    async getFinalsQualifiers(id, legId, categoryId) {
        return this.seriesService.calculateTourFinalsQualifiers(id, legId, categoryId);
    }
};
exports.SeriesController = SeriesController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách các chuỗi giải đấu công khai' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_series_dto_1.QuerySeriesDto]),
    __metadata("design:returntype", Promise)
], SeriesController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':slug'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy chi tiết chuỗi giải đấu theo ID hoặc slug' }),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SeriesController.prototype, "findOne", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id/legs'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách các chặng đấu của chuỗi' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SeriesController.prototype, "findLegs", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id/legs/:legId/events'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách các sự kiện trong một chặng đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('legId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], SeriesController.prototype, "findEvents", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id/standings'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy bảng xếp hạng PSR của chuỗi' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, query_standings_dto_1.QueryStandingsDto]),
    __metadata("design:returntype", Promise)
], SeriesController.prototype, "getStandings", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id/legs/:legId/categories/:categoryId/finals-qualifiers'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách VĐV đủ điều kiện tham gia vòng Chung kết tổng chặng' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('legId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('categoryId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], SeriesController.prototype, "getFinalsQualifiers", null);
exports.SeriesController = SeriesController = __decorate([
    (0, swagger_1.ApiTags)('series'),
    (0, common_1.Controller)('series'),
    __metadata("design:paramtypes", [series_service_1.SeriesService])
], SeriesController);
let OrganizerSeriesController = class OrganizerSeriesController {
    seriesService;
    constructor(seriesService) {
        this.seriesService = seriesService;
    }
    async create(data, user) {
        return this.seriesService.create(user.sub, data);
    }
    async update(id, data, user) {
        return this.seriesService.update(id, user.sub, data, [user.role]);
    }
    async remove(id, user) {
        return this.seriesService.remove(id, user.sub, [user.role]);
    }
    async createLeg(id, data, user) {
        return this.seriesService.createLeg(id, user.sub, data, [user.role]);
    }
    async updateLeg(id, legId, data, user) {
        return this.seriesService.updateLeg(id, legId, user.sub, data, [user.role]);
    }
    async deleteLeg(id, legId, user) {
        return this.seriesService.deleteLeg(id, legId, user.sub, [user.role]);
    }
    async linkTournament(id, legId, data, user) {
        return this.seriesService.linkTournament(id, legId, user.sub, data, [user.role]);
    }
    async unlinkTournament(id, legId, eventId, user) {
        return this.seriesService.unlinkTournament(id, eventId, user.sub, [user.role]);
    }
    async resetSeason(id, user) {
        return this.seriesService.resetSeason(id, user.sub, [user.role]);
    }
};
exports.OrganizerSeriesController = OrganizerSeriesController;
__decorate([
    (0, common_1.Post)(),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tạo chuỗi giải đấu mới' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_series_dto_1.CreateSeriesDto, Object]),
    __metadata("design:returntype", Promise)
], OrganizerSeriesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật thông tin chuỗi giải đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_series_dto_1.UpdateSeriesDto, Object]),
    __metadata("design:returntype", Promise)
], OrganizerSeriesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xóa chuỗi giải đấu (Soft Delete)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], OrganizerSeriesController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/legs'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiOperation)({ summary: 'Thêm chặng đấu mới vào chuỗi' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, leg_dto_1.CreateLegDto, Object]),
    __metadata("design:returntype", Promise)
], OrganizerSeriesController.prototype, "createLeg", null);
__decorate([
    (0, common_1.Patch)(':id/legs/:legId'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật chặng đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('legId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], OrganizerSeriesController.prototype, "updateLeg", null);
__decorate([
    (0, common_1.Delete)(':id/legs/:legId'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xóa chặng đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('legId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], OrganizerSeriesController.prototype, "deleteLeg", null);
__decorate([
    (0, common_1.Post)(':id/legs/:legId/events'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiOperation)({ summary: 'Liên kết giải đấu vào chặng' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('legId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, leg_dto_1.LinkEventDto, Object]),
    __metadata("design:returntype", Promise)
], OrganizerSeriesController.prototype, "linkTournament", null);
__decorate([
    (0, common_1.Delete)(':id/legs/:legId/events/:eventId'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiOperation)({ summary: 'Hủy liên kết giải đấu khỏi chặng' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('legId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('eventId', common_1.ParseUUIDPipe)),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], OrganizerSeriesController.prototype, "unlinkTournament", null);
__decorate([
    (0, common_1.Post)(':id/reset-season'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiOperation)({ summary: 'Reset điểm tích lũy của chuỗi giải đấu cho mùa giải mới' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], OrganizerSeriesController.prototype, "resetSeason", null);
exports.OrganizerSeriesController = OrganizerSeriesController = __decorate([
    (0, swagger_1.ApiTags)('organizer-series'),
    (0, common_1.Controller)('organizer/series'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ORGANIZER, enums_1.UserRole.ADMIN),
    __metadata("design:paramtypes", [series_service_1.SeriesService])
], OrganizerSeriesController);
//# sourceMappingURL=series.controller.js.map