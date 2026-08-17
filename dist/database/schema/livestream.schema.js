"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchLivestreams = exports.livestreamCameras = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_schema_1 = require("./users.schema");
const tournaments_schema_1 = require("./tournaments.schema");
const matches_schema_1 = require("./matches.schema");
exports.livestreamCameras = (0, pg_core_1.pgTable)('livestream_cameras', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tournamentId: (0, pg_core_1.uuid)('tournament_id')
        .references(() => tournaments_schema_1.tournaments.id, { onDelete: 'cascade' })
        .notNull(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    mode: (0, pg_core_1.varchar)('mode', { length: 20 }).default('PUSH').notNull(),
    protocol: (0, pg_core_1.varchar)('protocol', { length: 20 }).default('RTMP').notNull(),
    streamName: (0, pg_core_1.varchar)('stream_name', { length: 255 }).notNull(),
    streamKey: (0, pg_core_1.varchar)('stream_key', { length: 255 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).default('IDLE').notNull(),
    playbackUrl: (0, pg_core_1.text)('playback_url'),
    rtspUrlEncrypted: (0, pg_core_1.text)('rtsp_url_encrypted'),
    usernameEncrypted: (0, pg_core_1.text)('username_encrypted'),
    passwordEncrypted: (0, pg_core_1.text)('password_encrypted'),
    createdBy: (0, pg_core_1.uuid)('created_by')
        .references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: (0, pg_core_1.timestamp)('deleted_at', { withTimezone: true }),
}, (table) => ({
    uniqueStreamName: (0, pg_core_1.uniqueIndex)('livestream_cameras_stream_name_unique_idx').on(table.streamName),
    idxLivestreamCamerasTournament: (0, pg_core_1.index)('idx_livestream_cameras_tournament').on(table.tournamentId),
}));
exports.matchLivestreams = (0, pg_core_1.pgTable)('match_livestreams', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    matchId: (0, pg_core_1.uuid)('match_id')
        .references(() => matches_schema_1.matches.id, { onDelete: 'cascade' })
        .notNull(),
    cameraId: (0, pg_core_1.uuid)('camera_id')
        .references(() => exports.livestreamCameras.id, { onDelete: 'set null' }),
    streamStatus: (0, pg_core_1.varchar)('stream_status', { length: 20 }).default('IDLE').notNull(),
    playbackUrl: (0, pg_core_1.text)('playback_url'),
    recordingUrl: (0, pg_core_1.text)('recording_url'),
    isFeatured: (0, pg_core_1.boolean)('is_featured').default(false).notNull(),
    startedAt: (0, pg_core_1.timestamp)('started_at', { withTimezone: true }),
    endedAt: (0, pg_core_1.timestamp)('ended_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    uniqueMatch: (0, pg_core_1.uniqueIndex)('match_livestreams_match_unique_idx').on(table.matchId),
    idxMatchLivestreamsCamera: (0, pg_core_1.index)('idx_match_livestreams_camera').on(table.cameraId),
}));
//# sourceMappingURL=livestream.schema.js.map