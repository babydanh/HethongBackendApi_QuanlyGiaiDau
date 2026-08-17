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
exports.QueryUserDto = exports.AdminUserStatusFilter = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
const cursor_pagination_dto_1 = require("../../../common/dto/cursor-pagination.dto");
const enums_1 = require("../../../common/constants/enums");
var AdminUserStatusFilter;
(function (AdminUserStatusFilter) {
    AdminUserStatusFilter["ACTIVE"] = "ACTIVE";
    AdminUserStatusFilter["BANNED"] = "BANNED";
})(AdminUserStatusFilter || (exports.AdminUserStatusFilter = AdminUserStatusFilter = {}));
class QueryUserDto extends cursor_pagination_dto_1.CursorPaginationDto {
    page = 1;
    limit = 10;
    search;
    sort = 'created_at';
    order = 'desc';
    role;
    status;
    from;
    to;
}
exports.QueryUserDto = QueryUserDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 1 }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryUserDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 10 }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryUserDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryUserDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 'created_at' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryUserDto.prototype, "sort", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 'desc' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryUserDto.prototype, "order", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: enums_1.UserRole }),
    (0, class_validator_1.IsEnum)(enums_1.UserRole),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryUserDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: AdminUserStatusFilter }),
    (0, class_validator_1.IsEnum)(AdminUserStatusFilter),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryUserDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Inclusive creation-date lower bound (YYYY-MM-DD)' }),
    (0, class_validator_1.Matches)(/^\d{4}-\d{2}-\d{2}$/),
    (0, class_validator_1.IsDateString)({ strict: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryUserDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Inclusive creation-date upper bound (YYYY-MM-DD)' }),
    (0, class_validator_1.Matches)(/^\d{4}-\d{2}-\d{2}$/),
    (0, class_validator_1.IsDateString)({ strict: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryUserDto.prototype, "to", void 0);
//# sourceMappingURL=query-user.dto.js.map