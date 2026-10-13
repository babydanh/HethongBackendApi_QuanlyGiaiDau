-- Link a local camera to its AQP Agency stream-key without storing the secret push URL.
ALTER TABLE public.livestream_cameras
  ADD COLUMN IF NOT EXISTS aqp_stream_key_id varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS livestream_cameras_aqp_stream_key_id_unique_idx
  ON public.livestream_cameras (aqp_stream_key_id);
