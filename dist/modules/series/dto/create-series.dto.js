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
exports.CreateSeriesDto = exports.PsrPointConfigDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class PsrPointConfigDto {
    pointsByRank;
    directEntryThreshold;
    wildcardCount;
    exclusionRule;
    exclusionScope;
    description;
}
exports.PsrPointConfigDto = PsrPointConfigDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: { 1: 100, 2: 75, 3: 50, 5: 30, 9: 15, 17: 5 },
        description: 'Bản đồ thứ hạng sang điểm số PSR',
    }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], PsrPointConfigDto.prototype, "pointsByRank", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 2,
        description: 'Thứ hạng tối thiểu được Vé Thẳng (Vô địch & Á quân = 2)',
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PsrPointConfigDto.prototype, "directEntryThreshold", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 16,
        description: 'Số lượng vé vớt dựa trên điểm PSR',
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PsrPointConfigDto.prototype, "wildcardCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: 'Có áp dụng Exclusion Rule không',
    }),
    __metadata("design:type", Boolean)
], PsrPointConfigDto.prototype, "exclusionRule", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'CATEGORY',
        description: 'Phạm vi khóa đăng ký: CATEGORY hoặc ALL',
        enum: ['CATEGORY', 'ALL'],
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['CATEGORY', 'ALL']),
    __metadata("design:type", String)
], PsrPointConfigDto.prototype, "exclusionScope", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'Luật tính điểm chuẩn Superstar Cup',
        description: 'Mô tả luật tính điểm',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PsrPointConfigDto.prototype, "description", void 0);
class CreateSeriesDto {
    name;
    slug;
    description;
    bannerUrl;
    logoUrl;
    startDate;
    endDate;
    totalPrize;
    rules;
    visibility;
}
exports.CreateSeriesDto = CreateSeriesDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'Đường đến Superstars Cup 2026',
        description: 'Tên chuỗi giải đấu (Series)',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateSeriesDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'superstars-cup-2026',
        description: 'Slug SEO-friendly độc nhất',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateSeriesDto.prototype, "slug", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'Mô tả chi tiết về chuỗi giải đấu',
        description: 'Mô tả chi tiết bằng HTML',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateSeriesDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://...', description: 'Banner URL của chuỗi giải' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateSeriesDto.prototype, "bannerUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://...', description: 'Logo URL của chuỗi giải' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateSeriesDto.prototype, "logoUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-05-01T00:00:00Z', description: 'Ngày bắt đầu chặng 1' }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateSeriesDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-12-31T00:00:00Z', description: 'Ngày kết thúc chuỗi giải' }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateSeriesDto.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 500000000, description: 'Tổng giải thưởng của cả chuỗi' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateSeriesDto.prototype, "totalPrize", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: PsrPointConfigDto,
        description: 'Cấu hình luật và tính điểm PSR của chuỗi',
    }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", PsrPointConfigDto)
], CreateSeriesDto.prototype, "rules", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'PUBLIC',
        description: 'Chế độ hiển thị: PUBLIC hoặc PRIVATE',
        enum: ['PUBLIC', 'PRIVATE'],
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['PUBLIC', 'PRIVATE']),
    __metadata("design:type", String)
], CreateSeriesDto.prototype, "visibility", void 0);
//# sourceMappingURL=create-series.dto.js.map