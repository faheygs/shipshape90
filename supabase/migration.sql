-- ================================================
-- ShipShape90 Database Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ================================================

-- Profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null,
  avatar_emoji text default '💪',
  diet_template text check (diet_template in ('A', 'B', 'C')),
  diet_details text,
  is_runner boolean default false,
  travel_days_used integer default 0 check (travel_days_used >= 0 and travel_days_used <= 13),
  pregnant_bailout boolean default false,
  created_at timestamptz default now()
);

-- Daily logs
create table if not exists public.daily_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  log_date date not null,
  workout1 boolean default false,
  workout2 boolean default false,
  water boolean default false,
  steps boolean default false,
  no_sugar boolean default false,
  reading boolean default false,
  diet boolean default false,
  is_travel_day boolean default false,
  submitted boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, log_date)
);

-- Check-ins (Day 1, 30, 60, 90)
create table if not exists public.check_ins (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  day_number integer not null check (day_number in (1, 30, 60, 90)),
  photo_url text,
  weight decimal(5,1),
  body_fat decimal(4,1),
  notes text,
  created_at timestamptz default now(),
  unique(user_id, day_number)
);

-- Weight/BF% tracking (separate from check-ins for frequent tracking)
create table if not exists public.body_stats (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  recorded_date date not null,
  weight decimal(5,1),
  body_fat decimal(4,1),
  notes text,
  created_at timestamptz default now(),
  unique(user_id, recorded_date)
);

-- Penalty pot tracking
create table if not exists public.penalty_pot (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  log_date date not null,
  amount decimal(6,2) not null,
  missed_tasks text[] default '{}',
  created_at timestamptz default now(),
  unique(user_id, log_date)
);

-- ================================================
-- Row Level Security Policies
-- ================================================

alter table public.profiles enable row level security;
alter table public.daily_logs enable row level security;
alter table public.check_ins enable row level security;
alter table public.body_stats enable row level security;
alter table public.penalty_pot enable row level security;

-- Profiles: everyone can read names/emoji, only own profile is editable
create policy "Profiles are viewable by all authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Daily logs: only own logs are readable/writable
create policy "Users can view own daily logs"
  on public.daily_logs for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own daily logs"
  on public.daily_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own daily logs"
  on public.daily_logs for update
  to authenticated
  using (auth.uid() = user_id);

-- Check-ins: only own
create policy "Users can view own check-ins"
  on public.check_ins for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own check-ins"
  on public.check_ins for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own check-ins"
  on public.check_ins for update
  to authenticated
  using (auth.uid() = user_id);

-- Body stats: only own
create policy "Users can view own body stats"
  on public.body_stats for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own body stats"
  on public.body_stats for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own body stats"
  on public.body_stats for update
  to authenticated
  using (auth.uid() = user_id);

-- Penalty pot: everyone can read totals, only own entries writable
create policy "Penalty pot viewable by all authenticated"
  on public.penalty_pot for select
  to authenticated
  using (true);

create policy "Users can insert own penalties"
  on public.penalty_pot for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete own daily logs"
  on public.daily_logs for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete own check-ins"
  on public.check_ins for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete own body stats"
  on public.body_stats for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete own penalties"
  on public.penalty_pot for delete
  to authenticated
  using (auth.uid() = user_id);

-- ================================================
-- Streak bonus: +5 per each 7 consecutive perfect (non-travel) calendar days
-- ================================================

