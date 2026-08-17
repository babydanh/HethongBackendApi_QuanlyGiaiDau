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
exports.QueryMatchDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const cursor_pagination_dto_1 = require("../../../common/dto/cursor-pagination.dto");
class QueryMatchDto extends cursor_pagination_dto_1.CursorPaginationDto {
    page = 1;
    groupId;
    status;
    tournamentId;
    tournament_id;
    divisionId;
    division_id;
    categoryId;
    category_id;
    userId;
    publicOnly;
    isPublicOnly;
    bracketType;
    startDate;
    endDate;
    genderRestriction;
    matchType;
    city;
    isRanked;
}
exports.QueryMatchDto = QueryMatchDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 1, description: 'Trang hiện tại' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], QueryMatchDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-group',
        description: 'Lọc theo Bảng thi đấu (Group)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], QueryMatchDto.prototype, "groupId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'SCHEDULED',
        description: 'Lọc theo Trạng thái trận đấu',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryMatchDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-tournament',
        description: 'Lọc theo Giải đấu (Tournament)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], QueryMatchDto.prototype, "tournamentId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-tournament',
        description: 'Lọc theo Giải đấu (Tournament) (snake_case)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], QueryMatchDto.prototype, "tournament_id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-division',
        description: 'Lọc theo phân hạng / nội dung thi đấu',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], QueryMatchDto.prototype, "divisionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-division',
        description: 'Lọc theo phân hạng / nội dung thi đấu (snake_case)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], QueryMatchDto.prototype, "division_id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-category',
        description: 'Lọc theo danh mục môn thể thao (Category ID)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryMatchDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-category',
        description: 'Lọc theo danh mục môn thể thao (Category ID) (snake_case)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryMatchDto.prototype, "category_id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-user',
        description: 'Lọc theo User ID tham gia trận đấu',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], QueryMatchDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Chỉ lấy các trận đấu thuộc giải đấu PUBLIC',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true' || value === true),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], QueryMatchDto.prototype, "publicOnly", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Chỉ lấy các trận đấu thuộc giải đấu PUBLIC (alias)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true' || value === true),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], QueryMatchDto.prototype, "isPublicOnly", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'GROUP_STAGE_KNOCKOUT',
        description: 'Lọc theo thể thức thi đấu: SINGLE_ELIMINATION, DOUBLE_ELIMINATION, ROUND_ROBIN, GROUP_STAGE_KNOCKOUT',
        enum: ['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'GROUP_STAGE_KNOCKOUT'],
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryMatchDto.prototype, "bracketType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: '2026-07-20',
        description: 'Lọc trận đấu từ ngày (YYYY-MM-DD)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryMatchDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: '2026-07-25',
        description: 'Lọc trận đấu đến ngày (YYYY-MM-DD)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryMatchDto.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'MALE',
        description: 'Lọc theo giới tính giải đấu (MALE/FEMALE)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryMatchDto.prototype, "genderRestriction", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'SINGLES',
        description: 'Lọc theo hình thức thi đấu (SINGLES/DOUBLES/MIXED_DOUBLES)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryMatchDto.prototype, "matchType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'Hà Nội',
        description: 'Lọc theo thành phố của giải đấu',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryMatchDto.prototype, "city", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: true,
        description: 'Lọc theo giải đấu xếp hạng (isRanked)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true' || value === true),
    __metadata("design:type", Boolean)
], QueryMatchDto.prototype, "isRanked", void 0);
//# sourceMappingURL=query-match.dto.js.map