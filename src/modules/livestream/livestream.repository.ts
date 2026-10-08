import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';
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
  /** Khoá proxy AQP của camera PULL có nguồn là camera IP; `null` với mọi nguồn khác. */
  pullProxyKey?: string | null;
  createdBy: string;
}

/**
 * Projection điều phối ghi MP4 của một camera: camera còn assignment
 * trận (trận chưa xoá mềm, camera chưa xoá mềm), kèm stream name
 * để gọi AQVision và cờ có assignment `LIVE` hay không.
 */
export interface CameraRecordingTarget {
  cameraId: string;
  streamName: string;
  /** Ít nhất một assignment `LIVE` trên một trận chưa xoá mềm. */
  hasLiveAssignment: boolean;
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
      .select({
        id: schema.livestreamCameras.id,
        tournamentId: schema.livestreamCameras.tournamentId,
        name: schema.livestreamCameras.name,
        mode: schema.livestreamCameras.mode,
        courtId: schema.livestreamCameras.courtId,
        protocol: schema.livestreamCameras.protocol,
        streamName: schema.livestreamCameras.streamName,
        status: schema.livestreamCameras.status,
        playbackUrl: schema.livestreamCameras.playbackUrl,
        createdAt: schema.livestreamCameras.createdAt,
        updatedAt: schema.livestreamCameras.updatedAt,
      })
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
   * Cấp lại danh tính stream của một camera PUSH: `streamName` (cũng là stream
   * key mà broadcaster nhập) và `streamKey` (credential nội bộ), kèm URL phát
   * dựng lại theo tên mới.
   *
   * `livestreamCameras.streamName` có unique index, nên lần gọi này có thể ném
   * lỗi trùng khoá; caller chịu trách nhiệm thử lại với tên khác
   * (`rotateCameraStreamKey` trong service).
   */
  async updateCameraStreamIdentity(
    cameraId: string,
    values: { streamName: string; streamKey: string; playbackUrl: string },
  ) {
    const [camera] = await this.db
      .update(schema.livestreamCameras)
      .set({ ...values, status: 'IDLE', updatedAt: new Date() })
      .where(
        and(
          eq(schema.livestreamCameras.id, cameraId),
          isNull(schema.livestreamCameras.deletedAt),
        ),
      )
      .returning();

    return camera ?? null;
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

  /**
   * Ngắt camera của một sân khỏi các trận đang dùng nó, rồi archive camera.
   *
   * Gọi TRƯỚC khi xoá sân: `livestream_cameras.court_id` là `ON DELETE SET NULL`,
   * nên xoá sân xong sẽ không còn cách nào tìm ra camera thuộc sân đó. Nếu không
   * dọn, dòng `match_livestreams` còn trỏ camera mồ côi và trận sẽ phát nhầm
   * camera của một sân đã bị xoá.
   */
  async detachCamerasForCourt(courtId: string) {
    const cameras = await this.db
      .select({ id: schema.livestreamCameras.id })
      .from(schema.livestreamCameras)
      .where(
        and(
          eq(schema.livestreamCameras.courtId, courtId),
          isNull(schema.livestreamCameras.deletedAt),
        ),
      );

    if (cameras.length === 0) return 0;
    const cameraIds = cameras.map((c) => c.id);
    const now = new Date();

    // Xoá hẳn dòng gán: nó chỉ là bản ghi "trận này dùng camera này", không giữ
    // dữ liệu nghiệp vửu. Giữ lại sẽ làm playbackUrl cũ tiếp tục tồn tại.
    await this.db
      .delete(schema.matchLivestreams)
      .where(inArray(schema.matchLivestreams.cameraId, cameraIds));

    await this.db
      .update(schema.livestreamCameras)
      .set({ status: 'ARCHIVED', deletedAt: now, updatedAt: now })
      .where(inArray(schema.livestreamCameras.id, cameraIds));

    return cameraIds.length;
  }

  async updatePullCameraUrl(cameraId: string, name: string, playbackUrl: string) {
    const [camera] = await this.db
      .update(schema.livestreamCameras)
      .set({ name, playbackUrl, status: 'IDLE', updatedAt: new Date() })
      .where(eq(schema.livestreamCameras.id, cameraId))
      .returning();

    return camera ?? null;
  }


  /**
   * Tìm camera PULL gắn với sân trong đúng giải đấu.
   *
   * Một sân có thể dùng cho nhiều giải, mỗi giải một camera riêng, nên bắt buộc
   * lọc theo tournamentId — lọc theo courtId một mình sẽ trả camera của giải
   * khác và làm lộ URL phát sang giải không liên quan.
   */
  async findPullCameraByCourt(courtId: string, tournamentId: string) {
    const [camera] = await this.db
      .select()
      .from(schema.livestreamCameras)
      .where(
        and(
          eq(schema.livestreamCameras.courtId, courtId),
          eq(schema.livestreamCameras.tournamentId, tournamentId),
          eq(schema.livestreamCameras.mode, 'PULL'),
          isNull(schema.livestreamCameras.deletedAt),
        ),
      )
      .orderBy(desc(schema.livestreamCameras.updatedAt))
      .limit(1);

    return camera ?? null;
  }

  /**
   * Tìm camera đang hoạt động của sân, PUSH hay PULL đều nhận.
   *
   * Chỉ dùng cho đường đọc (gán sẵn cho trận, dựng URL phát). Đường ghi của
   * PULL vẫn phải dùng `findPullCameraByCourt`, nếu không thì việc BTC dán URL
   * PULL sẽ nhảy vào camera PUSH của sân và đè mất playbackUrl của nó.
   *
   * Sân có cả PULL lẫn PUSH thì URL BTC khai (PULL) THẮNG. Trước đây chỉ xếp theo
   * `updatedAt`, nên thêm một camera PUSH là URL phát của sân bị che: khán giả
   * nhận URL của camera chưa ai đẩy luồng và thấy màn đen dù sân vẫn đang phát.
   * PULL là luồng BTC tuyên bố cho CẢ sân; PUSH chỉ là thiết bị phụ.
   */
  async findActiveCameraByCourt(courtId: string, tournamentId: string) {
    const [camera] = await this.db
      .select()
      .from(schema.livestreamCameras)
      .where(
        and(
          eq(schema.livestreamCameras.courtId, courtId),
          eq(schema.livestreamCameras.tournamentId, tournamentId),
          isNull(schema.livestreamCameras.deletedAt),
        ),
      )
      .orderBy(
        desc(sql`(${schema.livestreamCameras.mode} = 'PULL')`),
        desc(schema.livestreamCameras.updatedAt),
      )
      .limit(1);

    return camera ?? null;
  }

  /**
   * Các trận của một sân CHƯA có camera nào. Dùng khi BTC khai camera cho sân sau
   * khi lịch đã xếp: những trận đó phải được gán camera của sân, nếu không nút
   * "Bắt đầu" hiện sáng nhưng API từ chối.
   *
   * Trận đã gán camera (tay hoặc của sân) bị loại, nên thao tác này không bao giờ
   * ghi đè lựa chọn thủ công hay reset một luồng đang chạy. Phép join thứ hai lọc
   * `deletedAt` giống `findMatchLivestream`: camera đã xoá mềm được coi như chưa
   * gán, nếu không trận còn trỏ camera mồ côi sẽ không bao giờ được gán lại.
   */
  async listMatchIdsWithoutCameraOnCourt(courtId: string, tournamentId: string) {
    const rows = await this.db
      .select({ id: schema.matches.id })
      .from(schema.matches)
      .leftJoin(
        schema.matchLivestreams,
        eq(schema.matchLivestreams.matchId, schema.matches.id),
      )
      .leftJoin(
        schema.livestreamCameras,
        and(
          eq(schema.matchLivestreams.cameraId, schema.livestreamCameras.id),
          isNull(schema.livestreamCameras.deletedAt),
        ),
      )
      .where(
        and(
          eq(schema.matches.courtId, courtId),
          eq(schema.matches.tournamentId, tournamentId),
          isNull(schema.matches.deletedAt),
          isNull(schema.livestreamCameras.id),
        ),
      );

    return rows.map((row) => row.id);
  }

  async findCameraById(cameraId: string) {
    const [camera] = await this.db
      .select()
      .from(schema.livestreamCameras)
      .where(and(eq(schema.livestreamCameras.id, cameraId), isNull(schema.livestreamCameras.deletedAt)))
      .limit(1);

    return camera ?? null;
  }

  /** Ghi trạng thái phát hiện được từ media server (IDLE / LIVE / OFFLINE). */
  async updateCameraStatus(cameraId: string, status: string) {
    const [camera] = await this.db
      .update(schema.livestreamCameras)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(schema.livestreamCameras.id, cameraId),
          isNull(schema.livestreamCameras.deletedAt),
        ),
      )
      .returning();

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

