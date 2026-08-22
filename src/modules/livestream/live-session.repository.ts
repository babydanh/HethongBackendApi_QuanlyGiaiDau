import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import {
  ACTIVE_LIVE_SESSION_STATUSES,
  canTransitionLiveSession,
  type LiveSessionStatus,
} from './livestream-contracts';

export type LiveSessionRow = typeof schema.liveSessions.$inferSelect;
export type CameraDeviceRow = typeof schema.cameraDevices.$inferSelect;
export type FacebookPageConnectionRow =
  typeof schema.facebookPageConnections.$inferSelect;
export type CreateLiveSessionInput = typeof schema.liveSessions.$inferInsert;

export interface LiveMatchContext {
  readonly matchId: string;
  readonly tournamentId: string;
  readonly tournamentCommunityId: string | null;
  readonly tournamentCreatedBy: string | null;
  readonly matchCourtId: string | null;
  readonly matchStatus: string;
}

export interface LiveSessionWithCommunity {
  readonly session: LiveSessionRow;
  readonly communityId: string | null;
}

export type TransitionLiveSessionExtra = Partial<
  Pick<
    LiveSessionRow,
    | 'providerSessionId'
    | 'status'
    | 'publishConfigExpiresAt'
    | 'startedAt'
    | 'endedAt'
    | 'lastProviderCheckAt'
    | 'replayUrl'
    | 'replayProvider'
    | 'youtubeVideoId'
    | 'failureCode'
    | 'failureMessage'
  >
>;

