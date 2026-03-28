-- ================================================
-- Migration v12: User badges (earned achievements)
-- Run in Supabase SQL Editor. Dates must match src/lib/constants.ts (CHALLENGE_START, day 90).
-- ================================================

CREATE TABLE IF NOT EXISTS public.user_badges (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  badge_key text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_key),
  CONSTRAINT user_badges_key_format CHECK (badge_key ~ '^[a-z0-9_]+$')
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON public.user_badges (user_id);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own badges" ON public.user_badges;
CREATE POLICY "Users can view own badges"
  ON public.user_badges FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own badges" ON public.user_badges;
CREATE POLICY "Users can delete own badges"
  ON public.user_badges FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Longest run of consecutive calendar days that are submitted, non-travel, all tasks checked.
CREATE OR REPLACE FUNCTION public.longest_perfect_streak(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH perfect_days AS (
    SELECT dl.log_date::date AS d
    FROM public.daily_logs dl
    WHERE dl.user_id = p_user_id
      AND COALESCE(dl.submitted, false) = true
      AND COALESCE(dl.is_travel_day, false) = false
      AND dl.workout1 AND dl.workout2 AND dl.water AND dl.steps
      AND dl.no_sugar AND dl.reading AND dl.diet
  ),
  numbered AS (
    SELECT
      d,
      d - (ROW_NUMBER() OVER (ORDER BY d))::integer AS grp_key
    FROM perfect_days
  ),
  runs AS (
    SELECT COUNT(*)::integer AS run_len
    FROM numbered
    GROUP BY grp_key
  )
  SELECT COALESCE(MAX(run_len), 0)
  FROM runs;
$$;

-- Idempotent: inserts all badges the user has earned based on current data (call after writes or on profile load).
CREATE OR REPLACE FUNCTION public.sync_user_badges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  -- Must match CHECKIN_DAYS / CHALLENGE_START in the app
  d1 date := DATE '2026-03-30';
  d90 date := DATE '2026-06-27';
  longest int;
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  longest := public.longest_perfect_streak(uid);

  -- Day One: submitted the first calendar day of the challenge
  IF EXISTS (
    SELECT 1 FROM public.daily_logs dl
    WHERE dl.user_id = uid AND dl.log_date = d1 AND COALESCE(dl.submitted, false)
  ) THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'day_one')
    ON CONFLICT DO NOTHING;
  END IF;

  -- First perfect day (any non-travel submitted perfect day)
  IF EXISTS (
    SELECT 1 FROM public.daily_logs dl
    WHERE dl.user_id = uid
      AND COALESCE(dl.submitted, false)
      AND COALESCE(dl.is_travel_day, false) = false
      AND dl.workout1 AND dl.workout2 AND dl.water AND dl.steps
      AND dl.no_sugar AND dl.reading AND dl.diet
    LIMIT 1
  ) THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'first_perfect_day')
    ON CONFLICT DO NOTHING;
  END IF;

  -- First photo: milestone check-in photo or body_stats row storing a photo URL in notes
  IF EXISTS (
    SELECT 1 FROM public.check_ins c
    WHERE c.user_id = uid AND c.photo_url IS NOT NULL AND TRIM(c.photo_url) <> ''
  ) OR EXISTS (
    SELECT 1 FROM public.body_stats b
    WHERE b.user_id = uid AND b.notes IS NOT NULL AND b.notes LIKE 'http%'
  ) THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'first_photo')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Milestone check-ins (Day 1, 30, 60, 90)
  IF EXISTS (SELECT 1 FROM public.check_ins WHERE user_id = uid AND day_number = 1) THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'milestone_checkin_1')
    ON CONFLICT DO NOTHING;
  END IF;
  IF EXISTS (SELECT 1 FROM public.check_ins WHERE user_id = uid AND day_number = 30) THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'milestone_checkin_30')
    ON CONFLICT DO NOTHING;
  END IF;
  IF EXISTS (SELECT 1 FROM public.check_ins WHERE user_id = uid AND day_number = 60) THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'milestone_checkin_60')
    ON CONFLICT DO NOTHING;
  END IF;
  IF EXISTS (SELECT 1 FROM public.check_ins WHERE user_id = uid AND day_number = 90) THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'milestone_checkin_90')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Finished: submitted the final challenge day
  IF EXISTS (
    SELECT 1 FROM public.daily_logs dl
    WHERE dl.user_id = uid AND dl.log_date = d90 AND COALESCE(dl.submitted, false)
  ) THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'challenge_complete')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Streak milestones (perfect non-travel consecutive days)
  IF longest >= 7 THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'streak_7')
    ON CONFLICT DO NOTHING;
  END IF;
  IF longest >= 14 THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'streak_14')
    ON CONFLICT DO NOTHING;
  END IF;
  IF longest >= 30 THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'streak_30')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_user_badges() TO authenticated;
REVOKE ALL ON FUNCTION public.longest_perfect_streak(uuid) FROM PUBLIC;

-- Optional: live badge updates (skip line if it errors with "already member")
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_badges;
