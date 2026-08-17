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
exports.CreatePaymentDto = exports.PaymentPurpose = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var PaymentPurpose;
(function (PaymentPurpose) {
    PaymentPurpose["REGISTRATION_FEE"] = "REGISTRATION_FEE";
    PaymentPurpose["TOURNAMENT_PUBLISH_FEE"] = "TOURNAMENT_PUBLISH_FEE";
    PaymentPurpose["PLATFORM_FEE"] = "PLATFORM_FEE";
})(PaymentPurpose || (exports.PaymentPurpose = PaymentPurpose = {}));
class CreatePaymentDto {
    purpose;
    tournamentId;
    participantId;
    divisionId;
    amount;
}
exports.CreatePaymentDto = CreatePaymentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: PaymentPurpose, description: 'Mục đích thanh toán' }),
    (0, class_validator_1.IsEnum)(PaymentPurpose),
    __metadata("design:type", String)
], CreatePaymentDto.prototype, "purpose", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'uuid-tournament',
        description: 'ID của giải đấu cần thanh toán phí tham gia',
    }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreatePaymentDto.prototype, "tournamentId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-participant',
        description: 'ID của lượt đăng ký tham gia giải đấu (nếu có)',
    }),
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreatePaymentDto.prototype, "participantId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-division',
        description: 'ID hình thức thi đấu liên quan đến thanh toán',
    }),
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreatePaymentDto.prototype, "divisionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 100000,
        description: 'Số tiền thanh toán',
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreatePaymentDto.prototype, "amount", void 0);
//# sourceMappingURL=create-payment.dto.js.map