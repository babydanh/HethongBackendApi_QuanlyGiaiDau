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
exports.QuerySeriesDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const cursor_pagination_dto_1 = require("../../../common/dto/cursor-pagination.dto");
class QuerySeriesDto extends cursor_pagination_dto_1.CursorPaginationDto {
    page = 1;
    limit = 10;
    search;
    status;
    visibility;
    organizerId;
}
exports.QuerySeriesDto = QuerySeriesDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 1, description: 'Trang hiện tại' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], QuerySeriesDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 10,
        description: 'Số lượng / trang (Tối đa 50)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Number)
], QuerySeriesDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Superstars', description: 'Từ khóa tìm kiếm theo tên hoặc mô tả' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QuerySeriesDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'ACTIVE',
        description: 'Lọc theo trạng thái chuỗi: DRAFT, ACTIVE, COMPLETED, CANCELLED',
        enum: ['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED']),
    __metadata("design:type", String)
], QuerySeriesDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'PUBLIC',
        description: 'Lọc theo chế độ hiển thị: PUBLIC hoặc PRIVATE',
        enum: ['PUBLIC', 'PRIVATE'],
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['PUBLIC', 'PRIVATE']),
    __metadata("design:type", String)
], QuerySeriesDto.prototype, "visibility", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'uuid-organizer', description: 'Lọc theo ID người tạo' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QuerySeriesDto.prototype, "organizerId", void 0);
//# sourceMappingURL=query-series.dto.js.map