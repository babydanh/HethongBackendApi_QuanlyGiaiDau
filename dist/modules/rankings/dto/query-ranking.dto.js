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
exports.QueryRankingDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const cursor_pagination_dto_1 = require("../../../common/dto/cursor-pagination.dto");
class QueryRankingDto extends cursor_pagination_dto_1.CursorPaginationDto {
    page = 1;
    limit = 50;
    categoryId;
    matchType;
    scope = 'PUBLIC';
    communityId;
    provinceCode;
    genderRestriction;
}
exports.QueryRankingDto = QueryRankingDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 1, description: 'Trang hiện tại' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], QueryRankingDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 50, description: 'Số lượng / trang' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], QueryRankingDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'uuid-category',
        description: 'Bắt buộc lọc theo Category',
    }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], QueryRankingDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'SINGLES', description: 'Thể loại thi đấu (SINGLES/DOUBLES/MIXED_DOUBLES)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryRankingDto.prototype, "matchType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'PUBLIC', description: 'Scope của bảng xếp hạng (PUBLIC/COMMUNITY)', enum: ['PUBLIC', 'COMMUNITY'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['PUBLIC', 'COMMUNITY']),
    __metadata("design:type", String)
], QueryRankingDto.prototype, "scope", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'uuid-community', description: 'Lọc theo Community (bắt buộc khi scope = COMMUNITY)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], QueryRankingDto.prototype, "communityId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '79', description: 'Lọc theo mã tỉnh/thành phố (Khu vực)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryRankingDto.prototype, "provinceCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'MALE', description: 'Lọc theo giới tính (MALE/FEMALE/MIXED)', enum: ['MALE', 'FEMALE', 'MIXED'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['MALE', 'FEMALE', 'MIXED']),
    __metadata("design:type", String)
], QueryRankingDto.prototype, "genderRestriction", void 0);
//# sourceMappingURL=query-ranking.dto.js.map