create or replace function public.streak_bonus_points(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  with perfect_days as (
    select dl.log_date::date as d
    from public.daily_logs dl
    where dl.user_id = p_user_id
      and coalesce(dl.submitted, false) = true
      and dl.is_travel_day = false
      and dl.workout1 and dl.workout2 and dl.water and dl.steps
      and dl.no_sugar and dl.reading and dl.diet
  ),
  numbered as (
    select
      d,
      d - (row_number() over (order by d))::integer as grp_key
    from perfect_days
  ),
  runs as (
    select grp_key, count(*)::bigint as run_len
    from numbered
    group by grp_key
  )
  select coalesce(sum((run_len / 7) * 5), 0)::bigint
  from runs;
$$;

-- Streak: only non-travel submitted perfect days add +1; perfect travel days pause; failed/unsubmitted travel breaks.
create or replace function public.current_streak_count(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  streak int := 0;
begin
  for r in
    select is_travel_day, submitted,
      workout1, workout2, water, steps, no_sugar, reading, diet
    from public.daily_logs
    where user_id = p_user_id
    order by log_date desc
    limit 400
  loop
    if coalesce(r.is_travel_day, false) then
      if not coalesce(r.submitted, false) then
        exit;
      end if;
      if not (
        coalesce(r.workout1, false)
        and coalesce(r.water, false)
        and coalesce(r.no_sugar, false)
        and coalesce(r.reading, false)
        and coalesce(r.diet, false)
      ) then
        exit;
      end if;
      continue;
    end if;

    if not coalesce(r.submitted, false) then
      exit;
    end if;

    if coalesce(r.workout1, false)
      and coalesce(r.workout2, false)
      and coalesce(r.water, false)
      and coalesce(r.steps, false)
      and coalesce(r.no_sugar, false)
      and coalesce(r.reading, false)
      and coalesce(r.diet, false)
    then
      streak := streak + 1;
    else
      exit;
    end if;
  end loop;

  return streak;
end;
$$;

-- ================================================
-- Leaderboard Function (rank; total = daily sum + streak bonus; pot contribution)
-- ================================================

drop function if exists public.get_leaderboard();

create or replace function public.get_leaderboard()
returns table (
  user_id uuid,
  display_name text,
  avatar_emoji text,
  rank bigint,
  current_streak integer,
  is_on_fire boolean,
  penalty_contribution numeric
)
language plpgsql
security definer
as $$
begin
  return query
  with user_daily as (
    select
      dl.user_id,
      sum(
        case
          when dl.is_travel_day then
            (case when dl.workout1 then 1 else 0 end) +
            (case when dl.water then 1 else 0 end) +
            (case when dl.no_sugar then 1 else 0 end) +
            (case when dl.reading then 1 else 0 end) +
            (case when dl.diet then 1 else 0 end) -
            (
              (case when not dl.workout1 then 3 else 0 end) +
              (case when not dl.water then 3 else 0 end) +
              (case when not dl.no_sugar then 3 else 0 end) +
              (case when not dl.reading then 3 else 0 end) +
              (case when not dl.diet then 3 else 0 end)
            )
          else
            (case when dl.workout1 then 1 else 0 end) +
            (case when dl.workout2 then 1 else 0 end) +
            (case when dl.water then 1 else 0 end) +
            (case when dl.steps then 1 else 0 end) +
            (case when dl.no_sugar then 1 else 0 end) +
            (case when dl.reading then 1 else 0 end) +
            (case when dl.diet then 1 else 0 end) +
            (case when (dl.workout1 and dl.workout2 and dl.water and dl.steps and dl.no_sugar and dl.reading and dl.diet) then 3 else 0 end) -
            (
              (case when not dl.workout1 then 3 else 0 end) +
              (case when not dl.workout2 then 3 else 0 end) +
              (case when not dl.water then 3 else 0 end) +
              (case when not dl.steps then 3 else 0 end) +
              (case when not dl.no_sugar then 3 else 0 end) +
              (case when not dl.reading then 3 else 0 end) +
              (case when not dl.diet then 3 else 0 end)
            )
        end
      ) as daily_sum,
      count(*) filter (
        where not dl.is_travel_day
          and dl.workout1 and dl.workout2 and dl.water and dl.steps
          and dl.no_sugar and dl.reading and dl.diet
      ) as perfect_days
    from public.daily_logs dl
    where coalesce(dl.submitted, false) = true
    group by dl.user_id
  ),
  user_points as (
    select
      ud.user_id,
      (coalesce(ud.daily_sum, 0) + coalesce(public.streak_bonus_points(ud.user_id), 0))::bigint as total_points,
      ud.perfect_days
    from user_daily ud
  ),
  streak_counts as (
    select id as user_id, public.current_streak_count(id) as current_streak
    from public.profiles
    where pregnant_bailout = false
  ),
  penalty_by_user as (
    select pp.user_id, coalesce(sum(pp.amount), 0)::numeric as penalty_contribution
    from public.penalty_pot pp
    group by pp.user_id
  )
  select
    p.id as user_id,
    p.display_name,
    p.avatar_emoji,
    rank() over (
      order by
        coalesce(up.total_points, 0) desc,
        coalesce(up.perfect_days, 0) desc,
        coalesce(sc.current_streak, 0) desc
    ) as rank,
    coalesce(sc.current_streak, 0)::integer as current_streak,
    coalesce(sc.current_streak, 0) >= 3 as is_on_fire,
    coalesce(pb.penalty_contribution, 0)::numeric as penalty_contribution
  from public.profiles p
  left join user_points up on up.user_id = p.id
  left join streak_counts sc on sc.user_id = p.id
  left join penalty_by_user pb on pb.user_id = p.id
  where p.pregnant_bailout = false
  order by
    coalesce(up.total_points, 0) desc,
    coalesce(up.perfect_days, 0) desc,
    coalesce(sc.current_streak, 0) desc;
end;
$$;

-- ================================================
-- Get own points function (private, only for the requesting user)
-- ================================================

drop function if exists public.get_my_points();

create or replace function public.get_my_points()
returns table (
  total_points bigint,
  streak_bonus bigint,
  perfect_days bigint,
  current_streak integer,
  longest_streak integer,
  total_penalty decimal
)
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
begin
  return query
  with daily_agg as (
    select
      coalesce(sum(
        case
          when dl.is_travel_day then
            (case when dl.workout1 then 1 else 0 end) +
            (case when dl.water then 1 else 0 end) +
            (case when dl.no_sugar then 1 else 0 end) +
            (case when dl.reading then 1 else 0 end) +
            (case when dl.diet then 1 else 0 end) -
            (
              (case when not dl.workout1 then 3 else 0 end) +
              (case when not dl.water then 3 else 0 end) +
              (case when not dl.no_sugar then 3 else 0 end) +
              (case when not dl.reading then 3 else 0 end) +
              (case when not dl.diet then 3 else 0 end)
            )
          else
            (case when dl.workout1 then 1 else 0 end) +
            (case when dl.workout2 then 1 else 0 end) +
            (case when dl.water then 1 else 0 end) +
            (case when dl.steps then 1 else 0 end) +
            (case when dl.no_sugar then 1 else 0 end) +
            (case when dl.reading then 1 else 0 end) +
            (case when dl.diet then 1 else 0 end) +
            (case when (dl.workout1 and dl.workout2 and dl.water and dl.steps and dl.no_sugar and dl.reading and dl.diet) then 3 else 0 end) -
            (
              (case when not dl.workout1 then 3 else 0 end) +
              (case when not dl.workout2 then 3 else 0 end) +
              (case when not dl.water then 3 else 0 end) +
              (case when not dl.steps then 3 else 0 end) +
              (case when not dl.no_sugar then 3 else 0 end) +
              (case when not dl.reading then 3 else 0 end) +
              (case when not dl.diet then 3 else 0 end)
            )
        end
      ), 0)::bigint as daily_sum,
      count(*) filter (
        where not dl.is_travel_day
          and dl.workout1 and dl.workout2 and dl.water and dl.steps
          and dl.no_sugar and dl.reading and dl.diet
      )::bigint as perfect_cnt
    from public.daily_logs dl
    where dl.user_id = v_user_id
      and coalesce(dl.submitted, false) = true
  ),
  sb as (
    select coalesce(public.streak_bonus_points(v_user_id), 0)::bigint as streak_pts
  )
  select
    (daily_agg.daily_sum + sb.streak_pts)::bigint as total_points,
    sb.streak_pts as streak_bonus,
    daily_agg.perfect_cnt as perfect_days,
    0::integer as current_streak,
    0::integer as longest_streak,
    coalesce(
      (select sum(pp.amount) from public.penalty_pot pp where pp.user_id = v_user_id),
      0
    )::decimal as total_penalty
  from daily_agg
  cross join sb;
end;
$$;

-- ================================================
-- Penalty pot: $1 per missed task when day is submitted (locked in)
-- ================================================

create or replace function public.apply_penalty_for_submitted_log(p_row public.daily_logs)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  missed text[] := '{}';
  n int := 0;
begin
  if not coalesce(p_row.submitted, false) then
    delete from public.penalty_pot
    where user_id = p_row.user_id and log_date = p_row.log_date;
    return;
  end if;

  if coalesce(p_row.is_travel_day, false) then
    if not coalesce(p_row.workout1, false) then missed := array_append(missed, 'workout1'); n := n + 1; end if;
    if not coalesce(p_row.water, false) then missed := array_append(missed, 'water'); n := n + 1; end if;
    if not coalesce(p_row.no_sugar, false) then missed := array_append(missed, 'no_sugar'); n := n + 1; end if;
    if not coalesce(p_row.reading, false) then missed := array_append(missed, 'reading'); n := n + 1; end if;
    if not coalesce(p_row.diet, false) then missed := array_append(missed, 'diet'); n := n + 1; end if;
  else
    if not coalesce(p_row.workout1, false) then missed := array_append(missed, 'workout1'); n := n + 1; end if;
    if not coalesce(p_row.workout2, false) then missed := array_append(missed, 'workout2'); n := n + 1; end if;
    if not coalesce(p_row.water, false) then missed := array_append(missed, 'water'); n := n + 1; end if;
    if not coalesce(p_row.steps, false) then missed := array_append(missed, 'steps'); n := n + 1; end if;
    if not coalesce(p_row.no_sugar, false) then missed := array_append(missed, 'no_sugar'); n := n + 1; end if;
    if not coalesce(p_row.reading, false) then missed := array_append(missed, 'reading'); n := n + 1; end if;
    if not coalesce(p_row.diet, false) then missed := array_append(missed, 'diet'); n := n + 1; end if;
  end if;

  delete from public.penalty_pot
  where user_id = p_row.user_id and log_date = p_row.log_date;

  if n > 0 then
    insert into public.penalty_pot (user_id, log_date, amount, missed_tasks)
    values (p_row.user_id, p_row.log_date, (n)::decimal(6,2), missed);
  end if;
end;
$$;

create or replace function public.trg_daily_logs_sync_penalty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.penalty_pot
    where user_id = old.user_id and log_date = old.log_date;
    return old;
  end if;
  perform public.apply_penalty_for_submitted_log(new);
  return new;
end;
$$;

drop trigger if exists trg_daily_logs_sync_penalty_ins_upd on public.daily_logs;
drop trigger if exists trg_daily_logs_sync_penalty_del on public.daily_logs;

create trigger trg_daily_logs_sync_penalty_ins_upd
  after insert or update on public.daily_logs
  for each row
  execute procedure public.trg_daily_logs_sync_penalty();

create trigger trg_daily_logs_sync_penalty_del
  after delete on public.daily_logs
  for each row
  execute procedure public.trg_daily_logs_sync_penalty();

-- ================================================
-- Auto-create profile on user signup
-- ================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
