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
exports.QueryMyReportsDto = exports.REPORT_STATUSES = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const cursor_pagination_dto_1 = require("../../../common/dto/cursor-pagination.dto");
const create_report_dto_1 = require("./create-report.dto");
exports.REPORT_STATUSES = [
    'SUBMITTED',
    'TRIAGED',
    'UNDER_REVIEW',
    'ESCALATED',
    'RESOLVED',
    'REJECTED',
];
class QueryMyReportsDto extends cursor_pagination_dto_1.CursorPaginationDto {
    page = 1;
    limit = 10;
    status;
    targetType;
    category;
}
exports.QueryMyReportsDto = QueryMyReportsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 1, minimum: 1 }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], QueryMyReportsDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 10, minimum: 1, maximum: 50 }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], QueryMyReportsDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: exports.REPORT_STATUSES }),
    (0, class_validator_1.IsEnum)(exports.REPORT_STATUSES),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryMyReportsDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: create_report_dto_1.REPORT_TARGET_TYPES }),
    (0, class_validator_1.IsEnum)(create_report_dto_1.REPORT_TARGET_TYPES),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryMyReportsDto.prototype, "targetType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: create_report_dto_1.REPORT_CATEGORIES }),
    (0, class_validator_1.IsEnum)(create_report_dto_1.REPORT_CATEGORIES),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryMyReportsDto.prototype, "category", void 0);
//# sourceMappingURL=query-my-reports.dto.js.map