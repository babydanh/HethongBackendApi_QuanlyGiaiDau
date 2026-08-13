CREATE TABLE IF NOT EXISTS community_tag_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name varchar(24) NOT NULL,
  color varchar(7) NOT NULL DEFAULT '#E2E8F0',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS community_tag_presets_name_unique
  ON community_tag_presets (community_id, lower(name));
