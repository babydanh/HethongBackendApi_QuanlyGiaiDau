CREATE TABLE IF NOT EXISTS tournament_roster_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  manager_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key varchar(128) NOT NULL,
  request_fingerprint varchar(64) NOT NULL,
  imported_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tournament_roster_import_batches_idempotency_unique
  ON tournament_roster_import_batches (tournament_id, manager_user_id, idempotency_key);
