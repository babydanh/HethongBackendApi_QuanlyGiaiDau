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
exports.CreateMessageDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateMessageDto {
    roomId;
    messageText;
    attachmentsUrls;
    replyToId;
    type;
    metadata;
}
exports.CreateMessageDto = CreateMessageDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'uuid-room-id',
        description: 'ID của phòng chat',
    }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateMessageDto.prototype, "roomId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'Chào mọi người!',
        description: 'Nội dung tin nhắn text',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateMessageDto.prototype, "messageText", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: ['https://example.com/image.png'],
        description: 'Danh sách đính kèm (ảnh/video)',
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], CreateMessageDto.prototype, "attachmentsUrls", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-message-id',
        description: 'ID tin nhắn được trả lời/trích dẫn',
    }),
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateMessageDto.prototype, "replyToId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'TEXT',
        description: 'Loại tin nhắn (TEXT, POLL, TOURNAMENT_SHARE, LINK_PREVIEW)',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateMessageDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Dữ liệu mở rộng theo loại tin nhắn (Poll options, Tournament details, OG Metadata)',
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateMessageDto.prototype, "metadata", void 0);
//# sourceMappingURL=create-message.dto.js.map