-- Fix parent tournaments stuck displaying as DRAFT because of unpublished child divisions
WITH ParentStatus AS (
  SELECT parent_id, MAX(status) as max_status
  FROM tournaments
  WHERE parent_id IS NOT NULL
  GROUP BY parent_id
  HAVING COUNT(DISTINCT status) > 1
)
UPDATE tournaments t
SET status = p.max_status
FROM ParentStatus p
WHERE t.parent_id = p.parent_id
  AND t.status = 'DRAFT'
  AND p.max_status != 'DRAFT';
