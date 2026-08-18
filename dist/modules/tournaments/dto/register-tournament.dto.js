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
exports.RegisterTournamentDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class RegisterTournamentDto {
    teamName;
    memberIds;
    reserveMemberIds;
    footballTeamId;
    partnerEmailOrPhone;
    divisionId;
    tournamentDivisionId;
    matchType;
    rankingConsent;
    customResponses;
}
exports.RegisterTournamentDto = RegisterTournamentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tên đội tham gia' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], RegisterTournamentDto.prototype, "teamName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Danh sách ID các thành viên trong đội', type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)('4', { each: true }),
    __metadata("design:type", Array)
], RegisterTournamentDto.prototype, "memberIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Danh sách ID cầu thủ dự bị của đội bóng', type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)('4', { each: true }),
    __metadata("design:type", Array)
], RegisterTournamentDto.prototype, "reserveMemberIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Đội bóng đã tạo trước đó dùng cho nội dung bóng đá' }),
    (0, class_validator_1.IsUUID)('4'),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], RegisterTournamentDto.prototype, "footballTeamId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Email hoặc SĐT của đồng đội (cho đánh đôi)' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(/^(?:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|(?:\+84|0[3|5|7|8|9])\d{8})$/, {
        message: 'Đồng đội phải là Email hoặc Số điện thoại Việt Nam hợp lệ',
    }),
    __metadata("design:type", String)
], RegisterTournamentDto.prototype, "partnerEmailOrPhone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'ID hình thức thi đấu muốn đăng ký' }),
    (0, class_validator_1.IsUUID)('4'),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], RegisterTournamentDto.prototype, "divisionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'ID hình thức thi đấu muốn đăng ký' }),
    (0, class_validator_1.IsUUID)('4'),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], RegisterTournamentDto.prototype, "tournamentDivisionId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Loại đăng ký', enum: ['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['SINGLES', 'DOUBLES', 'MIXED_DOUBLES']),
    __metadata("design:type", String)
], RegisterTournamentDto.prototype, "matchType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Nguoi dang ky dong y gui ket qua va diem ELO len bang xep hang',
        default: false,
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], RegisterTournamentDto.prototype, "rankingConsent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Câu trả lời cho form đăng ký tùy chỉnh', type: Object }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], RegisterTournamentDto.prototype, "customResponses", void 0);
//# sourceMappingURL=register-tournament.dto.js.map