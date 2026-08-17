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
exports.CreateEloTierDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateEloTierDto {
    name;
    minElo;
    maxElo;
    iconUrl;
}
exports.CreateEloTierDto = CreateEloTierDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Advanced', description: 'Tên bậc ELO' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateEloTierDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 2000, description: 'Điểm ELO tối thiểu' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateEloTierDto.prototype, "minElo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 2500, description: 'Điểm ELO tối đa' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateEloTierDto.prototype, "maxElo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'https://example.com/icon.png',
        description: 'URL ảnh icon của bậc ELO',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateEloTierDto.prototype, "iconUrl", void 0);
//# sourceMappingURL=create-elo-tier.dto.js.map