-- ================================================
-- Migration v5: Fix leaderboard ranking
--   - rank() instead of row_number() so ties share the same rank
--   - Tiebreakers: most perfect days, then longest streak
--   - Everyone starts at 0
-- Run this in Supabase SQL Editor
-- ================================================

-- Return type differs from base migration.sql (drops penalty_contribution); REPLACE is not enough.
DROP FUNCTION IF EXISTS public.get_leaderboard();

CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_emoji text,
  rank bigint,
  current_streak integer,
  is_on_fire boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH user_points AS (
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
      ) AS total_points,
      COUNT(*) FILTER (
        WHERE NOT dl.is_travel_day
          AND dl.workout1 AND dl.workout2 AND dl.water AND dl.steps
          AND dl.no_sugar AND dl.reading AND dl.diet
      ) AS perfect_days
    FROM public.daily_logs dl
    GROUP BY dl.user_id
  ),
  streaks AS (
    SELECT
      dl.user_id,
      COUNT(*) AS current_streak
    FROM public.daily_logs dl
    WHERE dl.is_travel_day = false
      AND dl.workout1 = true AND dl.workout2 = true
      AND dl.water = true AND dl.steps = true
      AND dl.no_sugar = true AND dl.reading = true AND dl.diet = true
      AND dl.log_date >= (
        SELECT COALESCE(
          (SELECT MAX(d2.log_date) + INTERVAL '1 day'
           FROM public.daily_logs d2
           WHERE d2.user_id = dl.user_id
             AND d2.is_travel_day = false
             AND NOT (d2.workout1 AND d2.workout2 AND d2.water AND d2.steps AND d2.no_sugar AND d2.reading AND d2.diet)
          ),
          '2026-03-30'::date
        )
      )
    GROUP BY dl.user_id
  )
  SELECT
    p.id AS user_id,
    p.display_name,
    p.avatar_emoji,
    -- rank() gives tied users the same rank (e.g. 1,1,3,4 instead of 1,2,3,4)
    -- Tiebreakers: most perfect days, then longest current streak
    rank() OVER (
      ORDER BY
        COALESCE(up.total_points, 0) DESC,
        COALESCE(up.perfect_days, 0) DESC,
        COALESCE(s.current_streak, 0) DESC
    ) AS rank,
    COALESCE(s.current_streak, 0)::integer AS current_streak,
    COALESCE(s.current_streak, 0) >= 3 AS is_on_fire
  FROM public.profiles p
  LEFT JOIN user_points up ON up.user_id = p.id
  LEFT JOIN streaks s ON s.user_id = p.id
  WHERE p.pregnant_bailout = false
  ORDER BY
    COALESCE(up.total_points, 0) DESC,
    COALESCE(up.perfect_days, 0) DESC,
    COALESCE(s.current_streak, 0) DESC;
END;
$$;
