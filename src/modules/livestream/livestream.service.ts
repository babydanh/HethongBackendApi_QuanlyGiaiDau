import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AssignCameraDto } from './dto/assign-camera.dto';
import { CreateCameraDto } from './dto/create-camera.dto';
import { LivestreamRepository } from './livestream.repository';

@Injectable()
export class LivestreamService {
  constructor(
    private readonly livestreamRepository: LivestreamRepository,
    private readonly configService: ConfigService,
  ) {}

  private isAdmin(user: JwtPayload) {
    return user.role === 'ADMIN' || user.roles?.includes('ADMIN') === true;
  }

  private getRtmpBaseUrl() {
    return this.configService.get<string>('LIVESTREAM_RTMP_BASE_URL') || 'rtmp://giaidau.vnvar.com:1935/live';
  }

  private getHlsBaseUrl() {
    return this.configService.get<string>('LIVESTREAM_HLS_PUBLIC_BASE_URL') || 'https://giaidau.vnvar.com/hls';
  }

  private buildPlaybackUrl(streamKey: string) {
    return `${this.getHlsBaseUrl().replace(/\/$/, '')}/${streamKey}/index.m3u8`;
  }

  private buildIngestUrl(streamKey: string) {
    return `${this.getRtmpBaseUrl().replace(/\/$/, '')}/${streamKey}`;
  }

  // ENDED was used by the old stop flow. Replay is not supported yet, so it
  // must not permanently block a match or a newly assigned camera.
  private normalizeStream<T extends { streamStatus?: string | null; endedAt?: Date | null; playbackUrl?: string | null }>(stream: T): T {
    if (stream.streamStatus !== 'ENDED') return stream;
    return {
      ...stream,
      streamStatus: 'IDLE',
      endedAt: null,
      playbackUrl: null,
    };
  }

  private buildSrtUrl(streamName: string) {
    const baseUrl = this.configService.get<string>('LIVESTREAM_SRT_BASE_URL') || 'srt://localhost:8890';
    return `${baseUrl.replace(/\/$/, '')}?streamid=publish:${streamName}`;
  }

  private buildPublishInfo(protocol: 'RTMP' | 'SRT', streamName: string) {
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

  private async assertTournamentOperator(tournamentId: string, user: JwtPayload) {
    const tournament = await this.livestreamRepository.findTournamentById(tournamentId);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (this.isAdmin(user) || tournament.createdBy === user.sub) {
      return tournament;
    }

    const isStaff = await this.livestreamRepository.isTournamentStaff(tournamentId, user.sub);
    if (!isStaff) {
      throw new ForbiddenException('Chỉ chủ giải, đồng tổ chức hoặc admin được cấu hình camera.');
    }

    return tournament;
  }

  private async assertCanControlMatchStream(matchId: string, user: JwtPayload) {
    const match = await this.livestreamRepository.findMatchWithTournament(matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const isOperator =
      this.isAdmin(user) ||
      match.tournamentCreatedBy === user.sub ||
      (await this.livestreamRepository.isTournamentStaff(match.tournamentId, user.sub));
    const isAssignedReferee = match.refereeId === user.sub;

    if (!isOperator && !isAssignedReferee) {
      throw new ForbiddenException('Bạn không có quyền điều khiển livestream trận này.');
    }

    return match;
  }

  async listCameras(tournamentId: string, user: JwtPayload) {
    await this.assertTournamentOperator(tournamentId, user);
    return this.livestreamRepository.listCameras(tournamentId);
  }

  async listMatchLivestreams(tournamentId: string, user: JwtPayload) {
    await this.assertTournamentOperator(tournamentId, user);
    const streams = await this.livestreamRepository.listMatchLivestreams(tournamentId);
    return streams.map((stream) => this.normalizeStream(stream));
  }

  async createCamera(tournamentId: string, user: JwtPayload, data: CreateCameraDto) {
    await this.assertTournamentOperator(tournamentId, user);
    const streamName = `camera_${randomUUID().replace(/-/g, '')}`;
    const streamKey = randomUUID().replace(/-/g, '');
    const playbackUrl = this.buildPlaybackUrl(streamName);

    const camera = await this.livestreamRepository.createCamera({
      tournamentId,
      name: data.name.trim(),
      protocol: data.protocol ?? 'RTMP',
      streamName,
      streamKey,
      playbackUrl,
      createdBy: user.sub,
    });

    return {
      ...camera,
      publish: this.buildPublishInfo(data.protocol ?? 'RTMP', streamName),
    };
  }

  async deleteCamera(cameraId: string, user: JwtPayload) {
    const camera = await this.livestreamRepository.findCameraById(cameraId);
    if (!camera) {
      throw new NotFoundException('Camera not found');
    }

    await this.assertTournamentOperator(camera.tournamentId, user);
    return this.livestreamRepository.deleteCamera(cameraId);
  }

  async assignCamera(matchId: string, user: JwtPayload, data: AssignCameraDto) {
    const match = await this.livestreamRepository.findMatchWithTournament(matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    await this.assertTournamentOperator(match.tournamentId, user);

    const camera = await this.livestreamRepository.findCameraById(data.cameraId);
    if (!camera || camera.tournamentId !== match.tournamentId) {
      throw new BadRequestException('Camera không thuộc giải đấu của trận này.');
    }

    return this.livestreamRepository.assignCameraToMatch(matchId, data.cameraId, camera.playbackUrl ?? '');
  }

  async startMatchStream(matchId: string, user: JwtPayload) {
    const match = await this.assertCanControlMatchStream(matchId, user);
    const stream = this.normalizeStream(await this.livestreamRepository.findMatchLivestream(matchId));

    if (!stream?.cameraId || !stream.streamKey) {
      throw new BadRequestException('Trận này chưa được BTC gán camera nên chưa thể bắt đầu livestream.');
    }

    if (!match.participant1Id || !match.participant2Id) {
      throw new BadRequestException('Trận chưa đủ hai đội nên chưa thể bắt đầu livestream.');
    }

    const playbackUrl = stream.cameraPlaybackUrl || this.buildPlaybackUrl(stream.streamKey);
    const livestream = await this.livestreamRepository.updateStreamStatus(matchId, 'LIVE', user.sub, playbackUrl);

    const protocol = stream.cameraProtocol === 'SRT' ? 'SRT' : 'RTMP';

    return {
      livestream,
      publish: this.buildPublishInfo(protocol, stream.streamName ?? stream.streamKey),
      playbackUrl,
    };
  }

  async stopMatchStream(matchId: string, user: JwtPayload) {
    await this.assertCanControlMatchStream(matchId, user);
    const stream = this.normalizeStream(await this.livestreamRepository.findMatchLivestream(matchId));

    if (!stream?.cameraId) {
      throw new BadRequestException('Trận này chưa được gán camera.');
    }

    // Stopping a broadcast is reversible. Recording/replay is a separate feature.
    return this.livestreamRepository.updateStreamStatus(matchId, 'IDLE', user.sub, null);
  }

  async getMatchPlayback(matchId: string) {
    const match = await this.livestreamRepository.findMatchWithTournament(matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const stream = this.normalizeStream(await this.livestreamRepository.findMatchLivestream(matchId));
    if (!stream?.cameraId) {
      return {
        matchId,
        streamStatus: 'OFFLINE',
        playbackUrl: null,
      };
    }

    return {
      matchId,
      streamStatus: stream.streamStatus,
      playbackUrl: stream.streamStatus === 'LIVE' ? stream.playbackUrl : null,
      cameraName: stream.cameraName,
      startedAt: stream.startedAt,
      endedAt: stream.endedAt,
    };
  }
}
