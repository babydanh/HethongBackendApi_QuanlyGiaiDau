-- Social location directory prerequisites. Keep this standalone migration before
-- any generated column that references f_unaccent (see run-prod-migration.js).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
AS $$ SELECT public.unaccent('public.unaccent', $1) $$;
