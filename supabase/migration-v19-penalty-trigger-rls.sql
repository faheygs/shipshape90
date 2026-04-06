-- ================================================
-- Migration v19: Penalty sync must bypass RLS inside SECURITY DEFINER triggers
-- In some Postgres/Supabase setups, INSERT/DELETE on penalty_pot from trigger
-- can fail or no-op if row_security is evaluated for the wrong role.
-- Also apply to resync RPC. Safe to re-run.
-- ================================================

CREATE OR REPLACE FUNCTION public.apply_penalty_for_submitted_log(p_row public.daily_logs)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  missed text[] := '{}';
  n int := 0;
BEGIN
  IF NOT COALESCE(p_row.submitted, false) THEN
    DELETE FROM public.penalty_pot
    WHERE user_id = p_row.user_id AND log_date = p_row.log_date;
    RETURN;
  END IF;

  IF COALESCE(p_row.is_travel_day, false) THEN
    IF NOT COALESCE(p_row.workout1, false) THEN missed := array_append(missed, 'workout1'); n := n + 1; END IF;
    IF NOT COALESCE(p_row.water, false) THEN missed := array_append(missed, 'water'); n := n + 1; END IF;
    IF NOT COALESCE(p_row.no_sugar, false) THEN missed := array_append(missed, 'no_sugar'); n := n + 1; END IF;
    IF NOT COALESCE(p_row.reading, false) THEN missed := array_append(missed, 'reading'); n := n + 1; END IF;
    IF NOT COALESCE(p_row.diet, false) THEN missed := array_append(missed, 'diet'); n := n + 1; END IF;
  ELSE
    IF NOT COALESCE(p_row.workout1, false) THEN missed := array_append(missed, 'workout1'); n := n + 1; END IF;
    IF NOT COALESCE(p_row.workout2, false) THEN missed := array_append(missed, 'workout2'); n := n + 1; END IF;
    IF NOT COALESCE(p_row.water, false) THEN missed := array_append(missed, 'water'); n := n + 1; END IF;
    IF NOT COALESCE(p_row.steps, false) THEN missed := array_append(missed, 'steps'); n := n + 1; END IF;
    IF NOT COALESCE(p_row.no_sugar, false) THEN missed := array_append(missed, 'no_sugar'); n := n + 1; END IF;
    IF NOT COALESCE(p_row.reading, false) THEN missed := array_append(missed, 'reading'); n := n + 1; END IF;
    IF NOT COALESCE(p_row.diet, false) THEN missed := array_append(missed, 'diet'); n := n + 1; END IF;
  END IF;

  DELETE FROM public.penalty_pot
  WHERE user_id = p_row.user_id AND log_date = p_row.log_date;

  IF n > 0 THEN
    INSERT INTO public.penalty_pot (user_id, log_date, amount, missed_tasks)
    VALUES (p_row.user_id, p_row.log_date, (n)::decimal(6,2), missed);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_daily_logs_sync_penalty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.penalty_pot
    WHERE user_id = OLD.user_id AND log_date = OLD.log_date;
    RETURN OLD;
  END IF;
  PERFORM public.apply_penalty_for_submitted_log(NEW);
  RETURN NEW;
END;
$$;

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
