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
exports.UpdateMemberTagsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class UpdateMemberTagsDto {
    tags;
}
exports.UpdateMemberTagsDto = UpdateMemberTagsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Danh sách tag BQT (tối đa 5). Mỗi tag 1-24 ký tự, chỉ chữ/số/khoảng trắng/_/-, không ký tự đặc biệt hay emoji.',
        example: ['Nòng cốt', 'VĐV xuất sắc'],
        type: [String],
    }),
    (0, class_transformer_1.Transform)(({ value }) => Array.isArray(value)
        ? value.map((tag) => (typeof tag === 'string' ? tag.trim() : tag))
        : value),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(5),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.Length)(1, 24, { each: true }),
    (0, class_validator_1.Matches)(/^[\p{L}\p{N} _-]+$/u, {
        each: true,
        message: 'Mỗi tag chỉ được chứa chữ cái, số, khoảng trắng, gạch dưới (_) và gạch ngang (-).',
    }),
    __metadata("design:type", Array)
], UpdateMemberTagsDto.prototype, "tags", void 0);
//# sourceMappingURL=update-member-tags.dto.js.map