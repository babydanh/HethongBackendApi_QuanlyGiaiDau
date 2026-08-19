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
exports.ImportParticipantsDto = exports.ParticipantImportItemDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class ParticipantImportItemDto {
    teamName;
    player1Name;
    player1Email;
    player1Phone;
    player2Name;
    player2Email;
    player2Phone;
    elo;
    isPaid;
    autoApprove;
    customResponses;
}
exports.ParticipantImportItemDto = ParticipantImportItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tên đội / cặp đấu hoặc tên VĐV' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ParticipantImportItemDto.prototype, "teamName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Họ tên VĐV 1' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ParticipantImportItemDto.prototype, "player1Name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Email VĐV 1' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ParticipantImportItemDto.prototype, "player1Email", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'SĐT VĐV 1' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ParticipantImportItemDto.prototype, "player1Phone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Họ tên VĐV 2 (nếu giải đôi)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ParticipantImportItemDto.prototype, "player2Name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Email VĐV 2' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ParticipantImportItemDto.prototype, "player2Email", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'SĐT VĐV 2' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ParticipantImportItemDto.prototype, "player2Phone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Điểm trình / ELO khởi tạo' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ParticipantImportItemDto.prototype, "elo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Đã thanh toán lệ phí hay chưa' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ParticipantImportItemDto.prototype, "isPaid", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Tự động duyệt hồ sơ (APPROVED)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ParticipantImportItemDto.prototype, "autoApprove", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Ghi chú / câu trả lời custom form' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ParticipantImportItemDto.prototype, "customResponses", void 0);
class ImportParticipantsDto {
    divisionId;
    participants;
    sendInvitationEmail;
}
exports.ImportParticipantsDto = ImportParticipantsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'ID của division / nội dung thi đấu' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ImportParticipantsDto.prototype, "divisionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Danh sách VĐV / Đội cần nhập', type: [ParticipantImportItemDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ParticipantImportItemDto),
    __metadata("design:type", Array)
], ImportParticipantsDto.prototype, "participants", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Tự động gửi email thư mời kích hoạt tài khoản' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ImportParticipantsDto.prototype, "sendInvitationEmail", void 0);
//# sourceMappingURL=import-participants.dto.js.map