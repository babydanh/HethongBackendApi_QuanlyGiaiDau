-- Verification script for Phase 5 Stage 2: tournament_divisions migration
-- Run these queries to verify the migration was successful

-- 1. Verify tournament_divisions table exists and has correct structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'tournament_divisions'
ORDER BY ordinal_position;

-- 2. Count migrated divisions (should match tournaments with parent_id)
SELECT COUNT(*) as total_divisions FROM tournament_divisions;

-- 3. Verify data integrity: check if all division IDs exist
SELECT COUNT(*) as divisions_from_tournaments
FROM tournaments
WHERE parent_id IS NOT NULL AND deleted_at IS NULL;

-- 4. Verify indexes exist
SELECT indexname FROM pg_indexes WHERE tablename = 'tournament_divisions';

-- 5. Verify FK constraints
SELECT constraint_name, table_name, column_name
FROM information_schema.key_column_usage
WHERE table_name IN ('tournament_divisions', 'tournament_participants', 'tournament_stages', 'payments')
  AND column_name LIKE '%division%'
ORDER BY table_name, constraint_name;

-- 6. Check tournament_participants migration
SELECT COUNT(*) as participants_with_division_id
FROM tournament_participants
WHERE tournament_division_id IS NOT NULL;

-- 7. Check tournament_stages migration
SELECT COUNT(*) as stages_with_division_id
FROM tournament_stages
WHERE tournament_division_id IS NOT NULL;

-- 8. Verify no orphaned records (all division_ids should exist in tournament_divisions)
SELECT COUNT(*) as orphaned_participant_divisions
FROM tournament_participants
WHERE tournament_division_id IS NOT NULL
  AND tournament_division_id NOT IN (SELECT id FROM tournament_divisions);

SELECT COUNT(*) as orphaned_stage_divisions
FROM tournament_stages
WHERE tournament_division_id IS NOT NULL
  AND tournament_division_id NOT IN (SELECT id FROM tournament_divisions);

-- 9. Sample query: get divisions for a specific parent tournament
-- Replace 'parent-tournament-uuid' with an actual UUID
SELECT * FROM tournament_divisions
WHERE tournament_id = 'parent-tournament-uuid'
LIMIT 5;

-- 10. Verify constraints work: attempt to insert duplicate (should fail)
-- Uncomment to test - this should fail with UNIQUE constraint violation
-- INSERT INTO tournament_divisions (tournament_id, name, match_type, status)
-- SELECT tournament_id, name, match_type, status
-- FROM tournament_divisions LIMIT 1;
