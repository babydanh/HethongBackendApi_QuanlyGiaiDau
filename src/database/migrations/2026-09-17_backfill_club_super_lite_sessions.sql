-- Backfill legacy community Super Lite tournaments into the unified
-- club_match_sessions product without copying or moving tournament data.
-- The tournament remains the source of truth for bracket registrations,
-- matches, scoring and results; the session is only the product wrapper.
INSERT INTO "club_match_sessions" (
  "community_id",
  "category_id",
  "created_by",
  "name",
  "description",
  "status",
  "registration_mode",
  "pairing_mode",
  "bracket_tournament_id",
  "is_ranked",
  "max_participants",
  "session_config",
  "start_at",
  "end_at",
  "registration_open_at",
  "registration_closed_at",
  "ended_at",
  "created_at",
  "updated_at"
)
SELECT
  t."community_id",
  t."category_id",
  t."created_by",
  t."name",
  t."description",
  CASE
    WHEN t."status" IN ('CANCELLED', 'PENDING_DELETE') THEN 'CANCELLED'
    WHEN t."status" IN ('COMPLETED', 'FINISHED', 'DONE', 'ENDED') THEN 'ENDED'
    WHEN t."status" IN ('IN_PROGRESS', 'ONGOING', 'LIVE') THEN 'LIVE'
    WHEN t."status" IN ('REGISTRATION_CLOSED')
      OR t."is_registration_locked" = true
      OR (t."registration_end_date" IS NOT NULL AND t."registration_end_date" <= now())
      THEN 'CLOSED'
    ELSE 'OPEN'
  END,
  'MIXED',
  'BRACKET',
  t."id",
  t."is_ranked",
  COALESCE(t."max_participants", 16),
  jsonb_build_object(
    'migratedFrom', 'SUPER_LITE_TOURNAMENT',
    'sourceTournamentId', t."id"
  ),
  t."start_date",
  t."end_date",
  COALESCE(t."registration_start_date", t."created_at", now()),
  t."registration_end_date",
  CASE
    WHEN t."status" IN ('COMPLETED', 'FINISHED', 'DONE', 'ENDED')
      THEN COALESCE(t."end_date", t."updated_at", now())
    ELSE NULL
  END,
  t."created_at",
  t."updated_at"
FROM "tournaments" t
WHERE t."community_id" IS NOT NULL
  AND t."tournament_type" = 'CLUB'
  AND t."deleted_at" IS NULL
  AND COALESCE(t."tournament_config" ->> 'mode', '') = 'LITE'
  AND COALESCE(t."tournament_config" ->> 'isLite', '') IN ('true', '1')
  AND COALESCE(t."tournament_config" ->> 'hideAdvancedSettings', '') IN ('true', '1')
  AND NOT EXISTS (
    SELECT 1
    FROM "club_match_sessions" s
    WHERE s."bracket_tournament_id" = t."id"
  );
