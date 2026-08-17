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
exports.LinkEventDto = exports.CreateLegDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateLegDto {
    name;
    order;
    startDate;
    endDate;
    directEntrySlots;
    wildcardSlots;
    rulesOverride;
}
exports.CreateLegDto = CreateLegDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Chặng 1: Vòng loại', description: 'Tên chặng đấu' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateLegDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: 'Thứ tự chặng đấu' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateLegDto.prototype, "order", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-05-01T00:00:00Z', description: 'Ngày bắt đầu chặng' }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLegDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-07-31T00:00:00Z', description: 'Ngày kết thúc chặng' }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLegDto.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 2, description: 'Số suất vé thẳng cho top đầu mỗi sự kiện' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateLegDto.prototype, "directEntrySlots", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 16, description: 'Số suất vé vớt tích lũy PSR cuối chặng' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateLegDto.prototype, "wildcardSlots", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Cấu hình ghi đè luật PSR cho chặng này (tùy chọn)' }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateLegDto.prototype, "rulesOverride", void 0);
class LinkEventDto {
    tournamentId;
    region;
    order;
    pointMultiplier;
}
exports.LinkEventDto = LinkEventDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'uuid-tournament', description: 'ID giải đấu độc lập cần liên kết' }),
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], LinkEventDto.prototype, "tournamentId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Tây Nguyên', description: 'Khu vực địa lý diễn ra giải' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], LinkEventDto.prototype, "region", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: 'Thứ tự của giải đấu trong chặng' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], LinkEventDto.prototype, "order", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 1.0, description: 'Hệ số điểm PSR của giải (ví dụ 1.0, 1.5)' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0.1),
    __metadata("design:type", Number)
], LinkEventDto.prototype, "pointMultiplier", void 0);
//# sourceMappingURL=leg.dto.js.map