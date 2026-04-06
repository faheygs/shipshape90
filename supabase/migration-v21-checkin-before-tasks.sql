-- Block turning on any daily task until the user has a milestone check-in with weight
-- for that challenge day (Days 1, 30, 60, 90). Matches app CHALLENGE_START (2026-03-30).

CREATE OR REPLACE FUNCTION public.daily_log_challenge_day(p_log_date date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_log_date - date '2026-03-30')::integer + 1;
$$;

CREATE OR REPLACE FUNCTION public.enforce_checkin_before_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d integer;
  tasks_on boolean;
BEGIN
  d := public.daily_log_challenge_day(NEW.log_date);
  IF d < 1 OR d > 90 THEN
    RETURN NEW;
  END IF;
  IF d NOT IN (1, 30, 60, 90) THEN
    RETURN NEW;
  END IF;

  tasks_on := COALESCE(NEW.workout1, false)
    OR COALESCE(NEW.workout2, false)
    OR COALESCE(NEW.water, false)
    OR COALESCE(NEW.steps, false)
    OR COALESCE(NEW.no_sugar, false)
    OR COALESCE(NEW.reading, false)
    OR COALESCE(NEW.diet, false);

  IF NOT tasks_on THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.check_ins c
    WHERE c.user_id = NEW.user_id
      AND c.day_number = d
      AND c.weight IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Milestone check-in (weight) required before logging tasks on challenge day %', d
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_checkin_before_tasks ON public.daily_logs;

CREATE TRIGGER trg_enforce_checkin_before_tasks
  BEFORE INSERT OR UPDATE OF workout1, workout2, water, steps, no_sugar, reading, diet
  ON public.daily_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_checkin_before_tasks();
