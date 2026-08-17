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
exports.RegionsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const regions_service_1 = require("./regions.service");
const query_region_dto_1 = require("./dto/query-region.dto");
const public_decorator_1 = require("../../common/decorators/public.decorator");
let RegionsController = class RegionsController {
    regionsService;
    constructor(regionsService) {
        this.regionsService = regionsService;
    }
    async getProvinces(query) {
        return this.regionsService.getProvinces(query);
    }
    async getWards(query) {
        return this.regionsService.getWards(query);
    }
};
exports.RegionsController = RegionsController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('provinces'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách tỉnh/thành phố' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Danh sách tỉnh/thành phố' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_region_dto_1.QueryRegionDto]),
    __metadata("design:returntype", Promise)
], RegionsController.prototype, "getProvinces", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('wards'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách phường/xã trực thuộc tỉnh/thành phố' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Danh sách phường/xã' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_region_dto_1.QueryWardDto]),
    __metadata("design:returntype", Promise)
], RegionsController.prototype, "getWards", null);
exports.RegionsController = RegionsController = __decorate([
    (0, swagger_1.ApiTags)('regions'),
    (0, common_1.Controller)('regions'),
    __metadata("design:paramtypes", [regions_service_1.RegionsService])
], RegionsController);
//# sourceMappingURL=regions.controller.js.map