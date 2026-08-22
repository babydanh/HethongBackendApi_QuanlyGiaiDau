import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { communities } from './communities.schema';
import { matches } from './matches.schema';
import { tournaments } from './tournaments.schema';
import { users } from './users.schema';
import { venueCourts } from './venues.schema';

export const livestreamCameras = pgTable(
  'livestream_cameras',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .references(() => tournaments.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    mode: varchar('mode', { length: 20 }).default('PUSH').notNull(),
    protocol: varchar('protocol', { length: 20 }).default('RTMP').notNull(),
    streamName: varchar('stream_name', { length: 255 }).notNull(),
    streamKey: varchar('stream_key', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).default('IDLE').notNull(),
    playbackUrl: text('playback_url'),
    rtspUrlEncrypted: text('rtsp_url_encrypted'),
    usernameEncrypted: text('username_encrypted'),
    passwordEncrypted: text('password_encrypted'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    uniqueStreamName: uniqueIndex('livestream_cameras_stream_name_unique_idx').on(table.streamName),
    idxLivestreamCamerasTournament: index('idx_livestream_cameras_tournament').on(table.tournamentId),
  }),
);

export const matchLivestreams = pgTable(
  'match_livestreams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matchId: uuid('match_id')
      .references(() => matches.id, { onDelete: 'cascade' })
      .notNull(),
    cameraId: uuid('camera_id').references(() => livestreamCameras.id, { onDelete: 'set null' }),
    streamStatus: varchar('stream_status', { length: 20 }).default('IDLE').notNull(),
    playbackUrl: text('playback_url'),
    recordingUrl: text('recording_url'),
    isFeatured: boolean('is_featured').default(false).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueMatch: uniqueIndex('match_livestreams_match_unique_idx').on(table.matchId),
    idxMatchLivestreamsCamera: index('idx_match_livestreams_camera').on(table.cameraId),
  }),
);

export const facebookPageConnections = pgTable(
  'facebook_page_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    communityId: uuid('community_id')
      .references(() => communities.id, { onDelete: 'cascade' })
      .notNull(),
    pageId: varchar('page_id', { length: 255 }).notNull(),
    pageName: varchar('page_name', { length: 255 }).notNull(),
    encryptedPageToken: text('encrypted_page_token').notNull(),
    connectedBy: uuid('connected_by').references(() => users.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 20 }).default('ACTIVE').notNull(),
    scopes: text('scopes')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow().notNull(),
    lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniquePagePerCommunity: uniqueIndex('facebook_page_connections_community_page_unique_idx').on(
      table.communityId,
      table.pageId,
    ),
    idxFacebookPageConnectionsCommunity: index('idx_facebook_page_connections_community').on(
      table.communityId,
    ),
    idxFacebookPageConnectionsStatus: index('idx_facebook_page_connections_status').on(table.status),
  }),
);

export const cameraDevices = pgTable(
  'camera_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    communityId: uuid('community_id')
      .references(() => communities.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    code: varchar('code', { length: 100 }),
    defaultCourtId: uuid('default_court_id').references(() => venueCourts.id, {
      onDelete: 'set null',
    }),
    assignedOperatorId: uuid('assigned_operator_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    pairingTokenHash: varchar('pairing_token_hash', { length: 255 }),
    pairingTokenExpiresAt: timestamp('pairing_token_expires_at', { withTimezone: true }),
    deviceFingerprintHash: varchar('device_fingerprint_hash', { length: 255 }),
    status: varchar('status', { length: 20 }).default('UNPAIRED').notNull(),
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
    pairedAt: timestamp('paired_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    idxCameraDevicesCommunity: index('idx_camera_devices_community').on(table.communityId),
    idxCameraDevicesStatus: index('idx_camera_devices_status').on(table.status),
  }),
);

export const liveSessions = pgTable(
  'live_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .references(() => tournaments.id, { onDelete: 'cascade' })
      .notNull(),
    courtId: uuid('court_id').references(() => venueCourts.id, { onDelete: 'set null' }),
    matchId: uuid('match_id')
      .references(() => matches.id, { onDelete: 'cascade' })
      .notNull(),
    cameraDeviceId: uuid('camera_device_id').references(() => cameraDevices.id, {
      onDelete: 'set null',
    }),
    provider: varchar('provider', { length: 20 }).default('FACEBOOK').notNull(),
    providerSessionId: varchar('provider_session_id', { length: 255 }),
    status: varchar('status', { length: 20 }).default('CREATED').notNull(),
    title: varchar('title', { length: 255 }),
    description: text('description'),
    idempotencyKey: varchar('idempotency_key', { length: 255 }),
    publishConfigExpiresAt: timestamp('publish_config_expires_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    lastProviderCheckAt: timestamp('last_provider_check_at', { withTimezone: true }),
    replayUrl: text('replay_url'),
    replayProvider: varchar('replay_provider', { length: 20 }).default('NONE').notNull(),
    youtubeVideoId: varchar('youtube_video_id', { length: 255 }),
    failureCode: varchar('failure_code', { length: 100 }),
    failureMessage: text('failure_message'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueProviderSession: uniqueIndex('live_sessions_provider_session_unique_idx').on(
      table.provider,
      table.providerSessionId,
    ),
    uniqueIdempotencyKey: uniqueIndex('live_sessions_idempotency_key_unique_idx').on(
      table.idempotencyKey,
    ),
    idxLiveSessionsTournament: index('idx_live_sessions_tournament').on(table.tournamentId),
    idxLiveSessionsMatch: index('idx_live_sessions_match').on(table.matchId),
    idxLiveSessionsStatus: index('idx_live_sessions_status').on(table.status),
    idxLiveSessionsProviderSession: index('idx_live_sessions_provider_session').on(
      table.providerSessionId,
    ),
    idxLiveSessionsCameraDevice: index('idx_live_sessions_camera_device').on(table.cameraDeviceId),
    idxLiveSessionsCourt: index('idx_live_sessions_court').on(table.courtId),
    idxLiveSessionsActiveCourt: uniqueIndex('live_sessions_active_court_unique_idx')
      .on(table.courtId)
      .where(sql`status IN ('CREATED', 'STARTING', 'LIVE', 'RECONNECTING', 'STOPPING')`),
    idxLiveSessionsActiveCamera: uniqueIndex('live_sessions_active_camera_unique_idx')
      .on(table.cameraDeviceId)
      .where(sql`status IN ('CREATED', 'STARTING', 'LIVE', 'RECONNECTING', 'STOPPING')`),
    idxLiveSessionsActiveMatch: uniqueIndex('live_sessions_active_match_unique_idx')
      .on(table.matchId)
      .where(sql`status IN ('CREATED', 'STARTING', 'LIVE', 'RECONNECTING', 'STOPPING')`),
  }),
);
