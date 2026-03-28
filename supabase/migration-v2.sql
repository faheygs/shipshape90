-- Run this in Supabase SQL Editor
-- V2: Adds who-logged-today visibility + updates

-- Function to see who logged on a given date (names only, no task details)
create or replace function public.get_day_participants(target_date date)
returns table (
  user_id uuid,
  display_name text,
  avatar_emoji text,
  has_logged boolean,
  is_travel_day boolean
)
language plpgsql
security definer
as $$
begin
  return query
  select
    p.id as user_id,
    p.display_name,
    p.avatar_emoji,
    exists(
      select 1 from public.daily_logs dl
      where dl.user_id = p.id and dl.log_date = target_date
    ) as has_logged,
    coalesce(
      (select dl.is_travel_day from public.daily_logs dl
       where dl.user_id = p.id and dl.log_date = target_date),
      false
    ) as is_travel_day
  from public.profiles p
  where p.pregnant_bailout = false
  order by p.display_name;
end;
$$;
