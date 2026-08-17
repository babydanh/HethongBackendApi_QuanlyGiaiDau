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
exports.CategoriesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const categories_service_1 = require("./categories.service");
const create_category_dto_1 = require("./dto/create-category.dto");
const update_category_dto_1 = require("./dto/update-category.dto");
const query_category_dto_1 = require("./dto/query-category.dto");
const create_elo_tier_dto_1 = require("./dto/create-elo-tier.dto");
const update_elo_tier_dto_1 = require("./dto/update-elo-tier.dto");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const enums_1 = require("../../common/constants/enums");
let CategoriesController = class CategoriesController {
    categoriesService;
    constructor(categoriesService) {
        this.categoriesService = categoriesService;
    }
    async findAll(query) {
        return await this.categoriesService.findAllCategories(query);
    }
    async findAllForAdmin(query) {
        return await this.categoriesService.findAllAdminCategories(query);
    }
    async findOne(id) {
        return await this.categoriesService.findCategoryById(id);
    }
    async create(createCategoryDto) {
        return await this.categoriesService.createCategory(createCategoryDto);
    }
    async update(id, updateCategoryDto) {
        return await this.categoriesService.updateCategory(id, updateCategoryDto);
    }
    async remove(id) {
        return await this.categoriesService.deleteCategory(id);
    }
    async findEloTiers(id) {
        return await this.categoriesService.findEloTiersByCategory(id);
    }
    async createEloTier(id, createEloTierDto) {
        return await this.categoriesService.createEloTier(id, createEloTierDto);
    }
    async updateEloTier(categoryId, tierId, updateEloTierDto) {
        return await this.categoriesService.updateEloTier(tierId, updateEloTierDto);
    }
    async removeEloTier(categoryId, tierId) {
        return await this.categoriesService.deleteEloTier(tierId);
    }
};
exports.CategoriesController = CategoriesController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.SkipThrottle)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách môn thể thao (categories)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Danh sách môn thể thao' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_category_dto_1.QueryCategoryDto]),
    __metadata("design:returntype", Promise)
], CategoriesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('admin/all'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy toàn bộ môn thể thao cho admin, gồm cả môn đã tắt' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Danh sách toàn bộ môn thể thao' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_category_dto_1.QueryCategoryDto]),
    __metadata("design:returntype", Promise)
], CategoriesController.prototype, "findAllForAdmin", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.SkipThrottle)(),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy chi tiết 1 môn thể thao' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Chi tiết môn thể thao' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Không tìm thấy' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CategoriesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tạo môn thể thao mới (Chỉ ADMIN)' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Tạo thành công' }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'Slug đã tồn tại' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_category_dto_1.CreateCategoryDto]),
    __metadata("design:returntype", Promise)
], CategoriesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật môn thể thao (Chỉ ADMIN)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Cập nhật thành công' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_category_dto_1.UpdateCategoryDto]),
    __metadata("design:returntype", Promise)
], CategoriesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xóa môn thể thao (Chỉ ADMIN)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Xóa thành công' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CategoriesController.prototype, "remove", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.SkipThrottle)(),
    (0, common_1.Get)(':id/elo-tiers'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách các bậc ELO của 1 môn thể thao' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Danh sách bậc ELO' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CategoriesController.prototype, "findEloTiers", null);
__decorate([
    (0, common_1.Post)(':id/elo-tiers'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Thêm bậc ELO cho môn thể thao (Chỉ ADMIN)' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Tạo thành công' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_elo_tier_dto_1.CreateEloTierDto]),
    __metadata("design:returntype", Promise)
], CategoriesController.prototype, "createEloTier", null);
__decorate([
    (0, common_1.Patch)(':categoryId/elo-tiers/:tierId'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật bậc ELO (Chỉ ADMIN)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Cập nhật thành công' }),
    __param(0, (0, common_1.Param)('categoryId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('tierId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_elo_tier_dto_1.UpdateEloTierDto]),
    __metadata("design:returntype", Promise)
], CategoriesController.prototype, "updateEloTier", null);
__decorate([
    (0, common_1.Delete)(':categoryId/elo-tiers/:tierId'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xóa bậc ELO (Chỉ ADMIN)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Xóa thành công' }),
    __param(0, (0, common_1.Param)('categoryId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('tierId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CategoriesController.prototype, "removeEloTier", null);
exports.CategoriesController = CategoriesController = __decorate([
    (0, swagger_1.ApiTags)('categories'),
    (0, common_1.Controller)('categories'),
    __metadata("design:paramtypes", [categories_service_1.CategoriesService])
], CategoriesController);
//# sourceMappingURL=categories.controller.js.map