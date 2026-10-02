-- Repair Social snapshots only from their stored pin or referenced venue.
UPDATE public.social_sessions
SET venue_geolocation = ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8), 4326)::geography
WHERE venue_geolocation IS NULL
  AND latitude IS NOT NULL AND longitude IS NOT NULL
  AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
  AND latitude::text NOT IN ('NaN', 'Infinity', '-Infinity')
  AND longitude::text NOT IN ('NaN', 'Infinity', '-Infinity');
--> statement-breakpoint
UPDATE public.social_sessions s
SET venue_geolocation = v.location_geolocation,
    latitude = ST_Y(v.location_geolocation::geometry),
    longitude = ST_X(v.location_geolocation::geometry)
FROM public.tournament_venues v
WHERE s.venue_geolocation IS NULL
  AND s.venue_id = v.id AND v.deleted_at IS NULL
  AND v.location_geolocation IS NOT NULL;
--> statement-breakpoint
UPDATE public.social_sessions
SET latitude = ST_Y(venue_geolocation::geometry),
    longitude = ST_X(venue_geolocation::geometry)
WHERE venue_geolocation IS NOT NULL
  AND (latitude IS DISTINCT FROM ST_Y(venue_geolocation::geometry)
    OR longitude IS DISTINCT FROM ST_X(venue_geolocation::geometry));
--> statement-breakpoint
UPDATE public.wards
SET center_lat = ST_Y(ST_PointOnSurface(boundary::geometry)),
    center_lng = ST_X(ST_PointOnSurface(boundary::geometry))
WHERE boundary IS NOT NULL AND (center_lat IS NULL OR center_lng IS NULL);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.social_sessions'::regclass
      AND conname = 'social_session_geo_consistency_check'
  ) THEN
    ALTER TABLE public.social_sessions
      ADD CONSTRAINT social_session_geo_consistency_check CHECK (
        (venue_geolocation IS NULL AND latitude IS NULL AND longitude IS NULL)
        OR (venue_geolocation IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
          AND abs(latitude - ST_Y(venue_geolocation::geometry)) <= 1e-7
          AND abs(longitude - ST_X(venue_geolocation::geometry)) <= 1e-7)
      ) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.social_sessions
    WHERE (venue_geolocation IS NULL) <> (latitude IS NULL)
       OR (venue_geolocation IS NULL) <> (longitude IS NULL)
       OR (latitude IS NOT NULL AND (latitude NOT BETWEEN -90 AND 90 OR latitude::text IN ('NaN','Infinity','-Infinity')))
       OR (longitude IS NOT NULL AND (longitude NOT BETWEEN -180 AND 180 OR longitude::text IN ('NaN','Infinity','-Infinity')))
       OR (venue_geolocation IS NOT NULL AND (abs(latitude - ST_Y(venue_geolocation::geometry)) > 1e-7
         OR abs(longitude - ST_X(venue_geolocation::geometry)) > 1e-7))
  ) THEN
    RAISE EXCEPTION 'social_session_geo_consistency_check precondition failed; repair from authoritative source before validation';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE public.social_sessions VALIDATE CONSTRAINT social_session_geo_consistency_check;
