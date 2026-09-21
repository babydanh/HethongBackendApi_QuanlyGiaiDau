-- Destructive migration, explicitly approved for the social pickup tables only.
-- Keep the application/schema code and SOCIAL_FEATURE_ENABLED lock for later
-- recreation. Drop the child table first because it references the session.
DROP TABLE IF EXISTS social_pickup_participants;
DROP TABLE IF EXISTS social_pickup_sessions;
