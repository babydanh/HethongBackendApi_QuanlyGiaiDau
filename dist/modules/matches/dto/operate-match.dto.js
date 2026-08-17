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
exports.OperateMatchDto = exports.MATCH_OPERATION_ACTIONS = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
exports.MATCH_OPERATION_ACTIONS = [
    'WALKOVER',
    'NO_SHOW',
    'RETIREMENT',
    'DISQUALIFICATION',
    'OVERRIDE_RESULT',
    'POSTPONE',
    'ABANDON',
];
class OperateMatchDto {
    action;
    reason;
    winnerId;
}
exports.OperateMatchDto = OperateMatchDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: exports.MATCH_OPERATION_ACTIONS,
        description: 'Quyết định nghiệp vụ đặc biệt của BTC cho trận đấu',
        example: 'WALKOVER',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(exports.MATCH_OPERATION_ACTIONS),
    __metadata("design:type", String)
], OperateMatchDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Lý do bắt buộc để lưu vết nghiệp vụ',
        example: 'Đội đối thủ bỏ cuộc trước giờ thi đấu',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(5),
    __metadata("design:type", String)
], OperateMatchDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Participant thắng theo quyết định của BTC',
        example: '6d1d4f2b-2a7a-4c1f-9d8a-15a61d62b7b8',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], OperateMatchDto.prototype, "winnerId", void 0);
//# sourceMappingURL=operate-match.dto.js.map