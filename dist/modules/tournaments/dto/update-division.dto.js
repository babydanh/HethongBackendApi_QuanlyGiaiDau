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
exports.UpdateDivisionDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const create_division_dto_1 = require("./create-division.dto");
class UpdateDivisionDto {
    name;
    matchType;
    genderRestriction;
    maxParticipants;
    entryFee;
    status;
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
exports.UpdateDivisionDto = UpdateDivisionDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Đôi Nam' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.MaxLength)(255),
    __metadata("design:type", String)
], UpdateDivisionDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: create_division_dto_1.MatchType }),
    (0, class_validator_1.IsEnum)(create_division_dto_1.MatchType),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateDivisionDto.prototype, "matchType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: create_division_dto_1.GenderRestriction, nullable: true }),
    (0, class_validator_1.IsEnum)(create_division_dto_1.GenderRestriction),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], UpdateDivisionDto.prototype, "genderRestriction", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 32, nullable: true, minimum: 1 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Object)
], UpdateDivisionDto.prototype, "maxParticipants", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 150000, minimum: 0 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateDivisionDto.prototype, "entryFee", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'ACTIVE' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateDivisionDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: true }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], UpdateDivisionDto.prototype, "isConfigOverride", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], UpdateDivisionDto.prototype, "venueId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: create_division_dto_1.DivisionBracketType, nullable: true }),
    (0, class_validator_1.IsEnum)(create_division_dto_1.DivisionBracketType),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], UpdateDivisionDto.prototype, "bracketType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: { setsToWin: 2, pointsPerSet: 21, winByTwo: true }, nullable: true }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], UpdateDivisionDto.prototype, "roundConfig", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-07-20T08:00:00Z', nullable: true }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], UpdateDivisionDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-07-15T23:59:59Z', nullable: true }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], UpdateDivisionDto.prototype, "registrationEndDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 1200, nullable: true, minimum: 0 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Object)
], UpdateDivisionDto.prototype, "minElo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 1800, nullable: true, minimum: 0 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Object)
], UpdateDivisionDto.prototype, "maxElo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Giải nhất 3.000.000đ', nullable: true }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], UpdateDivisionDto.prototype, "prizeDescription", void 0);
//# sourceMappingURL=update-division.dto.js.map