-- ================================================
-- Migration v23: Leaderboard streak matches Home + current_streak_count()
-- v16 replaced get_leaderboard with a "streaks" COUNT(*) CTE that diverged from
-- travel pause rules and in-progress day handling. Restore streak from
-- current_streak_count (same as v10). Skip unsubmitted rows on challenge
-- "today" (America/Denver) so streak is not zeroed before the day locks.
-- Safe to re-run.
-- ================================================

CREATE OR REPLACE FUNCTION public.current_streak_count(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  streak INT := 0;
  denver_today date := (timezone('America/Denver', now()))::date;
BEGIN
  FOR r IN
    SELECT log_date, is_travel_day, submitted,
      workout1, workout2, water, steps, no_sugar, reading, diet
    FROM public.daily_logs
    WHERE user_id = p_user_id
    ORDER BY log_date DESC
    LIMIT 400
  LOOP
    IF COALESCE(r.is_travel_day, false) THEN
      IF NOT COALESCE(r.submitted, false) THEN
        IF r.log_date = denver_today THEN
          CONTINUE;
        END IF;
        EXIT;
      END IF;
      IF NOT (
        COALESCE(r.workout1, false)
        AND COALESCE(r.water, false)
        AND COALESCE(r.no_sugar, false)
        AND COALESCE(r.reading, false)
        AND COALESCE(r.diet, false)
      ) THEN
        EXIT;
      END IF;
      CONTINUE;
    END IF;

    IF NOT COALESCE(r.submitted, false) THEN
      IF r.log_date = denver_today THEN
        CONTINUE;
      END IF;
      EXIT;
    END IF;

    IF COALESCE(r.workout1, false)
      AND COALESCE(r.workout2, false)
      AND COALESCE(r.water, false)
      AND COALESCE(r.steps, false)
      AND COALESCE(r.no_sugar, false)
      AND COALESCE(r.reading, false)
      AND COALESCE(r.diet, false)
    THEN
      streak := streak + 1;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RETURN streak;
END;
$$;

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
SET search_path = public
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
      (
        COALESCE(ud.daily_sum, 0)
        + COALESCE(public.streak_bonus_points(ud.user_id), 0)
        + COALESCE(public.badge_collector_bonus_points(ud.user_id), 0)
      )::bigint AS total_points,
      ud.perfect_days
    FROM user_daily ud
  ),
  streak_counts AS (
    SELECT
      p.id AS user_id,
      public.current_streak_count(p.id)::integer AS current_streak
    FROM public.profiles p
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
        COALESCE(sc.current_streak, 0) DESC
    ) AS rank,
    COALESCE(sc.current_streak, 0)::integer AS current_streak,
    COALESCE(sc.current_streak, 0) >= 3 AS is_on_fire,
    COALESCE(pb.penalty_contribution, 0)::numeric AS penalty_contribution
  FROM public.profiles p
  LEFT JOIN user_points up ON up.user_id = p.id
  LEFT JOIN streak_counts sc ON sc.user_id = p.id
  LEFT JOIN penalty_by_user pb ON pb.user_id = p.id
  WHERE p.pregnant_bailout = false
  ORDER BY
    COALESCE(up.total_points, 0) DESC,
    COALESCE(up.perfect_days, 0) DESC,
    COALESCE(sc.current_streak, 0) DESC;
END;
$$;
