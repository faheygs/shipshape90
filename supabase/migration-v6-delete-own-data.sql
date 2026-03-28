-- ================================================
-- Migration v6: Allow users to delete their own rows
-- Required for Dev Tools "Clear All My Data" and any account cleanup.
-- Run in Supabase SQL Editor (safe to re-run).
-- ================================================

drop policy if exists "Users can delete own daily logs" on public.daily_logs;
create policy "Users can delete own daily logs"
  on public.daily_logs for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own check-ins" on public.check_ins;
create policy "Users can delete own check-ins"
  on public.check_ins for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own body stats" on public.body_stats;
create policy "Users can delete own body stats"
  on public.body_stats for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own penalties" on public.penalty_pot;
create policy "Users can delete own penalties"
  on public.penalty_pot for delete
  to authenticated
  using (auth.uid() = user_id);
