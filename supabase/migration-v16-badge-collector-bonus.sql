-- ================================================
-- Migration v16: +10 points when user has earned every badge (endgame collector bonus)
-- Requires: user_badges (v12/v14), get_leaderboard (base migration), all badge keys from app.
-- Run in Supabase SQL Editor. Safe to re-run.
-- ================================================

CREATE OR REPLACE FUNCTION public.badge_collector_bonus_points(p_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH required AS (
    SELECT unnest(ARRAY[
      'day_one',
      'first_perfect_day',
      'first_photo',
      'milestone_checkin_1',
      'milestone_checkin_30',
      'milestone_checkin_60',
      'milestone_checkin_90',
      'challenge_complete',
      'streak_7',
      'streak_14',
      'streak_30',
      'hidden_imperfect_day',
      'hidden_travel_day',
      'hidden_prize_pot',
      'hidden_first_place'
    ]::text[]) AS badge_key
  ),
  matched AS (
    SELECT COUNT(DISTINCT r.badge_key)::bigint AS n
    FROM required r
    INNER JOIN public.user_badges ub
      ON ub.user_id = p_user_id AND ub.badge_key = r.badge_key
  )
  SELECT CASE
    WHEN (SELECT n FROM matched) = (SELECT COUNT(*)::bigint FROM required)
    THEN 10::bigint
    ELSE 0::bigint
  END;
$$;

REVOKE ALL ON FUNCTION public.badge_collector_bonus_points(uuid) FROM PUBLIC;

DROP FUNCTION IF EXISTS public.get_my_points();

CREATE OR REPLACE FUNCTION public.get_my_points()
RETURNS TABLE (
  total_points bigint,
  streak_bonus bigint,
  perfect_days bigint,
  current_streak integer,
  longest_streak integer,
  total_penalty decimal,
  badge_collector_bonus bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_collector bigint;
BEGIN
  v_collector := COALESCE(public.badge_collector_bonus_points(v_user_id), 0);

  RETURN QUERY
  WITH daily_agg AS (
    SELECT
      COALESCE(SUM(
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
      ), 0)::bigint AS daily_sum,
      COUNT(*) FILTER (
        WHERE NOT dl.is_travel_day
          AND dl.workout1 AND dl.workout2 AND dl.water AND dl.steps
          AND dl.no_sugar AND dl.reading AND dl.diet
      )::bigint AS perfect_cnt
    FROM public.daily_logs dl
    WHERE dl.user_id = v_user_id
      AND COALESCE(dl.submitted, false) = true
  ),
  sb AS (
    SELECT COALESCE(public.streak_bonus_points(v_user_id), 0)::bigint AS streak_pts
  )
  SELECT
    (daily_agg.daily_sum + sb.streak_pts + v_collector)::bigint AS total_points,
    sb.streak_pts AS streak_bonus,
    daily_agg.perfect_cnt AS perfect_days,
    0::integer AS current_streak,
    0::integer AS longest_streak,
    COALESCE(
      (SELECT SUM(pp.amount) FROM public.penalty_pot pp WHERE pp.user_id = v_user_id),
      0
    )::decimal AS total_penalty,
    v_collector AS badge_collector_bonus
  FROM daily_agg
  CROSS JOIN sb;
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
