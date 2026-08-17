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
exports.LivestreamService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
const livestream_repository_1 = require("./livestream.repository");
let LivestreamService = class LivestreamService {
    livestreamRepository;
    configService;
    constructor(livestreamRepository, configService) {
        this.livestreamRepository = livestreamRepository;
        this.configService = configService;
    }
    isAdmin(user) {
        return user.role === 'ADMIN' || user.roles?.includes('ADMIN') === true;
    }
    getRtmpBaseUrl() {
        return this.configService.get('LIVESTREAM_RTMP_BASE_URL') || 'rtmp://sporto.asia:1935/live';
    }
    getHlsBaseUrl() {
        return this.configService.get('LIVESTREAM_HLS_PUBLIC_BASE_URL') || 'https://sporto.asia/hls';
    }
    buildPlaybackUrl(streamKey) {
        return `${this.getHlsBaseUrl().replace(/\/$/, '')}/${streamKey}/index.m3u8`;
    }
    normalizePublicPlaybackUrl(url) {
        if (!url)
            return url ?? null;
        try {
            const parsed = new URL(url);
            if ((parsed.hostname === 'giaidau.vnvar.com' || parsed.hostname === 'sporto.asia') &&
                parsed.port === '8888') {
                const parts = parsed.pathname.split('/').filter(Boolean);
                const indexPosition = parts.lastIndexOf('index.m3u8');
                const streamKey = indexPosition > 0 ? parts[indexPosition - 1] : null;
                if (streamKey)
                    return this.buildPlaybackUrl(streamKey);
                parsed.protocol = 'https:';
                parsed.port = '';
            }
            return parsed.toString();
        }
        catch {
            return url;
        }
    }
    buildIngestUrl(streamKey) {
        return `${this.getRtmpBaseUrl().replace(/\/$/, '')}/${streamKey}`;
    }
    normalizeStream(stream) {
        if (!stream)
            return null;
        if (stream.streamStatus !== 'ENDED')
            return stream;
        return {
            ...stream,
            streamStatus: 'IDLE',
            endedAt: null,
            playbackUrl: null,
        };
    }
    buildSrtUrl(streamName) {
        const baseUrl = this.configService.get('LIVESTREAM_SRT_BASE_URL') || 'srt://localhost:8890';
        return `${baseUrl.replace(/\/$/, '')}?streamid=publish:${streamName}`;
    }
    buildPublishInfo(protocol, streamName) {
        const rtmpUrl = this.buildIngestUrl(streamName);
        const srtUrl = this.buildSrtUrl(streamName);
        return {
            protocol,
            streamName,
            url: protocol === 'SRT' ? srtUrl : rtmpUrl,
            rtmpUrl,
            srtUrl,
        };
    }
    async assertTournamentOperator(tournamentId, user) {
        const tournament = await this.livestreamRepository.findTournamentById(tournamentId);
        if (!tournament) {
            throw new common_1.NotFoundException('Giải đấu không tồn tại');
        }
        if (this.isAdmin(user) || tournament.createdBy === user.sub) {
            return tournament;
        }
        const isStaff = await this.livestreamRepository.isTournamentStaff(tournamentId, user.sub);
        if (!isStaff) {
            throw new common_1.ForbiddenException('Chỉ chủ giải, đồng tổ chức hoặc admin được cấu hình camera.');
        }
        return tournament;
    }
    async assertCanControlMatchStream(matchId, user) {
        const match = await this.livestreamRepository.findMatchWithTournament(matchId);
        if (!match) {
            throw new common_1.NotFoundException('Trận đấu không tồn tại');
        }
        const isOperator = this.isAdmin(user) ||
            match.tournamentCreatedBy === user.sub ||
            (await this.livestreamRepository.isTournamentStaff(match.tournamentId, user.sub));
        const isAssignedReferee = match.refereeId === user.sub;
        if (!isOperator && !isAssignedReferee) {
            throw new common_1.ForbiddenException('Bạn không có quyền điều khiển livestream trận này.');
        }
        return match;
    }
    async listCameras(tournamentId, user) {
        await this.assertTournamentOperator(tournamentId, user);
        const cameras = await this.livestreamRepository.listCameras(tournamentId);
        return cameras.map((camera) => ({
            ...camera,
            playbackUrl: this.normalizePublicPlaybackUrl(camera.playbackUrl),
        }));
    }
    async listMatchLivestreams(tournamentId, user) {
        await this.assertTournamentOperator(tournamentId, user);
        const streams = await this.livestreamRepository.listMatchLivestreams(tournamentId);
        return streams.map((stream) => {
            const normalized = this.normalizeStream(stream);
            if (!normalized)
                return stream;
            return normalized.cameraName
                ? { ...normalized, playbackUrl: this.normalizePublicPlaybackUrl(normalized.playbackUrl) }
                : { ...normalized, cameraId: null, streamStatus: 'IDLE', playbackUrl: null, endedAt: null };
        });
    }
    async createCamera(tournamentId, user, data) {
        await this.assertTournamentOperator(tournamentId, user);
        const streamName = `camera_${(0, crypto_1.randomUUID)().replace(/-/g, '')}`;
        const streamKey = (0, crypto_1.randomUUID)().replace(/-/g, '');
        const playbackUrl = this.buildPlaybackUrl(streamName);
        const camera = await this.livestreamRepository.createCamera({
            tournamentId,
            name: data.name.trim(),
            protocol: data.protocol ?? 'RTMP',
            streamName,
            streamKey,
            playbackUrl: this.normalizePublicPlaybackUrl(playbackUrl),
            createdBy: user.sub,
        });
        return {
            ...camera,
            publish: this.buildPublishInfo(data.protocol ?? 'RTMP', streamName),
        };
    }
    async deleteCamera(cameraId, user) {
        const camera = await this.livestreamRepository.findCameraById(cameraId);
        if (!camera) {
            throw new common_1.NotFoundException('Camera không tồn tại');
        }
        await this.assertTournamentOperator(camera.tournamentId, user);
        return this.livestreamRepository.deleteCamera(cameraId);
    }
    async assignCamera(matchId, user, data) {
        const match = await this.livestreamRepository.findMatchWithTournament(matchId);
        if (!match) {
            throw new common_1.NotFoundException('Trận đấu không tồn tại');
        }
        await this.assertTournamentOperator(match.tournamentId, user);
        const camera = await this.livestreamRepository.findCameraById(data.cameraId);
        if (!camera || camera.tournamentId !== match.tournamentId) {
            throw new common_1.BadRequestException('Camera không thuộc giải đấu của trận này.');
        }
        return this.livestreamRepository.assignCameraToMatch(matchId, data.cameraId, this.normalizePublicPlaybackUrl(camera.playbackUrl) ?? '');
    }
    async startMatchStream(matchId, user) {
        const match = await this.assertCanControlMatchStream(matchId, user);
        const stream = this.normalizeStream(await this.livestreamRepository.findMatchLivestream(matchId));
        if (!stream?.cameraId || !stream.streamKey) {
            throw new common_1.BadRequestException('Trận này chưa được BTC gán camera nên chưa thể bắt đầu livestream.');
        }
        if (!match.participant1Id || !match.participant2Id) {
            throw new common_1.BadRequestException('Trận chưa đủ hai đội nên chưa thể bắt đầu livestream.');
        }
        const playbackUrl = this.normalizePublicPlaybackUrl(stream.cameraPlaybackUrl || this.buildPlaybackUrl(stream.streamKey));
        const livestream = await this.livestreamRepository.updateStreamStatus(matchId, 'LIVE', user.sub, playbackUrl);
        const protocol = stream.cameraProtocol === 'SRT' ? 'SRT' : 'RTMP';
        return {
            livestream,
            publish: this.buildPublishInfo(protocol, stream.streamName ?? stream.streamKey),
            playbackUrl,
        };
    }
    async stopMatchStream(matchId, user) {
        await this.assertCanControlMatchStream(matchId, user);
        const stream = this.normalizeStream(await this.livestreamRepository.findMatchLivestream(matchId));
        if (!stream?.cameraId) {
            throw new common_1.BadRequestException('Trận này chưa được gán camera.');
        }
        return this.livestreamRepository.updateStreamStatus(matchId, 'IDLE', user.sub, null);
    }
    async getMatchPlayback(matchId) {
        const match = await this.livestreamRepository.findMatchWithTournament(matchId);
        if (!match) {
            throw new common_1.NotFoundException('Trận đấu không tồn tại');
        }
        if (match.tournamentVisibility !== 'PUBLIC' ||
            ['DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED', 'PENDING_DELETE', 'pending_delete'].includes(match.tournamentStatus)) {
            throw new common_1.NotFoundException('Trận đấu không tồn tại');
        }
        const stream = this.normalizeStream(await this.livestreamRepository.findMatchLivestream(matchId));
        if (!stream?.cameraId || !stream.cameraName) {
            return {
                matchId,
                streamStatus: 'OFFLINE',
                playbackUrl: null,
            };
        }
        return {
            matchId,
            streamStatus: stream.streamStatus,
            playbackUrl: stream.streamStatus === 'LIVE' ? this.normalizePublicPlaybackUrl(stream.playbackUrl) : null,
            cameraName: stream.cameraName,
            startedAt: stream.startedAt,
            endedAt: stream.endedAt,
        };
    }
};
exports.LivestreamService = LivestreamService;
exports.LivestreamService = LivestreamService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [livestream_repository_1.LivestreamRepository,
        config_1.ConfigService])
], LivestreamService);
//# sourceMappingURL=livestream.service.js.map