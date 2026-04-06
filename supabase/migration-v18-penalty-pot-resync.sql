-- ================================================
-- Migration v18: Rebuild penalty_pot from submitted daily_logs (repair + leaderboard truth)
-- Removes orphan penalty rows and reapplies apply_penalty_for_submitted_log for every
-- submitted day so partial/missed-task amounts stay aligned with daily_logs.
-- Safe to re-run.
-- ================================================

CREATE OR REPLACE FUNCTION public.resync_penalty_pot_from_daily_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  r public.daily_logs%ROWTYPE;
BEGIN
  DELETE FROM public.penalty_pot pp
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.daily_logs dl
    WHERE dl.user_id = pp.user_id
      AND dl.log_date = pp.log_date
      AND COALESCE(dl.submitted, false) = true
  );

  FOR r IN
    SELECT * FROM public.daily_logs WHERE COALESCE(submitted, false) = true
  LOOP
    PERFORM public.apply_penalty_for_submitted_log(r);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.resync_penalty_pot_from_daily_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resync_penalty_pot_from_daily_logs() TO authenticated;
