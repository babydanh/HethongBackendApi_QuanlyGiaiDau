-- Destructive migration for the retired standalone social pickup feature.
-- Application routes and schema metadata are removed from this release.
-- Run this migration only through database change control. Drop the child
-- table first because it references the session.
DROP TABLE IF EXISTS social_pickup_participants;
DROP TABLE IF EXISTS social_pickup_sessions;
