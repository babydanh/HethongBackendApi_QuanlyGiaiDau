import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { LivestreamRepository } from './livestream.repository';
import {
  FacebookLiveProviderException,
  FacebookLiveService,
  type FacebookPublishConfig,
} from './facebook-live.service';
import {
  type CreateLiveSessionInput,
  LiveSessionRepository,
  type LiveSessionMonitorRow,
  type LiveSessionRow,
} from './live-session.repository';
import {
  ACTIVE_LIVE_SESSION_STATUSES,
  type LivestreamFailureCode,
  type LiveSessionStatus,
} from './livestream-contracts';

export interface PrepareLiveSessionInput {
  readonly tournamentId: string;
  readonly courtId: string;
  readonly matchId: string;
  readonly cameraDeviceId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly idempotencyKey: string;
}

export interface LiveSessionOperatorResult {
  readonly session: LiveSessionRow;
  readonly publishConfig?: FacebookPublishConfig;
}

@Injectable()
export class LiveSessionService {
  constructor(
    private readonly liveSessionRepository: LiveSessionRepository,
    private readonly livestreamRepository: LivestreamRepository,
    private readonly facebookLiveService: FacebookLiveService,
  ) {}

  async prepareSession(
    input: PrepareLiveSessionInput,
    user: JwtPayload,
  ): Promise<LiveSessionOperatorResult> {
    const existingByKey =
      await this.liveSessionRepository.findLiveSessionByIdempotencyKey(
        input.idempotencyKey,
      );
    if (existingByKey) {
      await this.assertSessionAccess(existingByKey.id, user);
      return { session: existingByKey };
    }

    const context = await this.liveSessionRepository.findMatchContext(
      input.matchId,
    );
    if (!context || context.tournamentId !== input.tournamentId) {
      throw new NotFoundException('Trận đấu không tồn tại.');
    }
    if (context.matchCourtId && context.matchCourtId !== input.courtId) {
      throw this.domainError(
        'COURT_ALREADY_LIVE',
        'Sân được chọn không khớp với trận đấu.',
      );
    }
    const device = await this.liveSessionRepository.findCameraDeviceById(
      input.cameraDeviceId,
    );
    if (!device || device.communityId !== context.tournamentCommunityId) {
      throw this.domainError(
        'CAMERA_NOT_READY',
        'Camera chưa sẵn sàng cho community này.',
      );
    }
    const hasTournamentOperatorAccess = await this.hasTournamentOperatorAccess(
      input.tournamentId,
      user,
    );
    if (
      (!device.assignedOperatorId && !hasTournamentOperatorAccess) ||
      (device.assignedOperatorId &&
        device.assignedOperatorId !== user.sub &&
        !hasTournamentOperatorAccess)
    ) {
      throw new ForbiddenException(
        device.assignedOperatorId
          ? 'Camera này chưa được phân công cho bạn.'
          : 'Bạn không có quyền điều khiển camera chưa được phân công.',
      );
    }
    if (
      !device.deviceFingerprintHash ||
      !device.pairedAt ||
      !['READY', 'ONLINE', 'OFFLINE'].includes(device.status)
    ) {
      throw this.domainError(
        'CAMERA_NOT_READY',
        'Camera chưa được ghép với điện thoại.',
      );
    }

    const activeMatch =
      await this.liveSessionRepository.findActiveLiveSessionByMatchId(
        input.matchId,
      );
    if (activeMatch) {
      throw this.domainError(
        'MATCH_ALREADY_LIVE',
        'Trận này đang có một phiên livestream.',
      );
    }
    const activeCourt =
      await this.liveSessionRepository.findActiveLiveSessionByCourtId(
        input.courtId,
      );
    if (activeCourt) {
      throw this.domainError(
        'COURT_ALREADY_LIVE',
        'Sân này đang livestream một trận khác.',
      );
    }
    const activeCamera =
      await this.liveSessionRepository.findActiveLiveSessionByCameraDeviceId(
        input.cameraDeviceId,
      );
    if (activeCamera) {
      throw this.domainError(
        'CAMERA_ALREADY_LIVE',
        'Camera này đang được dùng cho phiên khác.',
      );
    }

    if (!context.tournamentCommunityId) {
      throw this.domainError(
        'FACEBOOK_NOT_CONNECTED',
        'Giải đấu chưa thuộc community có Facebook Page.',
      );
    }
    const pageConnection =
      await this.liveSessionRepository.findActiveFacebookPageConnection(
        context.tournamentCommunityId,
      );
    if (!pageConnection) {
      throw this.domainError(
        'FACEBOOK_NOT_CONNECTED',
        'BTC chưa kết nối Facebook Page.',
      );
    }

    const sessionInput: CreateLiveSessionInput = {
      tournamentId: input.tournamentId,
      courtId: input.courtId,
      matchId: input.matchId,
      cameraDeviceId: input.cameraDeviceId,
      provider: 'FACEBOOK',
      status: 'CREATED',
      title: input.title.trim(),
      description: input.description?.trim() || null,
      idempotencyKey: input.idempotencyKey,
      createdBy: user.sub,
    };

    let session: LiveSessionRow;
    try {
      session =
        await this.liveSessionRepository.createLiveSession(sessionInput);
    } catch {
      const conflicted =
        await this.liveSessionRepository.findLiveSessionByIdempotencyKey(
          input.idempotencyKey,
        );
      if (conflicted) {
        await this.assertSessionAccess(conflicted.id, user);
        return { session: conflicted };
      }
      throw this.domainError(
        'UNKNOWN_PROVIDER_ERROR',
        'Không thể tạo phiên livestream.',
      );
    }

    const starting =
      await this.liveSessionRepository.transitionLiveSessionStatus(
        session.id,
        'CREATED',
        'STARTING',
      );
    if (!starting) {
      throw this.domainError(
        'INVALID_SESSION_TRANSITION',
        'Phiên livestream không thể bắt đầu.',
      );
    }

    try {
      const created = await this.facebookLiveService.createLiveVideo(
        pageConnection.id,
        input.title.trim(),
        input.description?.trim() || null,
      );
      const updated = await this.liveSessionRepository.updateLiveSession(
        session.id,
        {
          providerSessionId: created.providerSessionId,
          publishConfigExpiresAt: created.publishConfig.expiresAt,
        },
      );

      return {
        session: updated ?? {
          ...starting,
          providerSessionId: created.providerSessionId,
        },
        publishConfig: created.publishConfig,
      };
    } catch (error) {
      const failure = this.toFailure(error);
      const failed =
        await this.liveSessionRepository.transitionLiveSessionStatus(
          session.id,
          'STARTING',
          'FAILED',
          {
            failureCode: failure.code,
            failureMessage: failure.message,
          },
        );
      throw this.domainError(
        failure.code,
        failed?.failureMessage ?? failure.message,
      );
    }
  }

