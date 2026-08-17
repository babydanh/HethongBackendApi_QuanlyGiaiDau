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
exports.PayoutRequestDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class PayoutRequestDto {
    tournamentId;
    amountRequested;
    bankName;
    bankAccountNumber;
    bankAccountName;
}
exports.PayoutRequestDto = PayoutRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'uuid-tournament',
        description: 'ID của giải đấu cần rút tiền',
    }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], PayoutRequestDto.prototype, "tournamentId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 10000000,
        description: 'Số tiền muốn rút',
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(10000),
    __metadata("design:type", Number)
], PayoutRequestDto.prototype, "amountRequested", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'Vietcombank',
        description: 'Tên ngân hàng',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], PayoutRequestDto.prototype, "bankName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '0123456789',
        description: 'Số tài khoản',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], PayoutRequestDto.prototype, "bankAccountNumber", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'NGUYEN VAN A',
        description: 'Tên chủ tài khoản',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], PayoutRequestDto.prototype, "bankAccountName", void 0);
//# sourceMappingURL=payout-request.dto.js.map