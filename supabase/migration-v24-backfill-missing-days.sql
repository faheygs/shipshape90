-- ================================================
-- Migration v24: Backfill blank submitted daily_logs for missed days
--
-- Problem: if a user never opens the app on a given day, no daily_logs row
-- exists and therefore no penalty is calculated. This function creates blank
-- submitted rows (all tasks false) for every past challenge day that has no
-- row, for every active (non-bailout) participant. The existing
-- trg_daily_logs_sync_penalty trigger fires per inserted row and populates
-- penalty_pot automatically.
--
-- Safe to re-run: uses NOT EXISTS + UNIQUE(user_id, log_date) constraint.
-- ================================================

CREATE OR REPLACE FUNCTION public.backfill_missing_daily_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  r RECORD;
  inserted_count integer := 0;
  denver_today date := (timezone('America/Denver', now()))::date;
  challenge_start date := '2026-03-30';
  challenge_end date := '2026-06-27';
  last_backfill_date date;
BEGIN
  last_backfill_date := LEAST(denver_today - 1, challenge_end);
  IF last_backfill_date < challenge_start THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT p.id AS user_id, d::date AS log_date
    FROM public.profiles p
    CROSS JOIN generate_series(challenge_start, last_backfill_date, '1 day'::interval) d
    WHERE p.pregnant_bailout = false
      AND NOT EXISTS (
        SELECT 1 FROM public.daily_logs dl
        WHERE dl.user_id = p.id AND dl.log_date = d::date
      )
  LOOP
    INSERT INTO public.daily_logs (user_id, log_date, submitted)
    VALUES (r.user_id, r.log_date, true)
    ON CONFLICT (user_id, log_date) DO NOTHING;

    inserted_count := inserted_count + 1;
  END LOOP;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_missing_daily_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_missing_daily_logs() TO authenticated;
