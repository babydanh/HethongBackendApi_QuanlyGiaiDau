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
exports.CreateReportDto = exports.REPORT_CATEGORIES = exports.REPORT_TARGET_TYPES = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
exports.REPORT_TARGET_TYPES = [
    'USER',
    'TOURNAMENT',
    'MATCH',
    'COMMUNITY',
];
exports.REPORT_CATEGORIES = [
    'CHEATING',
    'RULE_VIOLATION',
    'ABUSIVE_BEHAVIOR',
    'FAKE_INFORMATION',
    'PAYMENT_FRAUD',
    'UNSAFE_ORGANIZATION',
    'OTHER',
];
class CreateReportDto {
    targetType;
    targetId;
    category;
    reason;
    evidenceUrls = [];
}
exports.CreateReportDto = CreateReportDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Loại đối tượng bị báo cáo', enum: exports.REPORT_TARGET_TYPES }),
    (0, class_validator_1.IsEnum)(exports.REPORT_TARGET_TYPES),
    __metadata("design:type", String)
], CreateReportDto.prototype, "targetType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID của đối tượng bị tố cáo' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateReportDto.prototype, "targetId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Nhóm hành vi vi phạm', enum: exports.REPORT_CATEGORIES }),
    (0, class_validator_1.IsEnum)(exports.REPORT_CATEGORIES),
    __metadata("design:type", String)
], CreateReportDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Mô tả cụ thể hành vi vi phạm' }),
    (0, class_validator_1.IsString)(),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.trim() : value),
    (0, class_validator_1.MinLength)(10),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], CreateReportDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Tối đa 5 URL ảnh/tài liệu minh chứng',
        required: false,
        type: [String],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(5),
    (0, class_validator_1.IsUrl)({ require_protocol: true }, { each: true }),
    (0, class_validator_1.MaxLength)(2048, { each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], CreateReportDto.prototype, "evidenceUrls", void 0);
//# sourceMappingURL=create-report.dto.js.map