@Injectable()
export class LiveSessionRepository {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}

  async findMatchContext(matchId: string): Promise<LiveMatchContext | null> {
    const [context] = await this.db
      .select({
        matchId: schema.matches.id,
        tournamentId: schema.matches.tournamentId,
        tournamentCommunityId: schema.tournaments.communityId,
        tournamentCreatedBy: schema.tournaments.createdBy,
        matchCourtId: schema.matches.courtId,
        matchStatus: schema.matches.status,
      })
      .from(schema.matches)
      .innerJoin(
        schema.tournaments,
        eq(schema.matches.tournamentId, schema.tournaments.id),
      )
      .where(
        and(eq(schema.matches.id, matchId), isNull(schema.matches.deletedAt)),
      )
      .limit(1);

    return context ?? null;
  }

  async listActiveLiveSessions(): Promise<LiveSessionRow[]> {
    return this.db
      .select()
      .from(schema.liveSessions)
      .where(inArray(schema.liveSessions.status, ACTIVE_LIVE_SESSION_STATUSES))
      .orderBy(desc(schema.liveSessions.updatedAt));
  }

  async findActiveLiveSessionByMatchId(
    matchId: string,
  ): Promise<LiveSessionRow | null> {
    const [session] = await this.db
      .select()
      .from(schema.liveSessions)
      .where(
        and(
          eq(schema.liveSessions.matchId, matchId),
          inArray(schema.liveSessions.status, ACTIVE_LIVE_SESSION_STATUSES),
        ),
      )
      .orderBy(desc(schema.liveSessions.createdAt))
      .limit(1);

    return session ?? null;
  }

  async findActiveLiveSessionByCourtId(
    courtId: string,
  ): Promise<LiveSessionRow | null> {
    const [session] = await this.db
      .select()
      .from(schema.liveSessions)
      .where(
        and(
          eq(schema.liveSessions.courtId, courtId),
          inArray(schema.liveSessions.status, ACTIVE_LIVE_SESSION_STATUSES),
        ),
      )
      .orderBy(desc(schema.liveSessions.createdAt))
      .limit(1);

    return session ?? null;
  }

  async findActiveLiveSessionByCameraDeviceId(
    cameraDeviceId: string,
  ): Promise<LiveSessionRow | null> {
    const [session] = await this.db
      .select()
      .from(schema.liveSessions)
      .where(
        and(
          eq(schema.liveSessions.cameraDeviceId, cameraDeviceId),
          inArray(schema.liveSessions.status, ACTIVE_LIVE_SESSION_STATUSES),
        ),
      )
      .orderBy(desc(schema.liveSessions.createdAt))
      .limit(1);

    return session ?? null;
  }

  async findLiveSessionByIdempotencyKey(
    key: string,
  ): Promise<LiveSessionRow | null> {
    const [session] = await this.db
      .select()
      .from(schema.liveSessions)
      .where(eq(schema.liveSessions.idempotencyKey, key))
      .limit(1);

    return session ?? null;
  }

  async createLiveSession(
    input: CreateLiveSessionInput,
  ): Promise<LiveSessionRow> {
    const [session] = await this.db
      .insert(schema.liveSessions)
      .values(input)
      .returning();

    return session;
  }

  async transitionLiveSessionStatus(
    id: string,
    from: LiveSessionStatus,
    to: LiveSessionStatus,
    extra: TransitionLiveSessionExtra = {},
  ): Promise<LiveSessionRow | null> {
    if (!canTransitionLiveSession(from, to)) {
      return null;
    }

    const [session] = await this.db
      .update(schema.liveSessions)
      .set({
        ...extra,
        status: to,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.liveSessions.id, id),
          eq(schema.liveSessions.status, from),
        ),
      )
      .returning();

    return session ?? null;
  }

  async updateLiveSession(
    id: string,
    values: Partial<
      Pick<
        LiveSessionRow,
        | 'providerSessionId'
        | 'status'
        | 'publishConfigExpiresAt'
        | 'startedAt'
        | 'endedAt'
        | 'lastProviderCheckAt'
        | 'replayUrl'
        | 'replayProvider'
        | 'youtubeVideoId'
        | 'failureCode'
        | 'failureMessage'
      >
    >,
  ): Promise<LiveSessionRow | null> {
    const [session] = await this.db
      .update(schema.liveSessions)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.liveSessions.id, id))
      .returning();

    return session ?? null;
  }

  async findLiveSessionWithCommunity(
    id: string,
  ): Promise<LiveSessionWithCommunity | null> {
    const [row] = await this.db
      .select({
        session: schema.liveSessions,
        communityId: schema.tournaments.communityId,
      })
      .from(schema.liveSessions)
      .innerJoin(
        schema.tournaments,
        eq(schema.liveSessions.tournamentId, schema.tournaments.id),
      )
      .where(eq(schema.liveSessions.id, id))
      .limit(1);

    return row ?? null;
  }

  async listLiveSessionsByTournamentId(
    tournamentId: string,
  ): Promise<LiveSessionRow[]> {
    return this.db
      .select()
      .from(schema.liveSessions)
      .where(eq(schema.liveSessions.tournamentId, tournamentId))
      .orderBy(desc(schema.liveSessions.updatedAt));
  }

  async findLatestLiveSessionByMatchId(
    matchId: string,
  ): Promise<LiveSessionRow | null> {
    const [session] = await this.db
      .select()
      .from(schema.liveSessions)
      .where(eq(schema.liveSessions.matchId, matchId))
      .orderBy(desc(schema.liveSessions.createdAt))
      .limit(1);

    return session ?? null;
  }

  async findLiveSessionById(id: string): Promise<LiveSessionRow | null> {
    const [session] = await this.db
      .select()
      .from(schema.liveSessions)
      .where(eq(schema.liveSessions.id, id))
      .limit(1);

    return session ?? null;
  }

  async hasCommunityManagerAccess(
    communityId: string,
    userId: string,
  ): Promise<boolean> {
    const [membership] = await this.db
      .select({ id: schema.communityMembers.id })
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId),
          eq(schema.communityMembers.userId, userId),
          eq(schema.communityMembers.status, 'JOINED'),
          inArray(schema.communityMembers.role, ['OWNER', 'MODERATOR']),
        ),
      )
      .limit(1);

    if (membership) {
      return true;
    }

    const [community] = await this.db
      .select({ id: schema.communities.id })
      .from(schema.communities)
      .where(
        and(
          eq(schema.communities.id, communityId),
          eq(schema.communities.creatorId, userId),
          isNull(schema.communities.deletedAt),
        ),
      )
      .limit(1);

    return Boolean(community);
  }

  async listCameraDevicesByCommunityId(
    communityId: string,
  ): Promise<CameraDeviceRow[]> {
    return this.db
      .select()
      .from(schema.cameraDevices)
      .where(
        and(
          eq(schema.cameraDevices.communityId, communityId),
          isNull(schema.cameraDevices.deletedAt),
        ),
      )
      .orderBy(desc(schema.cameraDevices.createdAt));
  }

  async createCameraDevice(
    input: typeof schema.cameraDevices.$inferInsert,
  ): Promise<CameraDeviceRow> {
    const [device] = await this.db
      .insert(schema.cameraDevices)
      .values(input)
      .returning();
    return device;
  }

  async updateCameraDevice(
    id: string,
    values: Partial<
      Pick<
        CameraDeviceRow,
        | 'name'
        | 'code'
        | 'defaultCourtId'
        | 'assignedOperatorId'
        | 'pairingTokenHash'
        | 'pairingTokenExpiresAt'
        | 'deviceFingerprintHash'
        | 'status'
        | 'lastHeartbeatAt'
        | 'pairedAt'
        | 'notes'
        | 'deletedAt'
      >
    >,
  ): Promise<CameraDeviceRow | null> {
    const [device] = await this.db
      .update(schema.cameraDevices)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.cameraDevices.id, id))
      .returning();

    return device ?? null;
  }

  async findCameraDeviceForPairing(
    id: string,
    pairingTokenHash: string,
  ): Promise<CameraDeviceRow | null> {
    const [device] = await this.db
      .select()
      .from(schema.cameraDevices)
      .where(
        and(
          eq(schema.cameraDevices.id, id),
          eq(schema.cameraDevices.pairingTokenHash, pairingTokenHash),
          isNull(schema.cameraDevices.deletedAt),
        ),
      )
      .limit(1);

    return device ?? null;
  }

  async findCameraDeviceById(id: string): Promise<CameraDeviceRow | null> {
    const [device] = await this.db
      .select()
      .from(schema.cameraDevices)
      .where(
        and(
          eq(schema.cameraDevices.id, id),
          isNull(schema.cameraDevices.deletedAt),
        ),
      )
      .limit(1);

    return device ?? null;
  }

  async findFacebookPageConnectionById(
    id: string,
  ): Promise<FacebookPageConnectionRow | null> {
    const [connection] = await this.db
      .select()
      .from(schema.facebookPageConnections)
      .where(eq(schema.facebookPageConnections.id, id))
      .limit(1);

    return connection ?? null;
  }

  async findFacebookPageConnectionByCommunityId(
    communityId: string,
  ): Promise<FacebookPageConnectionRow | null> {
    const [connection] = await this.db
      .select()
      .from(schema.facebookPageConnections)
      .where(eq(schema.facebookPageConnections.communityId, communityId))
      .orderBy(desc(schema.facebookPageConnections.updatedAt))
      .limit(1);

    return connection ?? null;
  }

  async createFacebookPageConnection(
    input: typeof schema.facebookPageConnections.$inferInsert,
  ): Promise<FacebookPageConnectionRow> {
    const [connection] = await this.db
      .insert(schema.facebookPageConnections)
      .values(input)
      .returning();
    return connection;
  }

  async updateFacebookPageConnection(
    id: string,
    values: Partial<
      Pick<
        FacebookPageConnectionRow,
        | 'pageId'
        | 'pageName'
        | 'encryptedPageToken'
        | 'status'
        | 'scopes'
        | 'lastValidatedAt'
        | 'updatedAt'
      >
    >,
  ): Promise<FacebookPageConnectionRow | null> {
    const [connection] = await this.db
      .update(schema.facebookPageConnections)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.facebookPageConnections.id, id))
      .returning();

    return connection ?? null;
  }

  async disconnectFacebookPageConnectionsForCommunity(
    communityId: string,
  ): Promise<void> {
    await this.db
      .update(schema.facebookPageConnections)
      .set({ status: 'DISCONNECTED', updatedAt: new Date() })
      .where(
        and(
          eq(schema.facebookPageConnections.communityId, communityId),
          eq(schema.facebookPageConnections.status, 'ACTIVE'),
        ),
      );
  }

  async findActiveFacebookPageConnection(
    communityId: string,
  ): Promise<FacebookPageConnectionRow | null> {
    const [connection] = await this.db
      .select()
      .from(schema.facebookPageConnections)
      .where(
        and(
          eq(schema.facebookPageConnections.communityId, communityId),
          eq(schema.facebookPageConnections.status, 'ACTIVE'),
        ),
      )
      .orderBy(desc(schema.facebookPageConnections.updatedAt))
      .limit(1);

    return connection ?? null;
  }
}
