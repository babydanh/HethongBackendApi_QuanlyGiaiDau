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
exports.UpdateMatchScoreDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class UpdateMatchScoreDto {
    p1SetsWon;
    p2SetsWon;
    scoreDetails;
    winnerId;
    overrideReason;
    expectedRevision;
}
exports.UpdateMatchScoreDto = UpdateMatchScoreDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 2, description: 'Số set thắng của Participant 1' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateMatchScoreDto.prototype, "p1SetsWon", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: 'Số set thắng của Participant 2' }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateMatchScoreDto.prototype, "p2SetsWon", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: { sets: [{ team1Score: 6, team2Score: 4, isFinished: true }] },
        description: 'Chi tiết điểm số các hiệp/set. Hỗ trợ cả format { sets: [...] } và format legacy { set1: "6-4" }.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], UpdateMatchScoreDto.prototype, "scoreDetails", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'uuid-participant',
        description: 'ID của người thắng cuộc',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], UpdateMatchScoreDto.prototype, "winnerId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'Trọng tài xác nhận set cuối đánh tie-break rút gọn theo điều lệ sân.',
        description: 'Lý do override khi cần chốt tỉ số không bám hoàn toàn theo preset luật mặc định.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], UpdateMatchScoreDto.prototype, "overrideReason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 5,
        description: 'Revision hiện tại client đang hiển thị. Backend chỉ ghi điểm nếu khớp (optimistic lock); lệch sẽ trả 409 kèm currentRevision.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], UpdateMatchScoreDto.prototype, "expectedRevision", void 0);
//# sourceMappingURL=update-match-score.dto.js.map