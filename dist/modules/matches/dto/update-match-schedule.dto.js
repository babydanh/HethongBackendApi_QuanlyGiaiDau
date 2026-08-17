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
exports.UpdateMatchScheduleDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class UpdateMatchScheduleDto {
    courtName;
    courtAddress;
    refereeId;
    scheduledAt;
    matchConfig;
}
exports.UpdateMatchScheduleDto = UpdateMatchScheduleDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Sân số 1', description: 'Tên sân thi đấu' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateMatchScheduleDto.prototype, "courtName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '123 Đường ABC, Quận 1', description: 'Địa chỉ sân thi đấu' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateMatchScheduleDto.prototype, "courtAddress", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'uuid-referee', description: 'ID của trọng tài' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], UpdateMatchScheduleDto.prototype, "refereeId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-10-15T08:00:00Z', description: 'Thời gian thi đấu dự kiến' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], UpdateMatchScheduleDto.prototype, "scheduledAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Cấu hình ghi đè cho trận đấu cụ thể',
        example: { bestOf: 3, pointsPerSet: 21, deuceEnabled: true, tiebreakAt: 20, maxPoints: 30 }
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], UpdateMatchScheduleDto.prototype, "matchConfig", void 0);
//# sourceMappingURL=update-match-schedule.dto.js.map