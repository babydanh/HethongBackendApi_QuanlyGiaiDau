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
exports.UpdateTournamentDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_tournament_dto_1 = require("./create-tournament.dto");
const class_validator_1 = require("class-validator");
class UpdateTournamentDto extends (0, swagger_1.PartialType)(create_tournament_dto_1.CreateTournamentDto) {
    isRegistrationLocked;
    status;
    inviteCode;
}
exports.UpdateTournamentDto = UpdateTournamentDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: false, description: 'Trạng thái khóa link đăng ký thủ công' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateTournamentDto.prototype, "isRegistrationLocked", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'UPCOMING',
        description: 'Trạng thái giải đấu: DRAFT, UPCOMING, REGISTRATION_OPEN, REGISTRATION_CLOSED, IN_PROGRESS, COMPLETED, CANCELLED',
        enum: ['DRAFT', 'UPCOMING', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['DRAFT', 'UPCOMING', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
    __metadata("design:type", String)
], UpdateTournamentDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'AB12CD34', description: 'Mã mời tham gia' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateTournamentDto.prototype, "inviteCode", void 0);
//# sourceMappingURL=update-tournament.dto.js.map