  async markPublisherStarted(
    sessionId: string,
    user: JwtPayload,
  ): Promise<LiveSessionOperatorResult> {
    const session = await this.getAuthorizedSession(sessionId, user);
    if (session.status !== 'STARTING' || !session.providerSessionId) {
      return { session };
    }

    const pageConnection = await this.getPageConnectionForSession(session);
    try {
      const provider = await this.facebookLiveService.getLiveVideoStatus(
        pageConnection.id,
        session.providerSessionId,
      );
      if (!provider.isLive) {
        return {
          session:
            (await this.liveSessionRepository.updateLiveSession(session.id, {
              lastProviderCheckAt: new Date(),
            })) ?? session,
        };
      }
      const live = await this.liveSessionRepository.transitionLiveSessionStatus(
        session.id,
        'STARTING',
        'LIVE',
        { startedAt: new Date(), lastProviderCheckAt: new Date() },
      );
      return { session: live ?? session };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async heartbeat(
    sessionId: string,
    user: JwtPayload,
  ): Promise<LiveSessionRow> {
    const session = await this.getAuthorizedSession(sessionId, user);
    if (
      !ACTIVE_LIVE_SESSION_STATUSES.includes(
        session.status as LiveSessionStatus,
      )
    ) {
      return session;
    }
    if (!session.providerSessionId) {
      return session;
    }

    const pageConnection = await this.getPageConnectionForSession(session);
    try {
      const provider = await this.facebookLiveService.getLiveVideoStatus(
        pageConnection.id,
        session.providerSessionId,
      );
      const checkedAt = new Date();
      if (provider.isLive && session.status === 'STARTING') {
        return (
          (await this.liveSessionRepository.transitionLiveSessionStatus(
            session.id,
            'STARTING',
            'LIVE',
            {
              startedAt: session.startedAt ?? checkedAt,
              lastProviderCheckAt: checkedAt,
            },
          )) ?? session
        );
      }
      if (!provider.isLive && session.status === 'LIVE') {
        return (
          (await this.liveSessionRepository.transitionLiveSessionStatus(
            session.id,
            'LIVE',
            'RECONNECTING',
            { lastProviderCheckAt: checkedAt },
          )) ?? session
        );
      }
      return (
        (await this.liveSessionRepository.updateLiveSession(session.id, {
          lastProviderCheckAt: checkedAt,
          replayUrl: provider.replayUrl,
        })) ?? session
      );
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async checkSessionHealth(sessionId: string): Promise<void> {
    const session =
      await this.liveSessionRepository.findLiveSessionById(sessionId);
    if (
      !session ||
      !session.providerSessionId ||
      !['STARTING', 'LIVE', 'RECONNECTING'].includes(session.status)
    ) {
      return;
    }

    try {
      const pageConnection = await this.getPageConnectionForSession(session);
      const provider = await this.facebookLiveService.getLiveVideoStatus(
        pageConnection.id,
        session.providerSessionId,
      );
      const checkedAt = new Date();

      if (provider.isLive && session.status === 'STARTING') {
        await this.liveSessionRepository.transitionLiveSessionStatus(
          session.id,
          'STARTING',
          'LIVE',
          {
            startedAt: session.startedAt ?? checkedAt,
            lastProviderCheckAt: checkedAt,
            replayUrl: provider.replayUrl,
            replayProvider: provider.replayUrl ? 'FACEBOOK' : 'NONE',
          },
        );
        return;
      }

      if (!provider.isLive && session.status === 'LIVE') {
        await this.liveSessionRepository.transitionLiveSessionStatus(
          session.id,
          'LIVE',
          'RECONNECTING',
          {
            lastProviderCheckAt: checkedAt,
            replayUrl: provider.replayUrl,
            replayProvider: provider.replayUrl ? 'FACEBOOK' : 'NONE',
          },
        );
        return;
      }

      if (provider.isLive && session.status === 'RECONNECTING') {
        await this.liveSessionRepository.transitionLiveSessionStatus(
          session.id,
          'RECONNECTING',
          'LIVE',
          {
            startedAt: session.startedAt ?? checkedAt,
            lastProviderCheckAt: checkedAt,
            replayUrl: provider.replayUrl,
            replayProvider: provider.replayUrl ? 'FACEBOOK' : 'NONE',
          },
        );
        return;
      }

      await this.liveSessionRepository.updateLiveSession(session.id, {
        lastProviderCheckAt: checkedAt,
        ...(provider.replayUrl
          ? {
              replayUrl: provider.replayUrl,
              replayProvider: 'FACEBOOK' as const,
            }
          : {}),
      });
    } catch (error) {
      const failure = this.toFailure(error);
      await this.liveSessionRepository.updateLiveSession(session.id, {
        lastProviderCheckAt: new Date(),
        failureCode: failure.code,
        failureMessage: failure.message,
      });
    }
  }

  async reconnectSession(
    sessionId: string,
    user: JwtPayload,
  ): Promise<LiveSessionOperatorResult> {
    const session = await this.getAuthorizedSession(sessionId, user);
    if (
      !['STARTING', 'RECONNECTING'].includes(session.status) ||
      !session.providerSessionId
    ) {
      return { session };
    }

    const pageConnection = await this.getPageConnectionForSession(session);
    try {
      const provider = await this.facebookLiveService.getLiveVideoStatus(
        pageConnection.id,
        session.providerSessionId,
      );
      const checkedAt = new Date();
      if (provider.isLive && session.status === 'STARTING') {
        const live =
          await this.liveSessionRepository.transitionLiveSessionStatus(
            session.id,
            'STARTING',
            'LIVE',
            {
              startedAt: session.startedAt ?? checkedAt,
              lastProviderCheckAt: checkedAt,
            },
          );
        return { session: live ?? session };
      }
      if (provider.isLive && session.status === 'RECONNECTING') {
        const live =
          await this.liveSessionRepository.transitionLiveSessionStatus(
            session.id,
            'RECONNECTING',
            'LIVE',
            {
              startedAt: session.startedAt ?? checkedAt,
              lastProviderCheckAt: checkedAt,
            },
          );
        return { session: live ?? session };
      }
      const checked = await this.liveSessionRepository.updateLiveSession(
        session.id,
        {
          lastProviderCheckAt: checkedAt,
        },
      );
      return { session: checked ?? session };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async stopSession(
    sessionId: string,
    user: JwtPayload,
  ): Promise<LiveSessionRow> {
    const session = await this.getAuthorizedSession(sessionId, user);
    if (session.status === 'ENDED' || session.status === 'FAILED') {
      return session;
    }
    const stoppableStatuses: readonly LiveSessionStatus[] = [
      'CREATED',
      'STARTING',
      'LIVE',
      'RECONNECTING',
      'STOPPING',
    ];
    if (!stoppableStatuses.includes(session.status as LiveSessionStatus)) {
      throw this.domainError(
        'INVALID_SESSION_TRANSITION',
        'Phiên livestream không thể dừng.',
      );
    }
    const currentStatus = session.status as LiveSessionStatus;
    if (currentStatus !== 'STOPPING') {
      const stopping =
        await this.liveSessionRepository.transitionLiveSessionStatus(
          session.id,
          currentStatus,
          'STOPPING',
        );
      if (!stopping) {
        throw this.domainError(
          'INVALID_SESSION_TRANSITION',
          'Phiên livestream đang được xử lý.',
        );
      }
    }
    if (!session.providerSessionId) {
      return (
        (await this.liveSessionRepository.transitionLiveSessionStatus(
          session.id,
          'STOPPING',
          'ENDED',
          { endedAt: new Date(), replayProvider: 'NONE' },
        )) ?? session
      );
    }

    const pageConnection = await this.getPageConnectionForSession(session);
    try {
      await this.facebookLiveService.endLiveVideo(
        pageConnection.id,
        session.providerSessionId,
      );
      const replay = await this.facebookLiveService.getReplayMetadata(
        pageConnection.id,
        session.providerSessionId,
      );
      return (
        (await this.liveSessionRepository.transitionLiveSessionStatus(
          session.id,
          'STOPPING',
          'ENDED',
          {
            endedAt: new Date(),
            replayUrl: replay.replayUrl,
            replayProvider: replay.replayUrl ? 'FACEBOOK' : 'NONE',
            failureCode: null,
            failureMessage: null,
          },
        )) ?? session
      );
    } catch (error) {
      const failure = this.toFailure(error);
      await this.liveSessionRepository.transitionLiveSessionStatus(
        session.id,
        'STOPPING',
        'FAILED',
        {
          endedAt: new Date(),
          failureCode: failure.code,
          failureMessage: failure.message,
        },
      );
      throw this.toHttpError(error);
    }
  }

  async getSession(
    sessionId: string,
    user: JwtPayload,
  ): Promise<LiveSessionRow> {
    return this.getAuthorizedSession(sessionId, user);
  }

  async listSessions(
    tournamentId: string,
    user: JwtPayload,
  ): Promise<LiveSessionMonitorRow[]> {
    await this.assertTournamentOperator(tournamentId, user);
    return this.liveSessionRepository.listLiveSessionsByTournamentId(
      tournamentId,
    );
  }

  async getMatchPlayback(matchId: string) {
    const match =
      await this.livestreamRepository.findMatchWithTournament(matchId);
    if (!match || match.tournamentVisibility !== 'PUBLIC') {
      throw new NotFoundException('Trận đấu không tồn tại.');
    }
    const session =
      await this.liveSessionRepository.findLatestLiveSessionByMatchId(matchId);
    if (session) {
      return {
        matchId,
        provider: session.provider,
        providerSessionId: session.providerSessionId,
        status: session.status,
        replayUrl: session.replayUrl,
        playbackUrl: session.status === 'LIVE' ? null : session.replayUrl,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
      };
    }
    return null;
  }

  private async getAuthorizedSession(
    sessionId: string,
    user: JwtPayload,
  ): Promise<LiveSessionRow> {
    const session =
      await this.liveSessionRepository.findLiveSessionById(sessionId);
    if (!session) {
      throw this.domainError(
        'SESSION_NOT_FOUND',
        'Phiên livestream không tồn tại.',
      );
    }
    await this.assertSessionAccess(session.id, user);
    return session;
  }

  private async assertSessionAccess(
    sessionId: string,
    user: JwtPayload,
  ): Promise<void> {
    const session =
      await this.liveSessionRepository.findLiveSessionWithCommunity(sessionId);
    if (!session) {
      throw this.domainError(
        'SESSION_NOT_FOUND',
        'Phiên livestream không tồn tại.',
      );
    }
    const hasTournamentOperatorAccess = await this.hasTournamentOperatorAccess(
      session.session.tournamentId,
      user,
    );
    if (hasTournamentOperatorAccess) {
      return;
    }
    if (session.session.cameraDeviceId) {
      const device = await this.liveSessionRepository.findCameraDeviceById(
        session.session.cameraDeviceId,
      );
      if (
        device?.communityId === session.communityId &&
        device.status !== 'REVOKED' &&
        device.assignedOperatorId === user.sub
      ) {
        return;
      }
    }
    throw new ForbiddenException(
      'Bạn không có quyền điều khiển phiên livestream này.',
    );
  }

  private async getPageConnectionForSession(session: LiveSessionRow) {
    const context = await this.liveSessionRepository.findMatchContext(
      session.matchId,
    );
    if (!context?.tournamentCommunityId) {
      throw this.domainError(
        'FACEBOOK_NOT_CONNECTED',
        'Giải đấu chưa có Facebook Page.',
      );
    }
    const connection =
      await this.liveSessionRepository.findActiveFacebookPageConnection(
        context.tournamentCommunityId,
      );
    if (!connection) {
      throw this.domainError(
        'FACEBOOK_CONNECTION_EXPIRED',
        'Kết nối Facebook cần được xác thực lại.',
      );
    }
    return connection;
  }

  private async hasTournamentOperatorAccess(
    tournamentId: string,
    user: JwtPayload,
  ): Promise<boolean> {
    const tournament =
      await this.livestreamRepository.findTournamentById(tournamentId);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại.');
    }
    if (this.isAdmin(user) || tournament.createdBy === user.sub) {
      return true;
    }
    return this.livestreamRepository.isTournamentStaff(tournamentId, user.sub);
  }

  private async assertTournamentOperator(
    tournamentId: string,
    user: JwtPayload,
  ): Promise<void> {
    if (await this.hasTournamentOperatorAccess(tournamentId, user)) {
      return;
    }
    throw new ForbiddenException(
      'Bạn không có quyền điều khiển livestream giải đấu này.',
    );
  }

  private isAdmin(user: JwtPayload): boolean {
    return user.role === 'ADMIN' || user.roles?.includes('ADMIN') === true;
  }

  private domainError(
    code: LivestreamFailureCode,
    message: string,
  ): BadRequestException {
    return new BadRequestException({ code, message });
  }

  private toHttpError(error: unknown): BadRequestException {
    if (error instanceof FacebookLiveProviderException) {
      return this.domainError(error.failureCode, error.message);
    }
    if (error instanceof BadRequestException) {
      return error;
    }
    return this.domainError(
      'UNKNOWN_PROVIDER_ERROR',
      'Không thể hoàn tất thao tác livestream.',
    );
  }

  private toFailure(error: unknown): {
    code: LivestreamFailureCode;
    message: string;
  } {
    if (error instanceof FacebookLiveProviderException) {
      return { code: error.failureCode, message: error.message };
    }
    return {
      code: 'UNKNOWN_PROVIDER_ERROR',
      message: 'Facebook không thể xử lý yêu cầu livestream.',
    };
  }
}
