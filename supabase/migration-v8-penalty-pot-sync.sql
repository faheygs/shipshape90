-- ================================================
-- Migration v8: Prize pot — $1 per missed task when a day is submitted
--   - Syncs public.penalty_pot from daily_logs (travel = 5 tasks, full day = 7)
--   - Extends get_leaderboard with penalty_contribution per user
-- Requires: daily_logs.submitted (migration-v4); safe to re-run parts.
-- ================================================

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS submitted boolean DEFAULT false;

-- $1 per missed task at lock-in (submitted = true). Idempotent per (user_id, log_date).
CREATE OR REPLACE FUNCTION public.apply_penalty_for_submitted_log(p_row public.daily_logs)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_daily_logs_sync_penalty_ins_upd ON public.daily_logs;
DROP TRIGGER IF EXISTS trg_daily_logs_sync_penalty_del ON public.daily_logs;

CREATE TRIGGER trg_daily_logs_sync_penalty_ins_upd
  AFTER INSERT OR UPDATE ON public.daily_logs
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_daily_logs_sync_penalty();

CREATE TRIGGER trg_daily_logs_sync_penalty_del
  AFTER DELETE ON public.daily_logs
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_daily_logs_sync_penalty();

-- Backfill from existing submitted days
DO $$
DECLARE
  r public.daily_logs%ROWTYPE;
BEGIN
  FOR r IN
    SELECT * FROM public.daily_logs WHERE COALESCE(submitted, false) = true
  LOOP
    PERFORM public.apply_penalty_for_submitted_log(r);
  END LOOP;
END $$;

-- Leaderboard: add penalty dollars contributed to the pot
DROP FUNCTION IF EXISTS public.get_leaderboard();

CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_emoji text,
  rank bigint,
  current_streak integer,
  is_on_fire boolean,
  penalty_contribution numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH user_daily AS (
    SELECT
      dl.user_id,
      SUM(
        CASE
          WHEN dl.is_travel_day THEN
            (CASE WHEN dl.workout1 THEN 1 ELSE 0 END) +
            (CASE WHEN dl.water THEN 1 ELSE 0 END) +
            (CASE WHEN dl.no_sugar THEN 1 ELSE 0 END) +
            (CASE WHEN dl.reading THEN 1 ELSE 0 END) +
            (CASE WHEN dl.diet THEN 1 ELSE 0 END) -
            (
              (CASE WHEN NOT dl.workout1 THEN 3 ELSE 0 END) +
              (CASE WHEN NOT dl.water THEN 3 ELSE 0 END) +
              (CASE WHEN NOT dl.no_sugar THEN 3 ELSE 0 END) +
              (CASE WHEN NOT dl.reading THEN 3 ELSE 0 END) +
              (CASE WHEN NOT dl.diet THEN 3 ELSE 0 END)
            )
          ELSE
            (CASE WHEN dl.workout1 THEN 1 ELSE 0 END) +
            (CASE WHEN dl.workout2 THEN 1 ELSE 0 END) +
            (CASE WHEN dl.water THEN 1 ELSE 0 END) +
            (CASE WHEN dl.steps THEN 1 ELSE 0 END) +
            (CASE WHEN dl.no_sugar THEN 1 ELSE 0 END) +
            (CASE WHEN dl.reading THEN 1 ELSE 0 END) +
            (CASE WHEN dl.diet THEN 1 ELSE 0 END) +
            (CASE WHEN (dl.workout1 AND dl.workout2 AND dl.water AND dl.steps AND dl.no_sugar AND dl.reading AND dl.diet) THEN 3 ELSE 0 END) -
            (
              (CASE WHEN NOT dl.workout1 THEN 3 ELSE 0 END) +
              (CASE WHEN NOT dl.workout2 THEN 3 ELSE 0 END) +
              (CASE WHEN NOT dl.water THEN 3 ELSE 0 END) +
              (CASE WHEN NOT dl.steps THEN 3 ELSE 0 END) +
              (CASE WHEN NOT dl.no_sugar THEN 3 ELSE 0 END) +
              (CASE WHEN NOT dl.reading THEN 3 ELSE 0 END) +
              (CASE WHEN NOT dl.diet THEN 3 ELSE 0 END)
            )
        END
      ) AS daily_sum,
      COUNT(*) FILTER (
        WHERE NOT dl.is_travel_day
          AND dl.workout1 AND dl.workout2 AND dl.water AND dl.steps
          AND dl.no_sugar AND dl.reading AND dl.diet
      ) AS perfect_days
    FROM public.daily_logs dl
    WHERE COALESCE(dl.submitted, false) = true
    GROUP BY dl.user_id
  ),
  user_points AS (
    SELECT
      ud.user_id,
      (COALESCE(ud.daily_sum, 0) + COALESCE(public.streak_bonus_points(ud.user_id), 0))::bigint AS total_points,
      ud.perfect_days
    FROM user_daily ud
  ),
  streaks AS (
    SELECT
      dl.user_id,
      COUNT(*) AS current_streak
    FROM public.daily_logs dl
    WHERE COALESCE(dl.submitted, false) = true
      AND dl.is_travel_day = false
      AND dl.workout1 = true AND dl.workout2 = true
      AND dl.water = true AND dl.steps = true
      AND dl.no_sugar = true AND dl.reading = true AND dl.diet = true
      AND dl.log_date >= (
        SELECT COALESCE(
          (SELECT MAX(d2.log_date) + INTERVAL '1 day'
           FROM public.daily_logs d2
           WHERE d2.user_id = dl.user_id
             AND d2.is_travel_day = false
             AND (
               NOT COALESCE(d2.submitted, false)
               OR NOT (d2.workout1 AND d2.workout2 AND d2.water AND d2.steps AND d2.no_sugar AND d2.reading AND d2.diet)
             )
          ),
          '2026-03-30'::date
        )
      )
    GROUP BY dl.user_id
  ),
  penalty_by_user AS (
    SELECT pp.user_id, COALESCE(SUM(pp.amount), 0)::numeric AS penalty_contribution
    FROM public.penalty_pot pp
    GROUP BY pp.user_id
  )
  SELECT
    p.id AS user_id,
    p.display_name,
    p.avatar_emoji,
    RANK() OVER (
      ORDER BY
        COALESCE(up.total_points, 0) DESC,
        COALESCE(up.perfect_days, 0) DESC,
        COALESCE(s.current_streak, 0) DESC
    ) AS rank,
    COALESCE(s.current_streak, 0)::integer AS current_streak,
    COALESCE(s.current_streak, 0) >= 3 AS is_on_fire,
    COALESCE(pb.penalty_contribution, 0)::numeric AS penalty_contribution
  FROM public.profiles p
  LEFT JOIN user_points up ON up.user_id = p.id
  LEFT JOIN streaks s ON s.user_id = p.id
  LEFT JOIN penalty_by_user pb ON pb.user_id = p.id
  WHERE p.pregnant_bailout = false
  ORDER BY
    COALESCE(up.total_points, 0) DESC,
    COALESCE(up.perfect_days, 0) DESC,
    COALESCE(s.current_streak, 0) DESC;
END;
$$;
