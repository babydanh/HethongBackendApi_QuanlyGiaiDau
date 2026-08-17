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
exports.UpdateEloDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class UpdateEloDto {
    winnerId;
    loserId;
    categoryId;
    matchId;
    score;
    matchType;
    communityId;
    genderRestriction;
}
exports.UpdateEloDto = UpdateEloDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'uuid-user-1',
        description: 'User ID của người thắng',
    }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], UpdateEloDto.prototype, "winnerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'uuid-user-2',
        description: 'User ID của người thua',
    }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], UpdateEloDto.prototype, "loserId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'uuid-category', description: 'Category ID' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], UpdateEloDto.prototype, "categoryId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'uuid-match', description: 'Match ID' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], UpdateEloDto.prototype, "matchId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 1,
        description: 'Tỉ số thực tế (1: thắng, 0.5: hoà)',
    }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UpdateEloDto.prototype, "score", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'SINGLES', description: 'Thể loại thi đấu (SINGLES/DOUBLES)' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateEloDto.prototype, "matchType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'uuid-community', description: 'Community ID (nếu có)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], UpdateEloDto.prototype, "communityId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'MALE', description: 'Gender restriction (MALE/FEMALE/MIXED)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateEloDto.prototype, "genderRestriction", void 0);
//# sourceMappingURL=update-elo.dto.js.map