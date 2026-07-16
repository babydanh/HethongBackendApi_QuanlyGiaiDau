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
import { users } from './users.schema';
import { tournaments } from './tournaments.schema';
import { matches } from './matches.schema';

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
    createdBy: uuid('created_by')
      .references(() => users.id, { onDelete: 'set null' }),
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
    cameraId: uuid('camera_id')
      .references(() => livestreamCameras.id, { onDelete: 'set null' }),
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
