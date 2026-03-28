-- ================================================
-- Migration v17: Badge sync only after challenge start; first place from Day 10
-- Challenge start date uses America/Denver for DB badge rules (aligned with Mountain Time competitors).
-- Run in Supabase SQL Editor after v15/v16. Safe to re-run.
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
  ch_start date := DATE '2026-03-30';
  today_denver date := (timezone('America/Denver', now()))::date;
  challenge_day int;
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  -- Before first challenge day (Denver): no badges
  IF today_denver < ch_start THEN
    RETURN;
  END IF;

  challenge_day := (today_denver - ch_start) + 1;

  longest := public.longest_perfect_streak(uid);

  IF EXISTS (
    SELECT 1 FROM public.daily_logs dl
    WHERE dl.user_id = uid AND COALESCE(dl.submitted, false)
    LIMIT 1
  ) THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'day_one')
    ON CONFLICT DO NOTHING;
  END IF;

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

  IF EXISTS (
    SELECT 1 FROM public.daily_logs dl
    WHERE dl.user_id = uid
      AND COALESCE(dl.submitted, false)
      AND (
        (
          NOT COALESCE(dl.is_travel_day, false)
          AND NOT (
            COALESCE(dl.workout1, false) AND COALESCE(dl.workout2, false)
            AND COALESCE(dl.water, false) AND COALESCE(dl.steps, false)
            AND COALESCE(dl.no_sugar, false) AND COALESCE(dl.reading, false) AND COALESCE(dl.diet, false)
          )
        )
        OR
        (
          COALESCE(dl.is_travel_day, false)
          AND NOT (
            COALESCE(dl.workout1, false) AND COALESCE(dl.water, false)
            AND COALESCE(dl.no_sugar, false) AND COALESCE(dl.reading, false) AND COALESCE(dl.diet, false)
          )
        )
      )
  ) THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'hidden_imperfect_day')
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.daily_logs dl
    WHERE dl.user_id = uid
      AND COALESCE(dl.submitted, false)
      AND COALESCE(dl.is_travel_day, false)
  ) THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'hidden_travel_day')
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.penalty_pot pp
    WHERE pp.user_id = uid AND COALESCE(pp.amount, 0) > 0
  ) THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'hidden_prize_pot')
    ON CONFLICT DO NOTHING;
  END IF;

  -- #1 on leaderboard only from challenge Day 10 onward (Denver calendar)
  IF challenge_day >= 10 AND EXISTS (
    SELECT 1 FROM public.get_leaderboard() gl
    WHERE gl.user_id = uid AND gl.rank = 1
  ) THEN
    INSERT INTO public.user_badges (user_id, badge_key) VALUES (uid, 'hidden_first_place')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_user_badges() TO authenticated;

-- Day-one trigger: do not insert before challenge start (direct DB / edge cases)
CREATE OR REPLACE FUNCTION public.trg_daily_logs_award_day_one_badge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (timezone('America/Denver', now()))::date < DATE '2026-03-30' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.submitted, false) THEN
    INSERT INTO public.user_badges (user_id, badge_key)
    VALUES (NEW.user_id, 'day_one')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
