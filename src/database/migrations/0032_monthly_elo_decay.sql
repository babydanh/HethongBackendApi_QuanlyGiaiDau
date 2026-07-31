ALTER TABLE "user_ranks" ADD COLUMN IF NOT EXISTS "last_decay_at" timestamptz DEFAULT now() NOT NULL;
ALTER TABLE "community_rankings" ADD COLUMN IF NOT EXISTS "last_decay_at" timestamptz DEFAULT now() NOT NULL;
ALTER TABLE "pair_ranks" ADD COLUMN IF NOT EXISTS "last_decay_at" timestamptz DEFAULT now() NOT NULL;
