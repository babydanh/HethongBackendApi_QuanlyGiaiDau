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
exports.MuteActionDto = exports.MuteType = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var MuteType;
(function (MuteType) {
    MuteType["MUTE"] = "MUTE";
    MuteType["BAN"] = "BAN";
})(MuteType || (exports.MuteType = MuteType = {}));
class MuteActionDto {
    userId;
    type;
    reason;
}
exports.MuteActionDto = MuteActionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID người dùng bị mute/ban', example: 'uuid' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], MuteActionDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: MuteType, description: 'MUTE = ẩn bình luận, BAN = cấm vĩnh viễn' }),
    (0, class_validator_1.IsEnum)(MuteType),
    __metadata("design:type", String)
], MuteActionDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Lý do mute/ban' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], MuteActionDto.prototype, "reason", void 0);
//# sourceMappingURL=mute-action.dto.js.map