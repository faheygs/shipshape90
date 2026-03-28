-- ================================================
-- Migration v11: Enable Supabase Realtime for live UI updates
--   Run once in Supabase SQL Editor. If a line errors with "already member",
--   skip that table — it was already added.
-- ================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.penalty_pot;
ALTER PUBLICATION supabase_realtime ADD TABLE public.check_ins;
ALTER PUBLICATION supabase_realtime ADD TABLE public.body_stats;
