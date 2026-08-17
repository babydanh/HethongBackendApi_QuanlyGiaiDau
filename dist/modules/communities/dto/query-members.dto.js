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
exports.QueryMembersDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const class_validator_2 = require("class-validator");
const cursor_pagination_dto_1 = require("../../../common/dto/cursor-pagination.dto");
class QueryMembersDto extends cursor_pagination_dto_1.CursorPaginationDto {
    page = 1;
    limit = 50;
    status;
    search;
    mentionable;
}
exports.QueryMembersDto = QueryMembersDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 1, description: 'Trang hiện tại' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => Number(value)),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], QueryMembersDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 50,
        description: 'Số lượng / trang (Tối đa 200)',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => Number(value)),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(200),
    __metadata("design:type", Number)
], QueryMembersDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        enum: ['JOINED', 'PENDING', 'INVITED', 'REJECTED', 'BANNED'],
        description: 'Lọc theo trạng thái thành viên',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['JOINED', 'PENDING', 'INVITED', 'REJECTED', 'BANNED']),
    __metadata("design:type", String)
], QueryMembersDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Tìm theo tên thành viên. Dùng cho danh sách gợi ý @mention.',
        maxLength: 80,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => (typeof value === 'string' ? value.trim() : value)),
    (0, class_validator_2.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], QueryMembersDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Chỉ trả thành viên JOINED cho bộ gợi ý @mention. Giới hạn tối đa 20 kết quả.',
        default: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === true || value === 'true'),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], QueryMembersDto.prototype, "mentionable", void 0);
//# sourceMappingURL=query-members.dto.js.map