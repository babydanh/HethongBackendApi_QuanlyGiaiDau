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
exports.CreateCommunityDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateCommunityDto {
    name;
    description;
    logoUrl;
    bannerUrl;
    locationAddress;
    lat;
    lng;
    categoryIds;
    provinceCode;
    districtCode;
    wardCode;
    visibility;
    joinMode;
    joinQuestions;
    rules;
    maxMembers;
    socialLinks;
}
exports.CreateCommunityDto = CreateCommunityDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'CLB Pickleball Hà Nội',
        description: 'Tên cộng đồng',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(255),
    __metadata("design:type", String)
], CreateCommunityDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'Nơi giao lưu học hỏi',
        description: 'Mô tả chi tiết',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateCommunityDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'URL logo' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateCommunityDto.prototype, "logoUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'URL ảnh bìa' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateCommunityDto.prototype, "bannerUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: 'Quận Cầu Giấy, Hà Nội',
        description: 'Địa chỉ',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateCommunityDto.prototype, "locationAddress", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 21.028511, description: 'Vĩ độ' }),
    (0, class_validator_1.IsLatitude)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateCommunityDto.prototype, "lat", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 105.804817, description: 'Kinh độ' }),
    (0, class_validator_1.IsLongitude)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateCommunityDto.prototype, "lng", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: [String],
        description: 'Đúng một ID môn thể thao chính của CLB',
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(1),
    (0, class_validator_1.IsUUID)('4', { each: true }),
    __metadata("design:type", Array)
], CreateCommunityDto.prototype, "categoryIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Mã tỉnh/thành phố' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateCommunityDto.prototype, "provinceCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Mã quận/huyện' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateCommunityDto.prototype, "districtCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Mã phường/xã' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateCommunityDto.prototype, "wardCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Chế độ hiển thị', enum: ['PUBLIC', 'PRIVATE', 'RESTRICTED'] }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateCommunityDto.prototype, "visibility", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Chế độ tham gia', enum: ['OPEN', 'APPROVAL', 'INVITE_ONLY'] }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateCommunityDto.prototype, "joinMode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Câu hỏi xin vào' }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], CreateCommunityDto.prototype, "joinQuestions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Nội quy cộng đồng' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateCommunityDto.prototype, "rules", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Giới hạn thành viên' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateCommunityDto.prototype, "maxMembers", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        type: Object,
        description: 'Liên kết mạng xã hội (facebook, zalo, instagram, v.v.)',
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateCommunityDto.prototype, "socialLinks", void 0);
//# sourceMappingURL=create-community.dto.js.map