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
exports.CreateLiteTournamentDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateLiteTournamentDto {
    name;
    communityId;
    tournamentType;
    bannerUrl;
    logoUrl;
    prizeDescription;
    contactInfo;
    sport;
    format;
    genderRestriction;
    bracketType;
    maxTeams;
    teamSize;
    maxReserve;
    setsToWin;
    pointsPerSet;
    winByTwo;
    maxPoints;
    footballHalvesCount;
    footballHalfDuration;
    footballAllowDraw;
    description;
    registrationMode;
    visibility;
    venueName;
    locationAddress;
    province;
    district;
    ward;
    registrationStartDate;
    registrationEndDate;
    location;
    startDate;
    startTime;
    endDate;
    isRanked;
    isRecurring;
    recurringFrequency;
    recurringDayOfWeek;
    recurringDaysOfWeek;
    recurringTimeOfDay;
    recurringAdvanceDays;
}
exports.CreateLiteTournamentDto = CreateLiteTournamentDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'Giải Cầu lông Cuối Tuần',
        description: 'Tên giải đấu',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'uuid-community', description: 'ID câu lạc bộ; bỏ trống để tạo giải nhanh riêng bằng quyền Organizer' }),
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "communityId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'PUBLIC',
        description: 'Phạm vi giải: PUBLIC là giải mở rộng, CLUB là giải nội bộ câu lạc bộ',
        enum: ['CLUB', 'PUBLIC'],
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['CLUB', 'PUBLIC']),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "tournamentType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://cdn.../banner.jpg', description: 'Ảnh bìa tùy chọn' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "bannerUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'https://cdn.../logo.jpg', description: 'Logo tùy chọn' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "logoUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Giải thưởng giao lưu', description: 'Mô tả giải thưởng tùy chọn' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "prizeDescription", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: { phone: '0900000000', email: 'btc@example.com' }, description: 'Liên hệ BTC tùy chọn' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateLiteTournamentDto.prototype, "contactInfo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'badminton',
        description: 'Môn thi đấu (slug)',
        enum: ['badminton', 'tennis', 'pickleball', 'table_tennis', 'football'],
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['badminton', 'tennis', 'pickleball', 'table_tennis', 'football']),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "sport", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'singles',
        description: 'Hình thức: đánh đơn, đôi hoặc đôi nam nữ',
        enum: ['singles', 'doubles', 'mixed_doubles'],
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['singles', 'doubles', 'mixed_doubles']),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "format", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'MALE',
        description: 'Giới hạn giới tính cho giải bóng đá Lite; bỏ trống là không ràng buộc',
        enum: ['MALE', 'FEMALE', 'MIXED'],
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['MALE', 'FEMALE', 'MIXED']),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "genderRestriction", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'single_elimination',
        description: 'Thể thức thi đấu. Chỉ hỗ trợ: single_elimination, double_elimination, round_robin, group_stage_knockout.',
        enum: [
            'single_elimination',
            'double_elimination',
            'round_robin',
            'group_stage_knockout',
        ],
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)([
        'single_elimination',
        'double_elimination',
        'round_robin',
        'group_stage_knockout',
    ]),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "bracketType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 16, description: 'Số đội tối đa (2-32)' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(2),
    (0, class_validator_1.Max)(32),
    __metadata("design:type", Number)
], CreateLiteTournamentDto.prototype, "maxTeams", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 7, enum: [5, 7, 11] }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)([5, 7, 11]),
    __metadata("design:type", Number)
], CreateLiteTournamentDto.prototype, "teamSize", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 5 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(20),
    __metadata("design:type", Number)
], CreateLiteTournamentDto.prototype, "maxReserve", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 2, description: 'Số set/hiệp thắng mặc định cho môn có set' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(5),
    __metadata("design:type", Number)
], CreateLiteTournamentDto.prototype, "setsToWin", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 21, description: 'Điểm mục tiêu mỗi set của preset; Lite vẫn cho nhập điểm tự do khi thi đấu' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(99),
    __metadata("design:type", Number)
], CreateLiteTournamentDto.prototype, "pointsPerSet", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: true }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateLiteTournamentDto.prototype, "winByTwo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 30 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(199),
    __metadata("design:type", Number)
], CreateLiteTournamentDto.prototype, "maxPoints", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 2, description: 'Số hiệp bóng đá' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(4),
    __metadata("design:type", Number)
], CreateLiteTournamentDto.prototype, "footballHalvesCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 45, description: 'Số phút mỗi hiệp bóng đá' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(120),
    __metadata("design:type", Number)
], CreateLiteTournamentDto.prototype, "footballHalfDuration", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: true, description: 'Cho phép kết quả hòa trong bóng đá' }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateLiteTournamentDto.prototype, "footballAllowDraw", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'Giải đấu giao lưu cuối tuần',
        description: 'Mô tả giải đấu',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'OPEN',
        description: 'Chế độ đăng ký',
        enum: ['OPEN', 'APPROVAL', 'INVITE_ONLY'],
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['OPEN', 'APPROVAL', 'INVITE_ONLY']),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "registrationMode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'PRIVATE',
        description: 'Hiển thị giải Lite: PRIVATE nội bộ/mời riêng hoặc PUBLIC chờ Admin duyệt',
        enum: ['PRIVATE', 'PUBLIC'],
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['PRIVATE', 'PUBLIC']),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "visibility", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Sân Pickleball Trung tâm', description: 'Tên sân/địa điểm hiển thị' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "venueName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Số 12 đường ABC, phường X', description: 'Địa chỉ chi tiết địa điểm' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "locationAddress", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Hà Nội', description: 'Tỉnh/thành phố' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "province", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Nam Từ Liêm', description: 'Quận/huyện' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "district", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Mỹ Đình', description: 'Phường/xã' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "ward", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-10-01T09:00:00Z', description: 'Ngày giờ mở đăng ký; mặc định hiện tại' }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "registrationStartDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-10-14T23:59:00Z', description: 'Ngày giờ đóng đăng ký; phải trước giờ thi đấu' }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "registrationEndDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'Hải Dương',
        description: 'Địa điểm tổ chức',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "location", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: '2026-10-15T00:00:00Z',
        description: 'Ngày bắt đầu',
    }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: '18:30',
        description: 'Giờ bắt đầu thi đấu (HH:mm)',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "startTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: '2026-10-15T22:00:00Z',
        description: 'Ngày giờ kết thúc',
    }),
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: false,
        description: 'Giải đấu xếp hạng ELO (true) hay phong trào (false)',
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateLiteTournamentDto.prototype, "isRanked", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: false,
        description: 'Tự động tạo giải lặp lại theo chu kỳ định kỳ',
    }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateLiteTournamentDto.prototype, "isRecurring", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'WEEKLY',
        description: 'Tần suất lặp lại',
        enum: ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'],
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "recurringFrequency", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 6,
        description: 'Thứ trong tuần (0: CN, 1: T2, ..., 6: T7)',
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(6),
    __metadata("design:type", Number)
], CreateLiteTournamentDto.prototype, "recurringDayOfWeek", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: [2, 4, 6],
        description: 'Danh sách các thứ trong tuần (0: CN, 1: T2, ..., 6: T7)',
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)({}, { each: true }),
    __metadata("design:type", Array)
], CreateLiteTournamentDto.prototype, "recurringDaysOfWeek", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: '18:00',
        description: 'Giờ thi đấu định kỳ (HH:mm)',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateLiteTournamentDto.prototype, "recurringTimeOfDay", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 3,
        description: 'Số ngày tạo giải và mở đăng ký trước ngày thi đấu (VD: Tạo trước 1 ngày, 2 ngày, 3 ngày, 7 ngày)',
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(30),
    __metadata("design:type", Number)
], CreateLiteTournamentDto.prototype, "recurringAdvanceDays", void 0);
//# sourceMappingURL=create-lite-tournament.dto.js.map