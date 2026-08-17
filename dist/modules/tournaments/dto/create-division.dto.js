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
exports.CreateDivisionDto = exports.DivisionBracketType = exports.MatchType = exports.GenderRestriction = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var GenderRestriction;
(function (GenderRestriction) {
    GenderRestriction["MALE"] = "MALE";
    GenderRestriction["FEMALE"] = "FEMALE";
    GenderRestriction["MIXED"] = "MIXED";
})(GenderRestriction || (exports.GenderRestriction = GenderRestriction = {}));
var MatchType;
(function (MatchType) {
    MatchType["SINGLES"] = "SINGLES";
    MatchType["DOUBLES"] = "DOUBLES";
    MatchType["MIXED_DOUBLES"] = "MIXED_DOUBLES";
})(MatchType || (exports.MatchType = MatchType = {}));
var DivisionBracketType;
(function (DivisionBracketType) {
    DivisionBracketType["SINGLE_ELIMINATION"] = "SINGLE_ELIMINATION";
    DivisionBracketType["DOUBLE_ELIMINATION"] = "DOUBLE_ELIMINATION";
    DivisionBracketType["ROUND_ROBIN"] = "ROUND_ROBIN";
    DivisionBracketType["GROUP_STAGE_KNOCKOUT"] = "GROUP_STAGE_KNOCKOUT";
    DivisionBracketType["GROUP_STAGE_THEN_KNOCKOUT"] = "GROUP_STAGE_THEN_KNOCKOUT";
})(DivisionBracketType || (exports.DivisionBracketType = DivisionBracketType = {}));
class CreateDivisionDto {
    name;
    matchType;
    genderRestriction;
    maxParticipants;
    entryFee;
    isConfigOverride;
    venueId;
    bracketType;
    roundConfig;
    startDate;
    registrationEndDate;
    minElo;
    maxElo;
    prizeDescription;
}
exports.CreateDivisionDto = CreateDivisionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Đôi Nam', description: 'Tên hình thức thi đấu' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(255),
    __metadata("design:type", String)
], CreateDivisionDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: MatchType, example: MatchType.DOUBLES }),
    (0, class_validator_1.IsEnum)(MatchType),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateDivisionDto.prototype, "matchType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: GenderRestriction, example: GenderRestriction.MALE }),
    (0, class_validator_1.IsEnum)(GenderRestriction),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateDivisionDto.prototype, "genderRestriction", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 32, minimum: 1 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateDivisionDto.prototype, "maxParticipants", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 150000, minimum: 0 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateDivisionDto.prototype, "entryFee", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: false, description: 'TRUE nếu division dùng cấu hình riêng' }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateDivisionDto.prototype, "isConfigOverride", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '9e6b3df3-1af0-4cae-b5f6-3df2dd6d0d89' }),
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateDivisionDto.prototype, "venueId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: DivisionBracketType, example: DivisionBracketType.SINGLE_ELIMINATION }),
    (0, class_validator_1.IsEnum)(DivisionBracketType),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateDivisionDto.prototype, "bracketType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: { setsToWin: 2, pointsPerSet: 21, winByTwo: true } }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateDivisionDto.prototype, "roundConfig", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-07-20T08:00:00Z' }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateDivisionDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-07-15T23:59:59Z' }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateDivisionDto.prototype, "registrationEndDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 1200, minimum: 0 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Object)
], CreateDivisionDto.prototype, "minElo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 1800, minimum: 0 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Object)
], CreateDivisionDto.prototype, "maxElo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Giải nhất 3.000.000đ' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateDivisionDto.prototype, "prizeDescription", void 0);
//# sourceMappingURL=create-division.dto.js.map