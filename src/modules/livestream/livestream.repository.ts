import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';

export type LivestreamProtocol = 'RTMP' | 'SRT';
export type LivestreamMode = 'PUSH' | 'PULL';

export interface CreateCameraInput {
  tournamentId: string;
  courtId: string | null;
  name: string;
  mode: LivestreamMode;
  protocol: LivestreamProtocol;
  streamName: string;
  streamKey: string;
  playbackUrl: string;
  createdBy: string;
}

@Injectable()
export class LivestreamRepository {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}

  async findTournamentById(tournamentId: string) {
    const [tournament] = await this.db
      .select({
        id: schema.tournaments.id,
        name: schema.tournaments.name,
        createdBy: schema.tournaments.createdBy,
      })
      .from(schema.tournaments)
      .where(and(eq(schema.tournaments.id, tournamentId), isNull(schema.tournaments.deletedAt)))
      .limit(1);

    return tournament ?? null;
  }

  async isTournamentStaff(tournamentId: string, userId: string) {
    const [result] = await this.db
      .select({ total: count() })
      .from(schema.tournamentStaff)
      .where(
        and(
          eq(schema.tournamentStaff.tournamentId, tournamentId),
          eq(schema.tournamentStaff.userId, userId),
          eq(schema.tournamentStaff.role, 'CO_ORGANIZER'),
        ),
      );

    return Number(result?.total ?? 0) > 0;
  }

  async listCameras(tournamentId: string) {
    return this.db
      .select()
      .from(schema.livestreamCameras)
      .where(
        and(
          eq(schema.livestreamCameras.tournamentId, tournamentId),
          isNull(schema.livestreamCameras.deletedAt),
        ),
      );
  }

  async createCamera(input: CreateCameraInput) {
    const [camera] = await this.db
      .insert(schema.livestreamCameras)
      .values(input)
      .returning();

    return camera;
  }

  /**
   * Camera PULL đang phục vụ một sân trong một giải. Cùng một sân có thể được khai
   * URL khác ở giải khác, nên phải lọc cả tournamentId chứ không chỉ courtId.
   */
  /** Giải sở hữu sân, để chặn việc gán camera của giải này sang sân của giải khác. */
  /**
   * Camera PULL đang phục vụ một sân. Không lọc theo giải: `venue_courts` thuộc về
   * địa điểm dùng chung, và `matches.courtId` đã xác định sân nên giải không cần
   * tham gia. Sân dùng lại ở giải khác sẽ dùng đúng URL này.
   */
  /**
   * Các giải có thể dùng sân này. Giải nối với địa điểm qua HAI đường:
   * `tournaments.venueId` (địa điểm mặc định) và `tournament_stages.venueId`
   * (địa điểm theo vòng). Thiếu một trong hai sẽ chặn nhầm sân hợp lệ.
   */
  async findTournamentIdsUsingCourt(courtId: string) {
    const [court] = await this.db
      .select({ venueId: schema.venueCourts.venueId })
      .from(schema.venueCourts)
      .where(eq(schema.venueCourts.id, courtId))
      .limit(1);
    if (!court) return [];

    const mainRows = await this.db
      .select({ tournamentId: schema.tournaments.id })
      .from(schema.tournaments)
      .where(eq(schema.tournaments.venueId, court.venueId));

    const stageRows = await this.db
      .select({ tournamentId: schema.tournamentStages.tournamentId })
      .from(schema.tournamentStages)
      .where(eq(schema.tournamentStages.venueId, court.venueId));

    return [...new Set([...mainRows, ...stageRows].map((r) => r.tournamentId))];
  }


  /** Xoá mềm camera: giữ dòng dữ liệu để URL cũ còn truy vết được. */
  async archiveCamera(cameraId: string) {
    await this.db
      .update(schema.livestreamCameras)
      .set({ status: 'ARCHIVED', deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.livestreamCameras.id, cameraId));
  }

  async updatePullCameraUrl(cameraId: string, name: string, playbackUrl: string) {
    const [camera] = await this.db
      .update(schema.livestreamCameras)
      .set({ name, playbackUrl, status: 'IDLE', updatedAt: new Date() })
      .where(eq(schema.livestreamCameras.id, cameraId))
      .returning();

    return camera ?? null;
  }


  async findPullCameraByCourt(courtId: string) {
    const [camera] = await this.db
      .select()
      .from(schema.livestreamCameras)
      .where(
        and(
          eq(schema.livestreamCameras.courtId, courtId),
          eq(schema.livestreamCameras.mode, 'PULL'),
          isNull(schema.livestreamCameras.deletedAt),
        ),
      )
      .orderBy(desc(schema.livestreamCameras.updatedAt))
      .limit(1);

    return camera ?? null;
  }

  async findCameraById(cameraId: string) {
    const [camera] = await this.db
      .select()
      .from(schema.livestreamCameras)
      .where(and(eq(schema.livestreamCameras.id, cameraId), isNull(schema.livestreamCameras.deletedAt)))
      .limit(1);

    return camera ?? null;
  }

  async deleteCamera(cameraId: string) {
    await this.db
      .update(schema.matchLivestreams)
      .set({
        cameraId: null,
        streamStatus: 'IDLE',
        playbackUrl: null,
        endedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.matchLivestreams.cameraId, cameraId));

    const [camera] = await this.db
      .update(schema.livestreamCameras)
      .set({
        status: 'ARCHIVED',
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.livestreamCameras.id, cameraId))
      .returning();

    return camera ?? null;
  }

  async findMatchWithTournament(matchId: string) {
    const [row] = await this.db
      .select({
        id: schema.matches.id,
        tournamentId: schema.matches.tournamentId,
        status: schema.matches.status,
        refereeId: schema.matches.refereeId,
        participant1Id: schema.matches.participant1Id,
        participant2Id: schema.matches.participant2Id,
        courtId: schema.matches.courtId,
        tournamentCreatedBy: schema.tournaments.createdBy,
        tournamentName: schema.tournaments.name,
        tournamentStatus: schema.tournaments.status,
        tournamentVisibility: schema.tournaments.visibility,
      })
      .from(schema.matches)
      .innerJoin(schema.tournaments, eq(schema.matches.tournamentId, schema.tournaments.id))
      .where(and(eq(schema.matches.id, matchId), isNull(schema.matches.deletedAt), isNull(schema.tournaments.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  async findMatchLivestream(matchId: string) {
    const [row] = await this.db
      .select({
        id: schema.matchLivestreams.id,
        matchId: schema.matchLivestreams.matchId,
        // Read the id from the active joined camera. A soft-deleted camera
        // must behave as an unassigned stream, not as a stale assignment.
        cameraId: schema.livestreamCameras.id,
        streamStatus: schema.matchLivestreams.streamStatus,
        playbackUrl: schema.matchLivestreams.playbackUrl,
        recordingUrl: schema.matchLivestreams.recordingUrl,
        isFeatured: schema.matchLivestreams.isFeatured,
        startedAt: schema.matchLivestreams.startedAt,
        endedAt: schema.matchLivestreams.endedAt,
        cameraName: schema.livestreamCameras.name,
        cameraStatus: schema.livestreamCameras.status,
        cameraPlaybackUrl: schema.livestreamCameras.playbackUrl,
        cameraProtocol: schema.livestreamCameras.protocol,
        streamName: schema.livestreamCameras.streamName,
        streamKey: schema.livestreamCameras.streamKey,
        cameraMode: schema.livestreamCameras.mode,
      })
      .from(schema.matchLivestreams)
      .leftJoin(
        schema.livestreamCameras,
        and(
          eq(schema.matchLivestreams.cameraId, schema.livestreamCameras.id),
          isNull(schema.livestreamCameras.deletedAt),
        ),
      )
      .where(eq(schema.matchLivestreams.matchId, matchId))
      .limit(1);

    return row ?? null;
  }

  async listMatchLivestreams(tournamentId: string) {
    return this.db
      .select({
        id: schema.matchLivestreams.id,
        matchId: schema.matchLivestreams.matchId,
        // Do not expose a deleted camera id from the match row.
        cameraId: schema.livestreamCameras.id,
        streamStatus: schema.matchLivestreams.streamStatus,
        playbackUrl: schema.matchLivestreams.playbackUrl,
        recordingUrl: schema.matchLivestreams.recordingUrl,
        isFeatured: schema.matchLivestreams.isFeatured,
        startedAt: schema.matchLivestreams.startedAt,
        endedAt: schema.matchLivestreams.endedAt,
        cameraName: schema.livestreamCameras.name,
      })
      .from(schema.matchLivestreams)
      .innerJoin(schema.matches, eq(schema.matchLivestreams.matchId, schema.matches.id))
      .leftJoin(
        schema.livestreamCameras,
        and(
          eq(schema.matchLivestreams.cameraId, schema.livestreamCameras.id),
          isNull(schema.livestreamCameras.deletedAt),
        ),
      )
      .where(and(eq(schema.matches.tournamentId, tournamentId), isNull(schema.matches.deletedAt)));
  }

  async assignCameraToMatch(matchId: string, cameraId: string, playbackUrl: string) {
    const [existing] = await this.db
      .select({ cameraId: schema.matchLivestreams.cameraId })
      .from(schema.matchLivestreams)
      .where(eq(schema.matchLivestreams.matchId, matchId))
      .limit(1);

    const [stream] = await this.db
      .insert(schema.matchLivestreams)
      .values({
        matchId,
        cameraId,
        playbackUrl,
        streamStatus: 'IDLE',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.matchLivestreams.matchId,
        set: {
          cameraId,
          playbackUrl,
          streamStatus: 'IDLE',
          startedAt: null,
          endedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    await this.syncCameraStatus(cameraId);
    if (existing?.cameraId && existing.cameraId !== cameraId) {
      await this.syncCameraStatus(existing.cameraId);
    }

    return stream;
  }

  async updateStreamStatus(
    matchId: string,
    status: 'IDLE' | 'LIVE',
    _userId: string | null,
    playbackUrl: string | null,
  ) {
    const setValues =
      status === 'LIVE'
        ? {
            streamStatus: status,
            playbackUrl,
            startedAt: new Date(),
            endedAt: null,
            updatedAt: new Date(),
          }
        : {
            streamStatus: status,
            playbackUrl: null,
            startedAt: null,
            endedAt: null,
            updatedAt: new Date(),
          };

    const [stream] = await this.db
      .update(schema.matchLivestreams)
      .set(setValues)
      .where(eq(schema.matchLivestreams.matchId, matchId))
      .returning();

    if (stream?.cameraId) {
      // Camera status is derived from all active match assignments. Updating
      // one match must not make another match appear LIVE or stopped.
      await this.syncCameraStatus(stream.cameraId);
    }

    return stream ?? null;
  }

  private async syncCameraStatus(cameraId: string) {
    const assignments = await this.db
      .select({ streamStatus: schema.matchLivestreams.streamStatus })
      .from(schema.matchLivestreams)
      .innerJoin(schema.matches, eq(schema.matchLivestreams.matchId, schema.matches.id))
      .where(
        and(
          eq(schema.matchLivestreams.cameraId, cameraId),
          isNull(schema.matches.deletedAt),
        ),
      );

    const status = assignments.some((item) => item.streamStatus === 'LIVE')
      ? 'LIVE'
      : assignments.length > 0
        ? 'ASSIGNED'
        : 'IDLE';

    await this.db
      .update(schema.livestreamCameras)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(schema.livestreamCameras.id, cameraId),
          isNull(schema.livestreamCameras.deletedAt),
        ),
      );
  }
}
