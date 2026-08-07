create or replace function public.get_my_perfect_day_streak(target_challenge_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_member_id uuid;
  latest_perfect_date date;
  streak_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select member.id into target_member_id
  from public.challenge_members member
  where member.challenge_id = target_challenge_id
    and member.profile_id = auth.uid()
    and member.status in ('active', 'completed');

  if target_member_id is null then raise exception 'Active membership required'; end if;

  select max(ledger.effective_date) into latest_perfect_date
  from public.score_ledger ledger
  where ledger.challenge_id = target_challenge_id
    and ledger.member_id = target_member_id
    and ledger.entry_type = 'perfect_day';

  if latest_perfect_date is null or latest_perfect_date < current_date - 1 then return 0; end if;

  with recursive perfect_dates as (
    select distinct ledger.effective_date
    from public.score_ledger ledger
    where ledger.challenge_id = target_challenge_id
      and ledger.member_id = target_member_id
      and ledger.entry_type = 'perfect_day'
  ), consecutive(day, length) as (
    select latest_perfect_date, 1
    union all
    select consecutive.day - 1, consecutive.length + 1
    from consecutive
    where exists (
      select 1 from perfect_dates
      where perfect_dates.effective_date = consecutive.day - 1
    )
  )
  select max(consecutive.length) into streak_count from consecutive;

  return coalesce(streak_count, 0);
end;
$$;

revoke all on function public.get_my_perfect_day_streak(uuid) from public, anon, authenticated;
grant execute on function public.get_my_perfect_day_streak(uuid) to authenticated;
