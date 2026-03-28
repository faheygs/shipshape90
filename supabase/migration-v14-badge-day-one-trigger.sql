-- ================================================
-- Migration v14: Badges table + sync RPC + day_one trigger + backfill
-- Safe to run even if migration-v12 / v13 were skipped (uses IF NOT EXISTS / OR REPLACE).
-- Optional: if "already member" on publication line, remove that line and re-run.
-- ================================================

-- --- 1) Table + RLS (same as v12) -------------------------------------------

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

-- --- 2) Helpers + sync RPC (v12 + v13 logic) --------------------------------

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
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_user_badges() TO authenticated;
REVOKE ALL ON FUNCTION public.longest_perfect_streak(uuid) FROM PUBLIC;

-- Realtime: run separately if needed (see migration-v11-enable-realtime.sql pattern):
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.user_badges;

-- --- 3) Trigger: day_one on submit ------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_daily_logs_award_day_one_badge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.submitted, false) THEN
    INSERT INTO public.user_badges (user_id, badge_key)
    VALUES (NEW.user_id, 'day_one')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_logs_award_day_one_badge ON public.daily_logs;

CREATE TRIGGER trg_daily_logs_award_day_one_badge
  AFTER INSERT OR UPDATE OF submitted ON public.daily_logs
  FOR EACH ROW
  WHEN (COALESCE(NEW.submitted, false) = true)
  EXECUTE PROCEDURE public.trg_daily_logs_award_day_one_badge();

-- --- 4) Backfill ------------------------------------------------------------

INSERT INTO public.user_badges (user_id, badge_key)
SELECT DISTINCT dl.user_id, 'day_one'
FROM public.daily_logs dl
WHERE COALESCE(dl.submitted, false)
ON CONFLICT DO NOTHING;
