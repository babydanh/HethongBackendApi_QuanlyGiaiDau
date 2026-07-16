CREATE TABLE IF NOT EXISTS "livestream_cameras" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "mode" varchar(20) DEFAULT 'PUSH' NOT NULL,
  "protocol" varchar(20) DEFAULT 'RTMP' NOT NULL,
  "stream_name" varchar(255) NOT NULL,
  "stream_key" varchar(255) NOT NULL,
  "status" varchar(20) DEFAULT 'IDLE' NOT NULL,
  "playback_url" text,
  "rtsp_url_encrypted" text,
  "username_encrypted" text,
  "password_encrypted" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "livestream_cameras_tournament_id_tournaments_id_fk"
    FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "livestream_cameras_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "match_livestreams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL,
  "camera_id" uuid,
  "stream_status" varchar(20) DEFAULT 'IDLE' NOT NULL,
  "playback_url" text,
  "recording_url" text,
  "is_featured" boolean DEFAULT false NOT NULL,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "match_livestreams_match_id_matches_id_fk"
    FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "match_livestreams_camera_id_livestream_cameras_id_fk"
    FOREIGN KEY ("camera_id") REFERENCES "public"."livestream_cameras"("id") ON DELETE set null ON UPDATE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "livestream_cameras_stream_name_unique_idx"
  ON "livestream_cameras" USING btree ("stream_name");

CREATE INDEX IF NOT EXISTS "idx_livestream_cameras_tournament"
  ON "livestream_cameras" USING btree ("tournament_id");

CREATE UNIQUE INDEX IF NOT EXISTS "match_livestreams_match_unique_idx"
  ON "match_livestreams" USING btree ("match_id");

CREATE INDEX IF NOT EXISTS "idx_match_livestreams_camera"
  ON "match_livestreams" USING btree ("camera_id");
