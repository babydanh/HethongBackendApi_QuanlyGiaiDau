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
exports.QueryCommunityDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const cursor_pagination_dto_1 = require("../../../common/dto/cursor-pagination.dto");
class QueryCommunityDto extends cursor_pagination_dto_1.CursorPaginationDto {
    page = 1;
    limit = 10;
    search;
    all;
    status;
    lat;
    lng;
    radiusKm;
    region;
    categoryId;
    provinceCode;
}
exports.QueryCommunityDto = QueryCommunityDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 1, description: 'Trang hiện tại' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => Number(value)),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], QueryCommunityDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 10,
        description: 'Số lượng / trang (Tối đa 50)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => Number(value)),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Number)
], QueryCommunityDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Tìm kiếm theo tên' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryCommunityDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Lấy tất cả không giới hạn status' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], QueryCommunityDto.prototype, "all", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: ['ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'INACTIVE', 'DEACTIVATED', 'SUSPENDED'],
        description: 'Lọc theo trạng thái',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'INACTIVE', 'DEACTIVATED', 'SUSPENDED']),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryCommunityDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Vĩ độ để tìm quanh đây' }),
    (0, class_validator_1.IsLatitude)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryCommunityDto.prototype, "lat", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Kinh độ để tìm quanh đây' }),
    (0, class_validator_1.IsLongitude)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryCommunityDto.prototype, "lng", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Bán kính tìm kiếm (km)', default: 10 }),
    (0, class_transformer_1.Transform)(({ value }) => Number(value)),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryCommunityDto.prototype, "radiusKm", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Hồ Chí Minh', description: 'Lọc theo khu vực/tỉnh thành' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryCommunityDto.prototype, "region", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Lọc theo ID môn thể thao' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryCommunityDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Lọc theo mã tỉnh thành' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryCommunityDto.prototype, "provinceCode", void 0);
//# sourceMappingURL=query-community.dto.js.map