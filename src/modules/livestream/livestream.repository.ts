import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, isNull } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';

export type LivestreamProtocol = 'RTMP' | 'SRT';

export interface CreateCameraInput {
  tournamentId: string;
  name: string;
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
        tournamentCreatedBy: schema.tournaments.createdBy,
        tournamentName: schema.tournaments.name,
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
        cameraId: schema.matchLivestreams.cameraId,
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
      })
      .from(schema.matchLivestreams)
      .leftJoin(schema.livestreamCameras, eq(schema.matchLivestreams.cameraId, schema.livestreamCameras.id))
      .where(eq(schema.matchLivestreams.matchId, matchId))
      .limit(1);

    return row ?? null;
  }

  async listMatchLivestreams(tournamentId: string) {
    return this.db
      .select({
        id: schema.matchLivestreams.id,
        matchId: schema.matchLivestreams.matchId,
        cameraId: schema.matchLivestreams.cameraId,
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
      .leftJoin(schema.livestreamCameras, eq(schema.matchLivestreams.cameraId, schema.livestreamCameras.id))
      .where(and(eq(schema.matches.tournamentId, tournamentId), isNull(schema.matches.deletedAt)));
  }

  async assignCameraToMatch(matchId: string, cameraId: string, playbackUrl: string) {
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

    await this.db
      .update(schema.livestreamCameras)
      .set({ status: 'ASSIGNED', updatedAt: new Date() })
      .where(eq(schema.livestreamCameras.id, cameraId));

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
      await this.db
        .update(schema.livestreamCameras)
        .set({
          status: status === 'LIVE' ? 'LIVE' : 'ASSIGNED',
          updatedAt: new Date(),
        })
        .where(eq(schema.livestreamCameras.id, stream.cameraId));
    }

    return stream ?? null;
  }
}
