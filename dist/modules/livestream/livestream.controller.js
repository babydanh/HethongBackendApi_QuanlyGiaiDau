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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LivestreamController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const verified_decorator_1 = require("../../common/decorators/verified.decorator");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const assign_camera_dto_1 = require("./dto/assign-camera.dto");
const create_camera_dto_1 = require("./dto/create-camera.dto");
const livestream_service_1 = require("./livestream.service");
const throttler_1 = require("@nestjs/throttler");
let LivestreamController = class LivestreamController {
    livestreamService;
    constructor(livestreamService) {
        this.livestreamService = livestreamService;
    }
    listCameras(tournamentId, user) {
        return this.livestreamService.listCameras(tournamentId, user);
    }
    listMatchLivestreams(tournamentId, user) {
        return this.livestreamService.listMatchLivestreams(tournamentId, user);
    }
    createCamera(tournamentId, user, data) {
        return this.livestreamService.createCamera(tournamentId, user, data);
    }
    deleteCamera(cameraId, user) {
        return this.livestreamService.deleteCamera(cameraId, user);
    }
    assignCamera(matchId, user, data) {
        return this.livestreamService.assignCamera(matchId, user, data);
    }
    startMatchStream(matchId, user) {
        return this.livestreamService.startMatchStream(matchId, user);
    }
    stopMatchStream(matchId, user) {
        return this.livestreamService.stopMatchStream(matchId, user);
    }
    getMatchPlayback(matchId) {
        return this.livestreamService.getMatchPlayback(matchId);
    }
};
exports.LivestreamController = LivestreamController;
__decorate([
    (0, common_1.Get)('tournaments/:tournamentId/cameras'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Danh sách camera và phân phối livestream của giải' }),
    __param(0, (0, common_1.Param)('tournamentId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], LivestreamController.prototype, "listCameras", null);
__decorate([
    (0, common_1.Get)('tournaments/:tournamentId/matches'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Danh sách trạng thái livestream theo trận của giải' }),
    __param(0, (0, common_1.Param)('tournamentId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], LivestreamController.prototype, "listMatchLivestreams", null);
__decorate([
    (0, common_1.Post)('tournaments/:tournamentId/cameras'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tạo camera/stream key cho giải' }),
    __param(0, (0, common_1.Param)('tournamentId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, create_camera_dto_1.CreateCameraDto]),
    __metadata("design:returntype", void 0)
], LivestreamController.prototype, "createCamera", null);
__decorate([
    (0, common_1.Delete)('cameras/:cameraId'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lưu trữ camera, không xoá cứng dữ liệu' }),
    __param(0, (0, common_1.Param)('cameraId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], LivestreamController.prototype, "deleteCamera", null);
__decorate([
    (0, common_1.Post)('matches/:matchId/assign-camera'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'BTC gán camera cho trận' }),
    __param(0, (0, common_1.Param)('matchId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, assign_camera_dto_1.AssignCameraDto]),
    __metadata("design:returntype", void 0)
], LivestreamController.prototype, "assignCamera", null);
__decorate([
    (0, common_1.Post)('matches/:matchId/start'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'BTC hoặc trọng tài được phân công bắt đầu livestream nếu trận đã có camera' }),
    __param(0, (0, common_1.Param)('matchId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], LivestreamController.prototype, "startMatchStream", null);
__decorate([
    (0, common_1.Post)('matches/:matchId/stop'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'BTC hoặc trọng tài được phân công dừng livestream' }),
    __param(0, (0, common_1.Param)('matchId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], LivestreamController.prototype, "stopMatchStream", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('matches/:matchId/playback'),
    (0, swagger_1.ApiOperation)({ summary: 'Người chơi/khán giả xem playback livestream, không trả stream key' }),
    __param(0, (0, common_1.Param)('matchId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LivestreamController.prototype, "getMatchPlayback", null);
exports.LivestreamController = LivestreamController = __decorate([
    (0, swagger_1.ApiTags)('livestream'),
    (0, throttler_1.SkipThrottle)(),
    (0, common_1.Controller)('livestream'),
    __metadata("design:paramtypes", [livestream_service_1.LivestreamService])
], LivestreamController);
//# sourceMappingURL=livestream.controller.js.map