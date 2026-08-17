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
exports.RemoveDeviceTokenDto = exports.RegisterDeviceTokenDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class RegisterDeviceTokenDto {
    token;
    platform;
    deviceInfo;
}
exports.RegisterDeviceTokenDto = RegisterDeviceTokenDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'FCM Device Registration Token' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], RegisterDeviceTokenDto.prototype, "token", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Platform', enum: ['ANDROID', 'IOS', 'WEB'], default: 'ANDROID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['ANDROID', 'IOS', 'WEB']),
    __metadata("design:type", String)
], RegisterDeviceTokenDto.prototype, "platform", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Device model / OS details' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterDeviceTokenDto.prototype, "deviceInfo", void 0);
class RemoveDeviceTokenDto {
    token;
}
exports.RemoveDeviceTokenDto = RemoveDeviceTokenDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'FCM Device Registration Token to remove' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], RemoveDeviceTokenDto.prototype, "token", void 0);
//# sourceMappingURL=register-device-token.dto.js.map