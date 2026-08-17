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
exports.CreateRoomDto = exports.RoomType = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var RoomType;
(function (RoomType) {
    RoomType["DIRECT"] = "DIRECT";
    RoomType["GROUP"] = "GROUP";
    RoomType["SUPPORT"] = "SUPPORT";
    RoomType["CLUB"] = "CLUB";
})(RoomType || (exports.RoomType = RoomType = {}));
class CreateRoomDto {
    name;
    type;
    memberIds;
}
exports.CreateRoomDto = CreateRoomDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'Nhóm Tứ Kết A',
        description: 'Tên nhóm chat (bắt buộc nếu type=GROUP)',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateRoomDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'GROUP',
        enum: RoomType,
        description: 'Loại phòng chat',
    }),
    (0, class_validator_1.IsEnum)(RoomType),
    __metadata("design:type", String)
], CreateRoomDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: ['uuid-user-1', 'uuid-user-2'],
        description: 'Danh sách ID các thành viên cần add vào nhóm ban đầu',
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsUUID)('4', { each: true }),
    __metadata("design:type", Array)
], CreateRoomDto.prototype, "memberIds", void 0);
//# sourceMappingURL=create-room.dto.js.map