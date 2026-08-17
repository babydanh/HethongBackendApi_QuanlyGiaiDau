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
exports.UpdateClubRoomDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class UpdateClubRoomDto {
    name;
    clubAvatar;
    isAnnouncementOnly;
    slowModeSeconds;
}
exports.UpdateClubRoomDto = UpdateClubRoomDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Tên hiển thị mới của phòng chat' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateClubRoomDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Avatar mới của phòng chat CLB' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateClubRoomDto.prototype, "clubAvatar", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Chế độ chỉ Ban Quản Trị được gửi tin' }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], UpdateClubRoomDto.prototype, "isAnnouncementOnly", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Số giây giãn cách giữa các tin nhắn (slow mode)' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(3600),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateClubRoomDto.prototype, "slowModeSeconds", void 0);
//# sourceMappingURL=update-club-room.dto.js.map