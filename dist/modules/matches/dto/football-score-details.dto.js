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
exports.FootballScoreDetailsDto = exports.FootballEventDto = exports.FootballShootoutDto = exports.FOOTBALL_PHASES = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
exports.FOOTBALL_PHASES = [
    'FIRST_HALF',
    'HALFTIME',
    'SECOND_HALF',
    'STOPPAGE_TIME',
    'FULL_TIME',
    'EXTRA_TIME_FIRST_HALF',
    'EXTRA_TIME_BREAK',
    'EXTRA_TIME_SECOND_HALF',
    'PENALTY_SHOOTOUT',
    'COMPLETED',
];
class FootballShootoutDto {
    team1Goals;
    team2Goals;
    winnerId;
}
exports.FootballShootoutDto = FootballShootoutDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 5 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(99),
    __metadata("design:type", Number)
], FootballShootoutDto.prototype, "team1Goals", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 4 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(99),
    __metadata("design:type", Number)
], FootballShootoutDto.prototype, "team2Goals", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'participant-id' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FootballShootoutDto.prototype, "winnerId", void 0);
class FootballEventDto {
    type;
    team;
    minute;
    addedMinute;
}
exports.FootballEventDto = FootballEventDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)([
        'GOAL',
        'OWN_GOAL',
        'PENALTY_GOAL',
        'YELLOW_CARD',
        'RED_CARD',
        'FOUL',
        'SUBSTITUTION',
        'VAR',
        'NOTE',
    ]),
    __metadata("design:type", String)
], FootballEventDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.IsIn)([1, 2]),
    __metadata("design:type", Number)
], FootballEventDto.prototype, "team", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(150),
    __metadata("design:type", Number)
], FootballEventDto.prototype, "minute", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 4,
        description: 'Phút bù giờ của mốc sự kiện',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(30),
    __metadata("design:type", Number)
], FootballEventDto.prototype, "addedMinute", void 0);
class FootballScoreDetailsDto {
    team1Goals;
    team2Goals;
    phase;
    minute;
    addedMinute;
    shootout;
    events;
}
exports.FootballScoreDetailsDto = FootballScoreDetailsDto;
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], FootballScoreDetailsDto.prototype, "team1Goals", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], FootballScoreDetailsDto.prototype, "team2Goals", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(exports.FOOTBALL_PHASES),
    __metadata("design:type", String)
], FootballScoreDetailsDto.prototype, "phase", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 90, description: 'Phút thi đấu hiện tại' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(150),
    __metadata("design:type", Number)
], FootballScoreDetailsDto.prototype, "minute", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 4, description: 'Phút bù giờ hiện tại' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(30),
    __metadata("design:type", Number)
], FootballScoreDetailsDto.prototype, "addedMinute", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => FootballShootoutDto),
    __metadata("design:type", FootballShootoutDto)
], FootballScoreDetailsDto.prototype, "shootout", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => FootballEventDto),
    __metadata("design:type", Array)
], FootballScoreDetailsDto.prototype, "events", void 0);
//# sourceMappingURL=football-score-details.dto.js.map