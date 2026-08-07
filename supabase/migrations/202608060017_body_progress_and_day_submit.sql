alter table public.winner_rules
  add column if not exists bonus_metric text not null default 'none'
    check (bonus_metric in ('none', 'weight', 'body_fat')),
  add column if not exists bonus_calculation text
    check (bonus_calculation is null or bonus_calculation in ('percentage', 'total_change'));

update public.winner_rules
set bonus_metric = case primary_metric
      when 'body_fat_change' then 'body_fat'
      when 'weight_change' then 'weight'
      else 'none'
    end,
    bonus_calculation = case primary_metric
      when 'body_fat_change' then 'total_change'
      when 'weight_change' then 'percentage'
      else null
    end,
    primary_metric = 'total_points';

alter table public.winner_rules
  add constraint winner_rules_bonus_configuration_check check (
    (bonus_metric = 'none' and bonus_calculation is null)
    or (bonus_metric <> 'none' and bonus_calculation is not null)
  );

create table public.body_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid references public.challenges(id) on delete cascade,
  logged_on date not null default current_date,
  weight numeric check (weight is null or (weight > 0 and weight <= 1500)),
  body_fat_percentage numeric check (body_fat_percentage is null or (body_fat_percentage > 0 and body_fat_percentage <= 75)),
  photo_path text,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (weight is not null or body_fat_percentage is not null or photo_path is not null)
);

create index body_logs_profile_date_idx on public.body_logs(profile_id, logged_on desc, created_at desc);
create index body_logs_challenge_profile_date_idx on public.body_logs(challenge_id, profile_id, logged_on, created_at);

alter table public.body_logs enable row level security;

create policy "users read own body logs" on public.body_logs
for select to authenticated using (profile_id = auth.uid());

create policy "users insert own body logs" on public.body_logs
for insert to authenticated with check (
  profile_id = auth.uid()
  and (
    challenge_id is null
    or exists (
      select 1 from public.challenge_members member
      where member.challenge_id = body_logs.challenge_id
        and member.profile_id = auth.uid()
        and member.status in ('active', 'completed')
    )
  )
);

create policy "users update own body logs" on public.body_logs
for update to authenticated using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "users delete own body logs" on public.body_logs
for delete to authenticated using (profile_id = auth.uid());

grant select, insert, update, delete on public.body_logs to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'progress-photos',
  'progress-photos',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users upload own progress photos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'progress-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users read own progress photos" on storage.objects