  async findStandaloneMatchPlayback(matchId: string, userId?: string) {
    const [row] = await this.db
      .select({
        status: schema.clubStandaloneMatches.status,
        playbackUrl: schema.clubStandaloneMatches.playbackUrl,
        cameraName: schema.clubStandaloneMatches.cameraName,
        startedAt: schema.clubStandaloneMatches.startedAt,
        communityVisibility: schema.communities.visibility,
        memberStatus: schema.communityMembers.status,
      })
      .from(schema.clubStandaloneMatches)
      .innerJoin(
        schema.communities,
        eq(schema.clubStandaloneMatches.communityId, schema.communities.id),
      )
      .leftJoin(
        schema.communityMembers,
        userId
          ? and(
              eq(
                schema.communityMembers.communityId,
                schema.clubStandaloneMatches.communityId,
              ),
              eq(schema.communityMembers.userId, userId),
              eq(schema.communityMembers.status, 'JOINED'),
            )
          : sql`false`,
      )
      .where(
        and(
          eq(schema.clubStandaloneMatches.id, matchId),
          isNull(schema.clubStandaloneMatches.deletedAt),
          isNull(schema.communities.deletedAt),
          eq(schema.communities.status, 'ACTIVE'),
        ),
      )
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

  /**
   * Mục tiêu ghi MP4: một dòng mỗi camera còn ít nhất một assignment
   * trận (kể cả assignment `OFFLINE`), gom theo camera/stream.
   *
   * `hasLiveAssignment` là aggregate `bool_or` trên mọi assignment
   * LIVE của camera đó — camera chia sẻ nhiều trận vẫn chỉ xuất
   * hiện một lần, và việc dừng một trận không làm mất dấu trận
   * LIVE còn lại. Camera đã xoá mềm và trận đã xoá mềm bị loại
   * (giống `syncCameraStatus`: camera mồ côi được coi như chưa
   * gán).
   */
  async listCameraRecordingTargets(): Promise<CameraRecordingTarget[]> {
    const rows = await this.cameraRecordingTargetQuery()
      .where(isNotNull(schema.matchLivestreams.cameraId))
      .groupBy(
        schema.matchLivestreams.cameraId,
        schema.livestreamCameras.streamName,
      );

    return rows.map((row) => ({
      cameraId: row.cameraId as string,
      streamName: row.streamName,
      hasLiveAssignment: row.hasLiveAssignment,
    }));
  }

  /**
   * Mục tiêu ghi MP4 của một camera, hoặc `null` khi camera không
   * còn assignment nào (hoặc đã bị xoá mềm). Đọc lại trạng thái
   * hiện hành trước mọi side effect ghi MP4.
   */
  async findCameraRecordingTarget(
    cameraId: string,
  ): Promise<CameraRecordingTarget | null> {
    const [row] = await this.cameraRecordingTargetQuery()
      .where(
        and(
          isNotNull(schema.matchLivestreams.cameraId),
          eq(schema.matchLivestreams.cameraId, cameraId),
        ),
      )
      .groupBy(
        schema.matchLivestreams.cameraId,
        schema.livestreamCameras.streamName,
      )
      .limit(1);

    return row
      ? {
          cameraId: row.cameraId as string,
          streamName: row.streamName,
          hasLiveAssignment: row.hasLiveAssignment,
        }
      : null;
  }

  private cameraRecordingTargetQuery() {
    return this.db
      .select({
        cameraId: schema.matchLivestreams.cameraId,
        streamName: schema.livestreamCameras.streamName,
        hasLiveAssignment: sql<boolean>`bool_or(${schema.matchLivestreams.streamStatus} = 'LIVE')`,
      })
      .from(schema.matchLivestreams)
      .innerJoin(
        schema.livestreamCameras,
        and(
          eq(schema.matchLivestreams.cameraId, schema.livestreamCameras.id),
          isNull(schema.livestreamCameras.deletedAt),
        ),
      )
      .innerJoin(
        schema.matches,
        and(
          eq(schema.matchLivestreams.matchId, schema.matches.id),
          isNull(schema.matches.deletedAt),
        ),
      );
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

  /**
   * Bỏ camera gán tay của một trận, đưa nó về trạng thái chưa gán.
   *
   * Dùng khi trận không nằm trên sân nào có camera: giữ nguyên dòng để các
   * trường stream khác không mất, chỉ xoá liên kết camera.
   */
  async clearMatchCamera(matchId: string) {
    const [existing] = await this.db
      .select({ cameraId: schema.matchLivestreams.cameraId })
      .from(schema.matchLivestreams)
      .where(eq(schema.matchLivestreams.matchId, matchId))
      .limit(1);

    const [stream] = await this.db
      .update(schema.matchLivestreams)
      .set({
        cameraId: null,
        streamStatus: 'IDLE',
        playbackUrl: null,
        startedAt: null,
        endedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.matchLivestreams.matchId, matchId))
      .returning();

    if (existing?.cameraId) {
      await this.syncCameraStatus(existing.cameraId);
    }

    return stream ?? null;
  }

  /**
   * `OFFLINE` là dấu "BTC đã bấm Dừng", khác hẳn `IDLE` ("chưa từng phát").
   *
   * Nhánh playback của sân cần phân biệt hai thứ này: lịch xếp sân có camera ghi
   * `IDLE` lúc gán, nếu coi `IDLE` là "đã dừng" thì trận ONGOING mất video ngay
   * khi vừa xếp lịch. Ngược lại nếu không có dấu dừng nào thì nút Dừng chẳng có
   * tác dụng gì với trận dùng camera sân — video vẫn phát theo trạng thái trận.
   */
  async updateStreamStatus(
    matchId: string,
    status: 'IDLE' | 'LIVE' | 'OFFLINE',
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
