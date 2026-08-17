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
exports.CreateCommunityPostDto = exports.CreatePollDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class CreatePollDto {
    question;
    options;
    allowMultipleAnswers;
    allowAddOptions;
    expiresAt;
}
exports.CreatePollDto = CreatePollDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(300),
    __metadata("design:type", String)
], CreatePollDto.prototype, "question", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(2),
    (0, class_validator_1.ArrayMaxSize)(20),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.MinLength)(1, { each: true }),
    (0, class_validator_1.MaxLength)(150, { each: true }),
    __metadata("design:type", Array)
], CreatePollDto.prototype, "options", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreatePollDto.prototype, "allowMultipleAnswers", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreatePollDto.prototype, "allowAddOptions", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreatePollDto.prototype, "expiresAt", void 0);
class CreateCommunityPostDto {
    body;
    mediaUrls;
    topics;
    mentions;
    poll;
}
exports.CreateCommunityPostDto = CreateCommunityPostDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ maxLength: 5000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(5000),
    __metadata("design:type", String)
], CreateCommunityPostDto.prototype, "body", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [String], maxItems: 10 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(10),
    (0, class_validator_1.IsUrl)({}, { each: true }),
    __metadata("design:type", Array)
], CreateCommunityPostDto.prototype, "mediaUrls", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [String], maxItems: 5 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(5),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.MaxLength)(40, { each: true }),
    __metadata("design:type", Array)
], CreateCommunityPostDto.prototype, "topics", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [String], maxItems: 20 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(20),
    (0, class_validator_1.ArrayUnique)(),
    (0, class_validator_1.IsUUID)('4', { each: true }),
    __metadata("design:type", Array)
], CreateCommunityPostDto.prototype, "mentions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: () => CreatePollDto }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => CreatePollDto),
    __metadata("design:type", CreatePollDto)
], CreateCommunityPostDto.prototype, "poll", void 0);
//# sourceMappingURL=create-community-post.dto.js.map