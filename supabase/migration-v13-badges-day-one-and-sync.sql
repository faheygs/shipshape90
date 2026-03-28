-- ================================================
-- Migration v13: Fix day_one badge + ensure sync awards first submission
-- Run in Supabase SQL Editor (safe to re-run).
-- Previously day_one required log_date = challenge start only; now it matches
-- "submitted at least one day" (first End Day). challenge_complete still = final day.
-- ================================================

CREATE OR REPLACE FUNCTION public.sync_user_badges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  d90 date := DATE '2026-06-27';
  longest int;
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  longest := public.longest_perfect_streak(uid);

  -- Day One: first time you submit any day (End Day)
  IF EXISTS (
    SELECT 1 FROM public.daily_logs dl
    WHERE dl.user_id = uid AND COALESCE(dl.submitted, false)
    LIMIT 1
  ) THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'day_one')
    ON CONFLICT DO NOTHING;
  END IF;

  -- First perfect day (non-travel submitted perfect day)
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

  IF EXISTS (
    SELECT 1 FROM public.daily_logs dl
    WHERE dl.user_id = uid AND dl.log_date = d90 AND COALESCE(dl.submitted, false)
  ) THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'challenge_complete')
    ON CONFLICT DO NOTHING;
  END IF;

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