for select to authenticated using (
  bucket_id = 'progress-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users update own progress photos" on storage.objects
for update to authenticated using (
  bucket_id = 'progress-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'progress-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users delete own progress photos" on storage.objects
for delete to authenticated using (
  bucket_id = 'progress-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.save_body_log(
  target_challenge_id uuid default null,
  log_date date default current_date,
  log_weight numeric default null,
  log_body_fat_percentage numeric default null,
  log_photo_path text default null,
  log_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_log_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target_challenge_id is not null and not exists (
    select 1 from public.challenge_members member
    where member.challenge_id = target_challenge_id
      and member.profile_id = auth.uid()
      and member.status in ('active', 'completed')
  ) then raise exception 'Active membership required'; end if;
  if log_weight is null and log_body_fat_percentage is null and nullif(trim(log_photo_path), '') is null then
    raise exception 'Add a measurement or progress photo';
  end if;
  if log_weight is not null and (log_weight <= 0 or log_weight > 1500) then
    raise exception 'Enter a valid weight';
  end if;
  if log_body_fat_percentage is not null and (log_body_fat_percentage <= 0 or log_body_fat_percentage > 75) then
    raise exception 'Enter a valid body-fat percentage';
  end if;
  if log_photo_path is not null and log_photo_path !~ ('^' || auth.uid()::text || '/') then
    raise exception 'Invalid progress photo path';
  end if;

  insert into public.body_logs (
    profile_id, challenge_id, logged_on, weight, body_fat_percentage, photo_path, note
  ) values (
    auth.uid(),
    target_challenge_id,
    log_date,
    log_weight,
    log_body_fat_percentage,
    nullif(trim(log_photo_path), ''),
    nullif(trim(log_note), '')
  ) returning id into created_log_id;

  if target_challenge_id is not null then
    insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
    values (
      'challenge:' || target_challenge_id::text || ':activity',
      'progress.body_log_saved',
      target_challenge_id,
      jsonb_build_object(
        'version', 1,
        'challengeId', target_challenge_id,
        'profileId', auth.uid(),
        'bodyLogId', created_log_id
      )
    );
  end if;

  return created_log_id;
end;
$$;

create or replace function public.list_body_logs(target_challenge_id uuid default null)
returns table (
  id uuid,
  challenge_id uuid,
  logged_on date,
  weight numeric,
  body_fat_percentage numeric,
  photo_path text,
  note text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    log.id,
    log.challenge_id,
    log.logged_on,
    log.weight,
    log.body_fat_percentage,
    log.photo_path,
    log.note,
    log.created_at
  from public.body_logs log
  where auth.uid() is not null
    and log.profile_id = auth.uid()
    and (target_challenge_id is null or log.challenge_id = target_challenge_id)
  order by log.logged_on, log.created_at;
$$;

revoke all on function public.save_body_log(uuid, date, numeric, numeric, text, text) from public, anon, authenticated;
revoke all on function public.list_body_logs(uuid) from public, anon, authenticated;
grant execute on function public.save_body_log(uuid, date, numeric, numeric, text, text) to authenticated;
grant execute on function public.list_body_logs(uuid) to authenticated;

create or replace function public.submit_challenge_day(
  target_challenge_id uuid,
  target_local_date date,
  selected_occurrence_ids uuid[]
)
returns table (completed_count integer, awarded_points integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_member_id uuid;
  occurrence_id_value uuid;
  result_record record;
  total_completed integer := 0;
  total_points integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(cardinality(selected_occurrence_ids), 0) = 0 then raise exception 'Select at least one task'; end if;

  select member.id into target_member_id
  from public.challenge_members member
  where member.challenge_id = target_challenge_id
    and member.profile_id = auth.uid()
    and member.status = 'active';

  if target_member_id is null then raise exception 'Active membership required'; end if;

  if exists (
    select 1 from unnest(selected_occurrence_ids) selected(id)
    left join public.task_occurrences occurrence
      on occurrence.id = selected.id
     and occurrence.challenge_id = target_challenge_id
     and occurrence.member_id = target_member_id
     and occurrence.local_date = target_local_date
     and occurrence.status = 'pending'
    where occurrence.id is null
  ) then raise exception 'One or more selected tasks are unavailable'; end if;

  foreach occurrence_id_value in array selected_occurrence_ids loop
    select completion.checkin_id, completion.awarded_points
    into result_record
    from public.complete_task(
      occurrence_id_value,
      'day-submit:' || target_member_id::text || ':' || occurrence_id_value::text,
      now(),
      null,
      null,
      null
    ) completion;
    total_completed := total_completed + 1;
    total_points := total_points + coalesce(result_record.awarded_points, 0);
  end loop;

  return query select total_completed, total_points;
end;
$$;

revoke all on function public.submit_challenge_day(uuid, date, uuid[]) from public, anon, authenticated;
grant execute on function public.submit_challenge_day(uuid, date, uuid[]) to authenticated;

drop function if exists public.create_challenge_draft(
  text, text, public.challenge_visibility, text, date, date, text, text, text, jsonb
);

create function public.create_challenge_draft(
  challenge_name text,
  challenge_description text,
  challenge_visibility public.challenge_visibility,
  challenge_join_policy text,
  challenge_starts_on date,
  challenge_ends_on date,
  challenge_reward text,
  challenge_bonus_metric text,
  challenge_bonus_calculation text,
  configured_tasks jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_challenge_id uuid;
begin
  if challenge_bonus_metric not in ('none', 'weight', 'body_fat') then
    raise exception 'Invalid bonus metric';
  end if;
  if (challenge_bonus_metric = 'none' and challenge_bonus_calculation is not null)
     or (challenge_bonus_metric <> 'none' and challenge_bonus_calculation not in ('percentage', 'total_change')) then
    raise exception 'Invalid bonus calculation';
  end if;

  created_challenge_id := public.create_challenge_draft(
    challenge_name,
    challenge_description,
    challenge_visibility,
    challenge_join_policy,
    challenge_starts_on,
    challenge_ends_on,
    challenge_reward,
    'total_points',
    configured_tasks
  );

  update public.winner_rules
  set primary_metric = 'total_points',
      bonus_metric = challenge_bonus_metric,
      bonus_calculation = challenge_bonus_calculation,
      tie_breakers = '["completion_percentage","perfect_days"]'::jsonb
  where challenge_id = created_challenge_id
    and rules_version = 1;

  return created_challenge_id;
end;
$$;

revoke all on function public.create_challenge_draft(
  text, text, public.challenge_visibility, text, date, date, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.create_challenge_draft(
  text, text, public.challenge_visibility, text, date, date, text, text, text, jsonb
) to authenticated;

drop function if exists public.list_challenges();
create function public.list_challenges()
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  category text,
  visibility public.challenge_visibility,
  join_policy text,
  starts_on date,
  ends_on date,
  participant_count bigint,
  membership_status text,
  cover_path text,
  prize_description text,
  scoring_method text,
  bonus_metric text,
  bonus_calculation text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    challenge.id,
    challenge.slug,
    challenge.name,
    challenge.description,
    challenge.category,
    challenge.visibility,
    challenge.join_policy,
    challenge.starts_on,
    challenge.ends_on,
    count(member.id) filter (where member.status in ('pending', 'active', 'completed')) as participant_count,
    coalesce(max(mine.status::text), 'none') as membership_status,
    challenge.cover_path,
    challenge.prize_description,
    'total_points'::text as scoring_method,
    coalesce(rules.bonus_metric, 'none') as bonus_metric,
    rules.bonus_calculation
  from public.challenges challenge
  left join public.challenge_members member on member.challenge_id = challenge.id
  left join public.challenge_members mine on mine.challenge_id = challenge.id and mine.profile_id = auth.uid()
  left join public.winner_rules rules
    on rules.challenge_id = challenge.id
   and rules.rules_version = challenge.rules_version
  where challenge.visibility = 'public'
     or challenge.owner_id = auth.uid()
     or mine.id is not null
  group by challenge.id, rules.bonus_metric, rules.bonus_calculation
  order by
    case when max(mine.status::text) = 'active' then 0 else 1 end,
    challenge.starts_on,
    challenge.created_at desc;
$$;

revoke all on function public.list_challenges() from public, anon, authenticated;
grant execute on function public.list_challenges() to anon, authenticated;

drop function if exists public.resolve_challenge_invite(text);
create function public.resolve_challenge_invite(submitted_invite_code text)
returns table (
  challenge_id uuid,
  name text,
  description text,
  category text,
  starts_on date,
  ends_on date,
  participant_count bigint,
  cover_path text,
  prize_description text,
  scoring_method text,
  bonus_metric text,
  bonus_calculation text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    challenge.id,
    challenge.name,
    challenge.description,
    challenge.category,
    challenge.starts_on,
    challenge.ends_on,
    count(member.id) filter (where member.status in ('pending', 'active', 'completed')) as participant_count,
    challenge.cover_path,
    challenge.prize_description,
    'total_points'::text as scoring_method,
    coalesce(rules.bonus_metric, 'none') as bonus_metric,
    rules.bonus_calculation
  from public.challenge_invites invite
  join public.challenges challenge on challenge.id = invite.challenge_id
  left join public.challenge_members member on member.challenge_id = challenge.id
  left join public.winner_rules rules
    on rules.challenge_id = challenge.id
   and rules.rules_version = challenge.rules_version
  where invite.code = upper(trim(submitted_invite_code))
    and invite.revoked_at is null
    and (invite.expires_at is null or invite.expires_at > now())
    and (invite.max_uses is null or invite.use_count < invite.max_uses)
    and challenge.status = 'registration'
  group by challenge.id, rules.bonus_metric, rules.bonus_calculation;
$$;

revoke all on function public.resolve_challenge_invite(text) from public, anon, authenticated;
grant execute on function public.resolve_challenge_invite(text) to authenticated;

drop function if exists public.list_challenge_leaderboard(uuid);
create function public.list_challenge_leaderboard(target_challenge_id uuid)
returns table (
  rank bigint,
  member_id uuid,
  profile_id uuid,
  display_name text,
  avatar_path text,
  total_points integer,
  completion_percentage numeric,
  perfect_days integer,
  scoring_method text,
  bonus_metric text,
  bonus_calculation text,
  bonus_points numeric,
  total_score numeric,
  outcome_value numeric,
  baseline_value numeric,
  latest_value numeric,
  is_current_user boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.challenge_members member
    where member.challenge_id = target_challenge_id
      and member.profile_id = auth.uid()
      and member.status in ('active', 'completed')
  ) then raise exception 'Active membership required'; end if;

  return query
  with selected_rule as (
    select
      coalesce(rules.bonus_metric, 'none') as bonus_metric,
      rules.bonus_calculation
    from public.challenges challenge
    left join public.winner_rules rules
      on rules.challenge_id = challenge.id
     and rules.rules_version = challenge.rules_version
    where challenge.id = target_challenge_id
  ), scores as (
    select
      ledger.member_id,
      coalesce(sum(ledger.points), 0)::integer as total_points,
      count(*) filter (where ledger.entry_type = 'perfect_day')::integer as perfect_days
    from public.score_ledger ledger
    where ledger.challenge_id = target_challenge_id
    group by ledger.member_id
  ), completion as (
    select
      occurrence.member_id,
      count(*)::integer as scheduled_count,
      count(*) filter (where occurrence.status in ('complete', 'pending_review'))::integer as completed_count
    from public.task_occurrences occurrence
    where occurrence.challenge_id = target_challenge_id
    group by occurrence.member_id
  ), member_logs as (
    select
      member.id as member_id,
      member.profile_id,
      case when selected_rule.bonus_metric = 'weight'
        then (array_agg(log.weight order by log.logged_on, log.created_at) filter (where log.weight is not null))[1]
        else (array_agg(log.body_fat_percentage order by log.logged_on, log.created_at) filter (where log.body_fat_percentage is not null))[1]
      end as baseline_value,
      case when selected_rule.bonus_metric = 'weight'
        then (array_agg(log.weight order by log.logged_on desc, log.created_at desc) filter (where log.weight is not null))[1]
        else (array_agg(log.body_fat_percentage order by log.logged_on desc, log.created_at desc) filter (where log.body_fat_percentage is not null))[1]
      end as latest_value
    from public.challenge_members member
    cross join selected_rule
    left join public.body_logs log
      on log.challenge_id = member.challenge_id
     and log.profile_id = member.profile_id
    where member.challenge_id = target_challenge_id
      and member.status in ('active', 'completed')
    group by member.id, member.profile_id, selected_rule.bonus_metric
  ), prepared as (
    select
      member.id as member_id,
      member.profile_id,
      profile.display_name,
      profile.avatar_path,
      coalesce(scores.total_points, 0)::integer as total_points,
      case
        when coalesce(completion.scheduled_count, 0) = 0 then 0::numeric
        else round((completion.completed_count::numeric / completion.scheduled_count) * 100, 1)
      end as completion_percentage,
      coalesce(scores.perfect_days, 0)::integer as perfect_days,
      selected_rule.bonus_metric,
      selected_rule.bonus_calculation,
      case
        when selected_rule.bonus_metric = 'none' then 0::numeric
        when member_logs.baseline_value is null or member_logs.latest_value is null then 0::numeric
        when selected_rule.bonus_calculation = 'percentage' and member_logs.baseline_value > 0
          then round(greatest(0, (member_logs.baseline_value - member_logs.latest_value) / member_logs.baseline_value * 100), 2)
        else round(greatest(0, member_logs.baseline_value - member_logs.latest_value), 2)
      end as bonus_points,
      member_logs.baseline_value,
      member_logs.latest_value,
      member.profile_id = auth.uid() as is_current_user,
      member.joined_at
    from public.challenge_members member
    join public.profiles profile on profile.id = member.profile_id
    cross join selected_rule
    left join scores on scores.member_id = member.id
    left join completion on completion.member_id = member.id
    left join member_logs on member_logs.member_id = member.id
    where member.challenge_id = target_challenge_id
      and member.status in ('active', 'completed')
  ), ranked as (
    select
      row_number() over (
        order by (prepared.total_points + prepared.bonus_points) desc,
          prepared.completion_percentage desc,
          prepared.perfect_days desc,
          prepared.joined_at,
          prepared.member_id
      ) as rank,
      prepared.*
    from prepared
  )
  select
    ranked.rank,
    ranked.member_id,
    ranked.profile_id,
    ranked.display_name,
    ranked.avatar_path,
    ranked.total_points,
    ranked.completion_percentage,
    ranked.perfect_days,
    'total_points'::text as scoring_method,
    ranked.bonus_metric,
    ranked.bonus_calculation,
    ranked.bonus_points,
    (ranked.total_points + ranked.bonus_points)::numeric as total_score,
    ranked.bonus_points as outcome_value,
    ranked.baseline_value,
    ranked.latest_value,
    ranked.is_current_user
  from ranked
  order by ranked.rank;
end;
$$;

revoke all on function public.list_challenge_leaderboard(uuid) from public, anon, authenticated;
grant execute on function public.list_challenge_leaderboard(uuid) to authenticated;
