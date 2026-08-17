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
exports.CreateTournamentDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateTournamentDto {
    tournamentType;
    matchType;
    bannerUrl;
    logoUrl;
    galleryImages;
    registrationStartDate;
    registrationEndDate;
    maxParticipants;
    prizeDescription;
    prizes;
    contactInfo;
    visibility;
    genderRestriction;
    name;
    categoryId;
    communityId;
    description;
    sportRules;
    tournamentConfig;
    entryFee;
    platformFeePercentage;
    startDate;
    endDate;
    venueId;
    parentId;
    city;
    isRanked;
}
exports.CreateTournamentDto = CreateTournamentDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'CLUB',
        description: 'Loại giải đấu: CLUB hoặc PUBLIC',
        enum: ['CLUB', 'PUBLIC'],
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsIn)(['CLUB', 'PUBLIC']),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "tournamentType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'DOUBLES',
        description: 'Hình thức thi đấu: SINGLES, DOUBLES, MIXED_DOUBLES',
        enum: ['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'],
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['SINGLES', 'DOUBLES', 'MIXED_DOUBLES']),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "matchType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://...', description: 'Banner giải đấu' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "bannerUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://...', description: 'Logo giải đấu' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "logoUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: ['https://...'], description: 'Ảnh gallery (chỉ giải PUBLIC)', type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], CreateTournamentDto.prototype, "galleryImages", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-10-01T00:00:00Z', description: 'Ngày mở đăng ký' }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "registrationStartDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-10-14T00:00:00Z', description: 'Ngày đóng đăng ký' }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "registrationEndDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 16, description: 'Số đội/VĐV tối đa' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(2),
    __metadata("design:type", Number)
], CreateTournamentDto.prototype, "maxParticipants", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Tổng giải thưởng 10tr', description: 'Mô tả giải thưởng' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "prizeDescription", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: [], description: 'Giải thưởng chi tiết' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], CreateTournamentDto.prototype, "prizes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: {}, description: 'Thông tin liên hệ BTC' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateTournamentDto.prototype, "contactInfo", void 0);
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
], CreateTournamentDto.prototype, "visibility", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'MIXED',
        description: 'Ràng buộc giới tính: MALE, FEMALE, MIXED',
        enum: ['MALE', 'FEMALE', 'MIXED'],
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['MALE', 'FEMALE', 'MIXED']),
    __metadata("design:type", Object)
], CreateTournamentDto.prototype, "genderRestriction", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'Giải Quần Vợt Mùa Thu 2026',
        description: 'Tên giải đấu',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'uuid-category',
        description: 'ID môn thể thao (Category)',
    }),
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-community',
        description: 'ID cộng đồng tổ chức (nếu có)',
    }),
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "communityId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'Mô tả chi tiết giải đấu',
        description: 'Mô tả giải đấu',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: { format: 'Singles', setsToWin: 2 },
        description: 'Cấu hình luật chơi thể thao',
    }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateTournamentDto.prototype, "sportRules", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: { bracketType: 'SINGLE_ELIMINATION', maxTeams: 16 },
        description: 'Cấu hình giải đấu',
    }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CreateTournamentDto.prototype, "tournamentConfig", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 500000, description: 'Phí tham gia' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateTournamentDto.prototype, "entryFee", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 5.0, description: 'Phần trăm phí nền tảng' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], CreateTournamentDto.prototype, "platformFeePercentage", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: '2026-10-15T00:00:00Z',
        description: 'Ngày bắt đầu',
    }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: '2026-10-30T00:00:00Z',
        description: 'Ngày kết thúc',
    }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-venue',
        description: 'ID địa điểm thi đấu',
    }),
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "venueId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-parent-tournament',
        description: 'ID giải đấu cha (chuỗi giải đấu / nhiều thể loại)',
    }),
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "parentId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'Hải Dương',
        description: 'Tỉnh/Thành phố diễn ra giải đấu',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "city", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: true, description: 'Giải đấu có tính điểm ELO/hạng không' }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateTournamentDto.prototype, "isRanked", void 0);
//# sourceMappingURL=create-tournament.dto.js.map