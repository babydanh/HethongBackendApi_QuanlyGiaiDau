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
exports.MediaWebhookDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class MediaWebhookDto {
    event;
    streamName;
    reason;
}
exports.MediaWebhookDto = MediaWebhookDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'on_publish', enum: ['on_publish', 'on_read', 'on_done', 'on_error'] }),
    (0, class_validator_1.IsIn)(['on_publish', 'on_read', 'on_done', 'on_error']),
    __metadata("design:type", String)
], MediaWebhookDto.prototype, "event", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'camera_abcd1234' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    __metadata("design:type", String)
], MediaWebhookDto.prototype, "streamName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Connection lost', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], MediaWebhookDto.prototype, "reason", void 0);
//# sourceMappingURL=media-webhook.dto.js.map