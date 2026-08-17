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
exports.QueryTournamentDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const cursor_pagination_dto_1 = require("../../../common/dto/cursor-pagination.dto");
class QueryTournamentDto extends cursor_pagination_dto_1.CursorPaginationDto {
    page = 1;
    limit = 10;
    search;
    categoryId;
    status;
    tournamentType;
    matchType;
    communityId;
    visibility;
    region;
    createdBy;
    startDate;
    endDate;
    bracketType;
    genderRestriction;
    isRanked;
}
exports.QueryTournamentDto = QueryTournamentDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 1, description: 'Trang hiện tại' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], QueryTournamentDto.prototype, "page", void 0);
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
], QueryTournamentDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Hà Nội', description: 'Từ khóa tìm kiếm' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryTournamentDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-category',
        description: 'Lọc theo môn thể thao',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], QueryTournamentDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'UPCOMING',
        description: 'Lọc theo trạng thái',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryTournamentDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'CLUB',
        description: 'Lọc theo loại giải đấu: CLUB hoặc PUBLIC',
        enum: ['CLUB', 'PUBLIC'],
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['CLUB', 'PUBLIC']),
    __metadata("design:type", String)
], QueryTournamentDto.prototype, "tournamentType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'DOUBLES',
        description: 'Lọc theo hình thức thi đấu: SINGLES, DOUBLES, MIXED_DOUBLES',
        enum: ['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'],
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['SINGLES', 'DOUBLES', 'MIXED_DOUBLES']),
    __metadata("design:type", String)
], QueryTournamentDto.prototype, "matchType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-community',
        description: 'Lọc theo ID cộng đồng',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], QueryTournamentDto.prototype, "communityId", void 0);
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
], QueryTournamentDto.prototype, "visibility", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Hồ Chí Minh', description: 'Lọc theo khu vực/tỉnh thành' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryTournamentDto.prototype, "region", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'uuid-user', description: 'Lọc theo ID người tạo' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryTournamentDto.prototype, "createdBy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-07-15', description: 'Lọc từ ngày bắt đầu giải đấu' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryTournamentDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-07-30', description: 'Lọc đến ngày kết thúc giải đấu' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], QueryTournamentDto.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'GROUP_STAGE_KNOCKOUT',
        description: 'Lọc theo thể thức thi đấu: SINGLE_ELIMINATION, DOUBLE_ELIMINATION, ROUND_ROBIN, GROUP_STAGE_KNOCKOUT',
        enum: ['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'GROUP_STAGE_KNOCKOUT'],
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'GROUP_STAGE_KNOCKOUT']),
    __metadata("design:type", String)
], QueryTournamentDto.prototype, "bracketType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'MALE',
        description: 'Lọc theo giới tính: MALE, FEMALE, MIXED',
        enum: ['MALE', 'FEMALE', 'MIXED'],
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['MALE', 'FEMALE', 'MIXED']),
    __metadata("design:type", String)
], QueryTournamentDto.prototype, "genderRestriction", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Lọc giải đấu xếp hạng ELO hoặc phong trào',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => {
        if (value === 'true' || value === true)
            return true;
        if (value === 'false' || value === false)
            return false;
        return undefined;
    }),
    __metadata("design:type", Boolean)
], QueryTournamentDto.prototype, "isRanked", void 0);
//# sourceMappingURL=query-tournament.dto.js.map