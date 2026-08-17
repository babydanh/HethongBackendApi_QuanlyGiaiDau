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
exports.TournamentAdminActionDto = exports.QueryReportsDto = exports.ReportWorkflowNoteDto = exports.ResolveReportDto = exports.UpdateConfigDto = exports.BanUserDto = exports.RejectTicketDto = exports.SubmitTicketDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const cursor_pagination_dto_1 = require("../../../common/dto/cursor-pagination.dto");
const create_report_dto_1 = require("../../users/dto/create-report.dto");
const query_my_reports_dto_1 = require("../../users/dto/query-my-reports.dto");
class SubmitTicketDto {
    evidenceUrls;
    contactPhone;
}
exports.SubmitTicketDto = SubmitTicketDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Danh sách các link ảnh minh chứng giấy phép, hoạt động' }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.IsNotEmpty)({ each: true }),
    __metadata("design:type", Array)
], SubmitTicketDto.prototype, "evidenceUrls", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Số điện thoại liên hệ' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], SubmitTicketDto.prototype, "contactPhone", void 0);
class RejectTicketDto {
    rejectReason;
}
exports.RejectTicketDto = RejectTicketDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Lý do từ chối yêu cầu xác minh' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], RejectTicketDto.prototype, "rejectReason", void 0);
class BanUserDto {
    reason;
    banType;
    expiresAt;
}
exports.BanUserDto = BanUserDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Lý do phạt/khóa tài khoản' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], BanUserDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Loại hình phạt', enum: ['WARN', 'SOFT_BAN', 'HARD_BAN'] }),
    (0, class_validator_1.IsEnum)(['WARN', 'SOFT_BAN', 'HARD_BAN']),
    __metadata("design:type", String)
], BanUserDto.prototype, "banType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Ngày hết hạn khóa (Chỉ áp dụng cho SOFT_BAN)', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], BanUserDto.prototype, "expiresAt", void 0);
class UpdateConfigDto {
    value;
    description;
}
exports.UpdateConfigDto = UpdateConfigDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Giá trị cấu hình mới' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], UpdateConfigDto.prototype, "value", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Mô tả cấu hình', required: false }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateConfigDto.prototype, "description", void 0);
class ResolveReportDto {
    status;
    resolutionNote;
    category;
}
exports.ResolveReportDto = ResolveReportDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Trạng thái giải quyết báo cáo', enum: ['RESOLVED', 'REJECTED'] }),
    (0, class_validator_1.IsEnum)(['RESOLVED', 'REJECTED']),
    __metadata("design:type", String)
], ResolveReportDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Ghi chú giải quyết báo cáo' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], ResolveReportDto.prototype, "resolutionNote", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: create_report_dto_1.REPORT_CATEGORIES }),
    (0, class_validator_1.IsEnum)(create_report_dto_1.REPORT_CATEGORIES),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ResolveReportDto.prototype, "category", void 0);
class ReportWorkflowNoteDto {
    note;
    category;
}
exports.ReportWorkflowNoteDto = ReportWorkflowNoteDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Ghi chú nghiệp vụ cho bước xử lý' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], ReportWorkflowNoteDto.prototype, "note", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: create_report_dto_1.REPORT_CATEGORIES }),
    (0, class_validator_1.IsEnum)(create_report_dto_1.REPORT_CATEGORIES),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ReportWorkflowNoteDto.prototype, "category", void 0);
class QueryReportsDto extends cursor_pagination_dto_1.CursorPaginationDto {
    page = 1;
    limit = 10;
    status;
    targetType;
    category;
    from;
    to;
    search;
}
exports.QueryReportsDto = QueryReportsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 1, minimum: 1 }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], QueryReportsDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 10, minimum: 1, maximum: 100 }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], QueryReportsDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: query_my_reports_dto_1.REPORT_STATUSES }),
    (0, class_validator_1.IsEnum)(query_my_reports_dto_1.REPORT_STATUSES),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryReportsDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: create_report_dto_1.REPORT_TARGET_TYPES }),
    (0, class_validator_1.IsEnum)(create_report_dto_1.REPORT_TARGET_TYPES),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryReportsDto.prototype, "targetType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: create_report_dto_1.REPORT_CATEGORIES }),
    (0, class_validator_1.IsEnum)(create_report_dto_1.REPORT_CATEGORIES),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryReportsDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Từ ngày tạo, chuẩn ISO-8601' }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryReportsDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Đến ngày tạo, chuẩn ISO-8601' }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryReportsDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Tìm trong lý do, email/tên người báo cáo và tên đối tượng' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryReportsDto.prototype, "search", void 0);
class TournamentAdminActionDto {
    note;
}
exports.TournamentAdminActionDto = TournamentAdminActionDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Ghi chú hoặc lý do xử lý của quản trị viên',
        required: false,
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], TournamentAdminActionDto.prototype, "note", void 0);
//# sourceMappingURL=admin.dto.js.map