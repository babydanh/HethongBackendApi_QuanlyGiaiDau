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
exports.VenuesController = void 0;
const common_1 = require("@nestjs/common");
const venues_service_1 = require("./venues.service");
const create_venue_dto_1 = require("./dto/create-venue.dto");
const update_venue_dto_1 = require("./dto/update-venue.dto");
const query_venue_dto_1 = require("./dto/query-venue.dto");
const create_venue_court_dto_1 = require("./dto/create-venue-court.dto");
const swagger_1 = require("@nestjs/swagger");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const enums_1 = require("../../common/constants/enums");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
let VenuesController = class VenuesController {
    venuesService;
    constructor(venuesService) {
        this.venuesService = venuesService;
    }
    async findAll(query) {
        return this.venuesService.findAll(query);
    }
    async findOne(id) {
        return this.venuesService.findOne(id);
    }
    async create(createVenueDto, user) {
        return this.venuesService.create(user.sub, createVenueDto);
    }
    async update(id, updateVenueDto, user) {
        return this.venuesService.update(id, user.sub, updateVenueDto);
    }
    async remove(id) {
        return this.venuesService.remove(id);
    }
    async addCourt(id, createVenueCourtDto) {
        return this.venuesService.addCourt(id, createVenueCourtDto);
    }
    async removeCourt(id, courtId) {
        return this.venuesService.removeCourt(id, courtId);
    }
};
exports.VenuesController = VenuesController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách địa điểm thi đấu' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_venue_dto_1.QueryVenueDto]),
    __metadata("design:returntype", Promise)
], VenuesController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Lấy chi tiết địa điểm thi đấu (kèm danh sách sân)',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], VenuesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tạo địa điểm thi đấu mới' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_venue_dto_1.CreateVenueDto, Object]),
    __metadata("design:returntype", Promise)
], VenuesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật địa điểm thi đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_venue_dto_1.UpdateVenueDto, Object]),
    __metadata("design:returntype", Promise)
], VenuesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Xóa địa điểm thi đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], VenuesController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/courts'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Thêm sân con vào địa điểm thi đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_venue_court_dto_1.CreateVenueCourtDto]),
    __metadata("design:returntype", Promise)
], VenuesController.prototype, "addCourt", null);
__decorate([
    (0, common_1.Delete)(':id/courts/:courtId'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xóa sân con khỏi địa điểm thi đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('courtId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], VenuesController.prototype, "removeCourt", null);
exports.VenuesController = VenuesController = __decorate([
    (0, swagger_1.ApiTags)('venues'),
    (0, common_1.Controller)('venues'),
    __metadata("design:paramtypes", [venues_service_1.VenuesService])
], VenuesController);
//# sourceMappingURL=venues.controller.js.map