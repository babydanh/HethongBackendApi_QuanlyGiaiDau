-- Requeue legacy organizer-pair rows in approval-mode tournaments.
-- A missing invite token is the per-registration organizer-path discriminator.
-- Idempotent: converted rows no longer satisfy team_status = PENDING_PARTNER.
UPDATE "tournament_participants" AS p
SET "team_status" = 'PENDING_APPROVAL'
FROM "tournaments" AS t
WHERE p."tournament_id" = t."id"
  AND t."tournament_config" ->> 'registrationMode' = 'APPROVAL'
  AND COALESCE(t."tournament_config" ->> 'isLite', 'false') <> 'true'
  AND COALESCE(t."tournament_config" ->> 'mode', '') <> 'LITE'
  AND COALESCE(
        t."tournament_config" ->> 'doublesPairingMode',
        'ORGANIZER'
      ) <> 'SELF'
  AND p."football_team_id" IS NULL
  AND NOT (
        t."tournament_config" ? 'teamSize'
        OR t."tournament_config" ? 'minTeamSize'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(t."tournament_config" -> 'teamSizeOptions') = 'array'
                THEN t."tournament_config" -> 'teamSizeOptions'
              ELSE '[]'::jsonb
            END
          ) AS team_sizes(value)
          WHERE team_sizes.value IN ('5', '7', '11')
        )
      )
  AND COALESCE(
        (
          SELECT d."match_type"
          FROM "tournament_divisions" AS d
          WHERE d."id" = p."tournament_division_id"
            AND d."tournament_id" = t."id"
        ),
        t."match_type"
      ) IN ('DOUBLES', 'MIXED_DOUBLES')
  AND p."team_status" = 'PENDING_PARTNER'
  AND p."team_invite_token" IS NULL
  AND (
        SELECT COUNT(*)
        FROM "tournament_rosters" AS r
        WHERE r."participant_id" = p."id"
      ) = 1;
