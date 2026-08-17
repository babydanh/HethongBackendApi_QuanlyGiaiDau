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
exports.UpdateSystemRolesDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const enums_1 = require("../../../common/constants/enums");
class UpdateSystemRolesDto {
    roles;
}
exports.UpdateSystemRolesDto = UpdateSystemRolesDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        type: [String],
        enum: enums_1.UserRole,
        example: [enums_1.UserRole.PLAYER, enums_1.UserRole.ORGANIZER],
        description: 'Các vai trò hệ thống đã tồn tại để áp dụng cho người dùng.',
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayUnique)(),
    (0, class_validator_1.IsEnum)(enums_1.UserRole, { each: true }),
    __metadata("design:type", Array)
], UpdateSystemRolesDto.prototype, "roles", void 0);
//# sourceMappingURL=update-system-roles.dto.js.map