ALTER TABLE public.tournament_venues
  ADD COLUMN IF NOT EXISTS province_code varchar(20),
  ADD COLUMN IF NOT EXISTS ward_code varchar(20);
--> statement-breakpoint
ALTER TABLE public.tournament_venues
  ADD COLUMN IF NOT EXISTS search_text text GENERATED ALWAYS AS (
    public.f_unaccent(lower(name || ' ' || location_address))
  ) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tournament_venues_geo_idx
  ON public.tournament_venues USING gist (location_geolocation);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tournament_venues_search_idx
  ON public.tournament_venues USING gin (search_text gin_trgm_ops);
