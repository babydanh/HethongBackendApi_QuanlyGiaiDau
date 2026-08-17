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
exports.DashboardResponseDto = exports.UpcomingMatchDto = exports.ActivityItemDto = exports.TopPlayerDto = exports.FeaturedTournamentDto = exports.RecentMatchDto = exports.DashboardPlayerDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class DashboardPlayerDto {
    id;
    fullName;
    avatarUrl;
}
exports.DashboardPlayerDto = DashboardPlayerDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID người chơi (user đầu tiên của đội)' }),
    __metadata("design:type", String)
], DashboardPlayerDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tên hiển thị (nhiều người cách nhau bởi " & ")', example: 'Nguyễn Văn A & Trần Thị B' }),
    __metadata("design:type", String)
], DashboardPlayerDto.prototype, "fullName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, description: 'Avatar người chơi đầu tiên' }),
    __metadata("design:type", Object)
], DashboardPlayerDto.prototype, "avatarUrl", void 0);
class RecentMatchDto {
    id;
    playerA;
    playerB;
    scoreA;
    scoreB;
    status;
    eloDelta;
    playedAt;
}
exports.RecentMatchDto = RecentMatchDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID trận đấu' }),
    __metadata("design:type", String)
], RecentMatchDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: DashboardPlayerDto, nullable: true }),
    __metadata("design:type", Object)
], RecentMatchDto.prototype, "playerA", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: DashboardPlayerDto, nullable: true }),
    __metadata("design:type", Object)
], RecentMatchDto.prototype, "playerB", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Số set thắng bên A' }),
    __metadata("design:type", Number)
], RecentMatchDto.prototype, "scoreA", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Số set thắng bên B' }),
    __metadata("design:type", Number)
], RecentMatchDto.prototype, "scoreB", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Trạng thái trận đấu', example: 'COMPLETED' }),
    __metadata("design:type", String)
], RecentMatchDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ELO thay đổi của người thắng (âm = thua)', example: 14 }),
    __metadata("design:type", Number)
], RecentMatchDto.prototype, "eloDelta", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, description: 'Thời điểm kết thúc trận' }),
    __metadata("design:type", Object)
], RecentMatchDto.prototype, "playedAt", void 0);
class FeaturedTournamentDto {
    id;
    name;
    status;
    participantCount;
    championName;
}
exports.FeaturedTournamentDto = FeaturedTournamentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID giải đấu' }),
    __metadata("design:type", String)
], FeaturedTournamentDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tên giải đấu', example: 'Summer Cup 2026' }),
    __metadata("design:type", String)
], FeaturedTournamentDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Trạng thái giải đấu', example: 'ONGOING' }),
    __metadata("design:type", String)
], FeaturedTournamentDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Số VĐV tham gia', example: 32 }),
    __metadata("design:type", Number)
], FeaturedTournamentDto.prototype, "participantCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, description: 'Tên nhà vô địch (null nếu chưa xác định)' }),
    __metadata("design:type", Object)
], FeaturedTournamentDto.prototype, "championName", void 0);
class TopPlayerDto {
    userId;
    fullName;
    avatarUrl;
    elo;
    tierName;
    rank;
    winStreak;
}
exports.TopPlayerDto = TopPlayerDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID người chơi' }),
    __metadata("design:type", String)
], TopPlayerDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tên người chơi' }),
    __metadata("design:type", String)
], TopPlayerDto.prototype, "fullName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], TopPlayerDto.prototype, "avatarUrl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ELO hiện tại', example: 1682 }),
    __metadata("design:type", Number)
], TopPlayerDto.prototype, "elo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, description: 'Tên tier (từ elo_tiers)', example: 'S' }),
    __metadata("design:type", Object)
], TopPlayerDto.prototype, "tierName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Thứ hạng (1-based)', example: 1 }),
    __metadata("design:type", Number)
], TopPlayerDto.prototype, "rank", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chuỗi thắng hiện tại', example: 5 }),
    __metadata("design:type", Number)
], TopPlayerDto.prototype, "winStreak", void 0);
class ActivityItemDto {
    type;
    userId;
    userName;
    message;
    at;
}
exports.ActivityItemDto = ActivityItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['MEMBER_JOINED', 'GALLERY_ADDED', 'TOURNAMENT_CREATED'] }),
    __metadata("design:type", String)
], ActivityItemDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, description: 'ID người tạo hoạt động' }),
    __metadata("design:type", Object)
], ActivityItemDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Tên người tạo hoạt động' }),
    __metadata("design:type", String)
], ActivityItemDto.prototype, "userName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Mô tả ngắn', example: 'gia nhập CLB' }),
    __metadata("design:type", String)
], ActivityItemDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Thời điểm hoạt động' }),
    __metadata("design:type", Date)
], ActivityItemDto.prototype, "at", void 0);
class UpcomingMatchDto {
    id;
    playerA;
    playerB;
    scheduledAt;
}
exports.UpcomingMatchDto = UpcomingMatchDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID trận đấu' }),
    __metadata("design:type", String)
], UpcomingMatchDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: DashboardPlayerDto, nullable: true }),
    __metadata("design:type", Object)
], UpcomingMatchDto.prototype, "playerA", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: DashboardPlayerDto, nullable: true }),
    __metadata("design:type", Object)
], UpcomingMatchDto.prototype, "playerB", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, description: 'Thời điểm dự kiến thi đấu' }),
    __metadata("design:type", Object)
], UpcomingMatchDto.prototype, "scheduledAt", void 0);
class DashboardResponseDto {
    recentMatches;
    featuredTournament;
    topPlayers;
    activity;
    upcomingMatches;
}
exports.DashboardResponseDto = DashboardResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [RecentMatchDto], description: 'Trận gần nhất (max 3)' }),
    __metadata("design:type", Array)
], DashboardResponseDto.prototype, "recentMatches", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: FeaturedTournamentDto, nullable: true, description: 'Giải nổi bật (null nếu chưa có)' }),
    __metadata("design:type", Object)
], DashboardResponseDto.prototype, "featuredTournament", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [TopPlayerDto], description: 'Top 3 theo ELO' }),
    __metadata("design:type", Array)
], DashboardResponseDto.prototype, "topPlayers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ActivityItemDto], description: 'Hoạt động gần đây (max 5)' }),
    __metadata("design:type", Array)
], DashboardResponseDto.prototype, "activity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [UpcomingMatchDto], description: 'Trận sắp diễn ra (max 3)' }),
    __metadata("design:type", Array)
], DashboardResponseDto.prototype, "upcomingMatches", void 0);
//# sourceMappingURL=dashboard-response.dto.js.map