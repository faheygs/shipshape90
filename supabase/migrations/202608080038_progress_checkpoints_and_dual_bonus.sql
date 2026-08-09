alter table public.winner_rules
  add column if not exists weight_bonus_calculation text
    check (weight_bonus_calculation is null or weight_bonus_calculation in ('percentage', 'total_change')),
  add column if not exists body_fat_bonus_calculation text
    check (body_fat_bonus_calculation is null or body_fat_bonus_calculation in ('percentage', 'total_change'));

update public.winner_rules
set weight_bonus_calculation = case when bonus_metric = 'weight' then bonus_calculation else weight_bonus_calculation end,
    body_fat_bonus_calculation = case when bonus_metric = 'body_fat' then bonus_calculation else body_fat_bonus_calculation end;

create table public.challenge_checkpoints (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  rules_version integer not null check (rules_version > 0),
  ordinal integer not null check (ordinal between 0 and 4),
  checkpoint_kind text not null check (checkpoint_kind in ('start', 'milestone', 'final')),
  label text not null check (char_length(trim(label)) between 2 and 40),
  day_number integer not null check (day_number > 0),
  requires_weight boolean not null default false,
  requires_body_fat boolean not null default false,
  requires_photo boolean not null default false,
  created_at timestamptz not null default now(),
  check (requires_weight or requires_body_fat or requires_photo),
  unique (challenge_id, rules_version, ordinal),
  unique (challenge_id, rules_version, day_number)
);

create index challenge_checkpoints_challenge_day_idx
  on public.challenge_checkpoints(challenge_id, rules_version, day_number);

alter table public.challenge_checkpoints enable row level security;

create policy "visible challenge checkpoints are readable" on public.challenge_checkpoints
for select using (
  exists (
    select 1 from public.challenges challenge
    where challenge.id = challenge_checkpoints.challenge_id
      and (
        challenge.visibility in ('public', 'unlisted')
        or challenge.owner_id = auth.uid()
        or public.is_challenge_member(challenge.id)
      )
  )
);

create policy "owners manage challenge checkpoints" on public.challenge_checkpoints
for all to authenticated using (
  public.has_challenge_role(challenge_id, array['owner']::public.member_role[])
) with check (
  public.has_challenge_role(challenge_id, array['owner']::public.member_role[])
);

grant select, insert, update, delete on public.challenge_checkpoints to authenticated;
grant select on public.challenge_checkpoints to anon;

alter table public.body_logs
  add column if not exists checkpoint_id uuid references public.challenge_checkpoints(id) on delete set null;

alter table public.body_logs
  add constraint body_logs_profile_checkpoint_unique unique (profile_id, checkpoint_id);

create index body_logs_checkpoint_idx on public.body_logs(checkpoint_id) where checkpoint_id is not null;

-- ShipShape tasks are honor-system commitments. Progress checkpoints are separate
-- structured records and never act as evidence for individual tasks.
update public.task_catalog set default_proof_policy = 'none'::public.proof_policy
where default_proof_policy <> 'none'::public.proof_policy;

update public.task_definitions set proof_policy = 'none'::public.proof_policy
where proof_policy <> 'none'::public.proof_policy;

update public.task_occurrences set status = 'complete'::public.occurrence_status
where status = 'pending_review'::public.occurrence_status;

drop function if exists public.create_challenge_draft(
  text, text, public.challenge_visibility, text, date, date, text, text, text, jsonb, jsonb
);

create function public.create_challenge_draft(
  challenge_name text,
  challenge_description text,
  challenge_visibility public.challenge_visibility,
  challenge_join_policy text,
  challenge_starts_on date,
  challenge_ends_on date,
  challenge_reward text,
  challenge_weight_bonus_calculation text,
  challenge_body_fat_bonus_calculation text,
  configured_checkpoints jsonb,
  configured_tasks jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_challenge_id uuid;
  challenge_day_count integer := challenge_ends_on - challenge_starts_on + 1;
  checkpoint_count integer;
  legacy_metric text;
  legacy_calculation text;
begin
  if challenge_day_count < 2 then
    raise exception 'A challenge must run for at least two days';
  end if;
  if challenge_weight_bonus_calculation is not null
     and challenge_weight_bonus_calculation not in ('percentage', 'total_change') then
    raise exception 'Invalid weight bonus calculation';
  end if;
  if challenge_body_fat_bonus_calculation is not null
     and challenge_body_fat_bonus_calculation not in ('percentage', 'total_change') then
    raise exception 'Invalid body-fat bonus calculation';
  end if;
  if configured_checkpoints is null or jsonb_typeof(configured_checkpoints) <> 'array' then
    raise exception 'Challenge checkpoints must be an array';
  end if;

  checkpoint_count := jsonb_array_length(configured_checkpoints);
  if checkpoint_count not between 2 and 5 then
    raise exception 'Choose a start, a final, and up to three milestone check-ins';
  end if;
  if (select count(*) from jsonb_array_elements(configured_checkpoints) item
      where item ->> 'kind' = 'start' and (item ->> 'dayNumber')::integer = 1) <> 1 then
    raise exception 'A Day 1 start check-in is required';
  end if;
  if (select count(*) from jsonb_array_elements(configured_checkpoints) item
      where item ->> 'kind' = 'final' and (item ->> 'dayNumber')::integer = challenge_day_count) <> 1 then
    raise exception 'A final-day check-in is required';
  end if;
  if (select count(*) from jsonb_array_elements(configured_checkpoints) item
      where item ->> 'kind' = 'milestone') > 3 then
    raise exception 'A challenge can have up to three milestone check-ins';
  end if;
  if exists (
    select 1 from jsonb_array_elements(configured_checkpoints) item
    where (item ->> 'kind') not in ('start', 'milestone', 'final')
       or coalesce((item ->> 'dayNumber')::integer, 0) not between 1 and challenge_day_count
       or char_length(trim(coalesce(item ->> 'label', ''))) not between 2 and 40
  ) then raise exception 'One or more check-ins are invalid'; end if;
  if (select count(distinct (item ->> 'dayNumber')::integer) from jsonb_array_elements(configured_checkpoints) item) <> checkpoint_count then
    raise exception 'Check-ins must fall on different challenge days';
  end if;
  if exists (
    select 1 from jsonb_array_elements(configured_checkpoints) item
    where not (
      coalesce((item ->> 'requiresWeight')::boolean, false)
      or coalesce((item ->> 'requiresBodyFat')::boolean, false)
      or coalesce((item ->> 'requiresPhoto')::boolean, false)
      or ((item ->> 'kind') in ('start', 'final') and challenge_weight_bonus_calculation is not null)
      or ((item ->> 'kind') in ('start', 'final') and challenge_body_fat_bonus_calculation is not null)
    )
  ) then raise exception 'Every check-in must require at least one progress item'; end if;

  legacy_metric := case
    when challenge_weight_bonus_calculation is not null then 'weight'
    when challenge_body_fat_bonus_calculation is not null then 'body_fat'
    else 'none'
  end;
  legacy_calculation := case legacy_metric
    when 'weight' then challenge_weight_bonus_calculation
    when 'body_fat' then challenge_body_fat_bonus_calculation
    else null
  end;

  created_challenge_id := public.create_challenge_draft(
    challenge_name, challenge_description, challenge_visibility, challenge_join_policy,
    challenge_starts_on, challenge_ends_on, challenge_reward,
    legacy_metric, legacy_calculation, configured_tasks
  );

  update public.winner_rules
  set weight_bonus_calculation = challenge_weight_bonus_calculation,
      body_fat_bonus_calculation = challenge_body_fat_bonus_calculation
  where challenge_id = created_challenge_id and rules_version = 1;

  update public.task_definitions
  set proof_policy = 'none'::public.proof_policy
  where challenge_id = created_challenge_id and rules_version = 1;

  insert into public.challenge_checkpoints (
    challenge_id, rules_version, ordinal, checkpoint_kind, label, day_number,
    requires_weight, requires_body_fat, requires_photo
  )
  select
    created_challenge_id,
    1,
    source.ordinality - 1,
    source.item ->> 'kind',
    trim(source.item ->> 'label'),
    (source.item ->> 'dayNumber')::integer,
    coalesce((source.item ->> 'requiresWeight')::boolean, false)
      or ((source.item ->> 'kind') in ('start', 'final') and challenge_weight_bonus_calculation is not null),
    coalesce((source.item ->> 'requiresBodyFat')::boolean, false)
      or ((source.item ->> 'kind') in ('start', 'final') and challenge_body_fat_bonus_calculation is not null),
    coalesce((source.item ->> 'requiresPhoto')::boolean, false)
  from jsonb_array_elements(configured_checkpoints) with ordinality source(item, ordinality)
  order by (source.item ->> 'dayNumber')::integer;

  return created_challenge_id;
end;
$$;

revoke all on function public.create_challenge_draft(
  text, text, public.challenge_visibility, text, date, date, text, text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.create_challenge_draft(
  text, text, public.challenge_visibility, text, date, date, text, text, text, jsonb, jsonb
) to authenticated;

create or replace function public.list_my_challenge_checkpoints(target_challenge_id uuid)
returns table (
  checkpoint_id uuid,
  checkpoint_kind text,
  label text,
  day_number integer,
  scheduled_on date,
  requires_weight boolean,
  requires_body_fat boolean,
  requires_photo boolean,
  body_log_id uuid,
  completed_at timestamptz,
  weight numeric,
  body_fat_percentage numeric,
  photo_path text,
  is_due boolean,
  is_blocking boolean,
  can_complete boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  member_record record;
  challenge_record record;
  scoring_date date;
  first_scoring_date date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select member.id, member.joined_at, member.scoring_time_zone
  into member_record
  from public.challenge_members member
  where member.challenge_id = target_challenge_id
    and member.profile_id = auth.uid()
    and member.status in ('active', 'completed');
  if member_record.id is null then raise exception 'Challenge membership required'; end if;

  select challenge.starts_on, challenge.ends_on, challenge.rules_version
  into challenge_record
  from public.challenges challenge where challenge.id = target_challenge_id;

  scoring_date := (now() at time zone member_record.scoring_time_zone)::date;
  first_scoring_date := greatest(
    challenge_record.starts_on,
    (member_record.joined_at at time zone member_record.scoring_time_zone)::date
  );

  return query
  with scheduled as (
    select checkpoint.*,
      case checkpoint.checkpoint_kind
        when 'start' then first_scoring_date
        when 'final' then challenge_record.ends_on
        else challenge_record.starts_on + (checkpoint.day_number - 1)
      end as due_date
    from public.challenge_checkpoints checkpoint
    where checkpoint.challenge_id = target_challenge_id
      and checkpoint.rules_version = challenge_record.rules_version
  ), eligible as (
    select * from scheduled
    where checkpoint_kind <> 'milestone' or due_date >= first_scoring_date
  ), rows_with_state as (
    select eligible.*, log.id as log_id, log.updated_at as log_completed_at,
      log.weight as log_weight, log.body_fat_percentage as log_body_fat, log.photo_path as log_photo
    from eligible
    left join public.body_logs log
      on log.checkpoint_id = eligible.id and log.profile_id = auth.uid()
  )
  select
    row.id, row.checkpoint_kind, row.label, row.day_number, row.due_date,
    row.requires_weight, row.requires_body_fat, row.requires_photo,
    row.log_id, row.log_completed_at, row.log_weight, row.log_body_fat, row.log_photo,
    row.due_date <= scoring_date,
    row.due_date <= scoring_date and row.log_id is null,
    row.due_date <= scoring_date
  from rows_with_state row
  order by row.due_date, row.ordinal;
end;
$$;

revoke all on function public.list_my_challenge_checkpoints(uuid) from public, anon, authenticated;
grant execute on function public.list_my_challenge_checkpoints(uuid) to authenticated;

create or replace function public.save_challenge_checkin(
  target_checkpoint_id uuid,
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
  checkpoint_record record;
  member_record record;
  challenge_record record;
  scheduled_date date;
  scoring_date date;
  first_scoring_date date;
  existing_record record;
  final_weight numeric;
  final_body_fat numeric;
  final_photo text;
  saved_log_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select checkpoint.*, challenge.starts_on, challenge.ends_on
  into checkpoint_record
  from public.challenge_checkpoints checkpoint
  join public.challenges challenge on challenge.id = checkpoint.challenge_id
  where checkpoint.id = target_checkpoint_id;
  if checkpoint_record.id is null then raise exception 'Check-in not found'; end if;

  select member.id, member.joined_at, member.scoring_time_zone
  into member_record
  from public.challenge_members member
  where member.challenge_id = checkpoint_record.challenge_id
    and member.profile_id = auth.uid()
    and member.status in ('active', 'completed');
  if member_record.id is null then raise exception 'Challenge membership required'; end if;

  scoring_date := (now() at time zone member_record.scoring_time_zone)::date;
  first_scoring_date := greatest(
    checkpoint_record.starts_on,
    (member_record.joined_at at time zone member_record.scoring_time_zone)::date
  );
  scheduled_date := case checkpoint_record.checkpoint_kind
    when 'start' then first_scoring_date
    when 'final' then checkpoint_record.ends_on
    else checkpoint_record.starts_on + (checkpoint_record.day_number - 1)
  end;

  if checkpoint_record.checkpoint_kind = 'milestone' and scheduled_date < first_scoring_date then
    raise exception 'This checkpoint was before your challenge start';
  end if;
  if scheduled_date > scoring_date then raise exception 'This check-in is not open yet'; end if;
  if log_weight is not null and (log_weight <= 0 or log_weight > 1500) then raise exception 'Enter a valid weight'; end if;
  if log_body_fat_percentage is not null and (log_body_fat_percentage <= 0 or log_body_fat_percentage > 75) then raise exception 'Enter a valid body-fat percentage'; end if;
  if log_photo_path is not null and log_photo_path !~ ('^' || auth.uid()::text || '/') then raise exception 'Invalid progress photo path'; end if;

  select log.* into existing_record
  from public.body_logs log
  where log.profile_id = auth.uid() and log.checkpoint_id = target_checkpoint_id;

  final_weight := coalesce(log_weight, existing_record.weight);
  final_body_fat := coalesce(log_body_fat_percentage, existing_record.body_fat_percentage);
  final_photo := coalesce(nullif(trim(log_photo_path), ''), existing_record.photo_path);

  if checkpoint_record.requires_weight and final_weight is null then raise exception 'Weight is required for this check-in'; end if;
  if checkpoint_record.requires_body_fat and final_body_fat is null then raise exception 'Body fat is required for this check-in'; end if;
  if checkpoint_record.requires_photo and final_photo is null then raise exception 'A progress photo is required for this check-in'; end if;

  insert into public.body_logs (
    profile_id, challenge_id, checkpoint_id, logged_on, weight, body_fat_percentage, photo_path, note
  ) values (
    auth.uid(), checkpoint_record.challenge_id, target_checkpoint_id, scheduled_date,
    final_weight, final_body_fat, final_photo, nullif(trim(log_note), '')
  )
  on conflict (profile_id, checkpoint_id) do update set
    weight = excluded.weight,
    body_fat_percentage = excluded.body_fat_percentage,
    photo_path = excluded.photo_path,
    note = coalesce(excluded.note, public.body_logs.note),
    updated_at = now()
  returning id into saved_log_id;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'user:' || auth.uid()::text || ':notifications',
    'progress.checkpoint_completed',
    checkpoint_record.challenge_id,
    jsonb_build_object(
      'version', 1,
      'challengeId', checkpoint_record.challenge_id,
      'profileId', auth.uid(),
      'checkpointId', target_checkpoint_id,
      'bodyLogId', saved_log_id,
      'label', checkpoint_record.label
    )
  );

  return saved_log_id;
end;
$$;

revoke all on function public.save_challenge_checkin(uuid, numeric, numeric, text, text) from public, anon, authenticated;
grant execute on function public.save_challenge_checkin(uuid, numeric, numeric, text, text) to authenticated;

create or replace function public.has_unfinished_challenge_checkpoint(
  target_challenge_id uuid,
  target_profile_id uuid,
  through_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with context as (
    select challenge.starts_on, challenge.ends_on, challenge.rules_version,
           greatest(challenge.starts_on, (member.joined_at at time zone member.scoring_time_zone)::date) as first_date
    from public.challenges challenge
    join public.challenge_members member on member.challenge_id = challenge.id
    where challenge.id = target_challenge_id and member.profile_id = target_profile_id
  ), scheduled as (
    select checkpoint.id, checkpoint.checkpoint_kind,
      case checkpoint.checkpoint_kind
        when 'start' then context.first_date
        when 'final' then context.ends_on
        else context.starts_on + (checkpoint.day_number - 1)
      end as due_date,
      context.first_date
    from context
    join public.challenge_checkpoints checkpoint
      on checkpoint.challenge_id = target_challenge_id
     and checkpoint.rules_version = context.rules_version
  )
  select exists (
    select 1 from scheduled
    where (checkpoint_kind <> 'milestone' or due_date >= first_date)
      and due_date <= through_date
      and not exists (
        select 1 from public.body_logs log
        where log.profile_id = target_profile_id and log.checkpoint_id = scheduled.id
      )
  );
$$;

revoke all on function public.has_unfinished_challenge_checkpoint(uuid, uuid, date) from public, anon, authenticated;

-- Wrap the proven day-scoring functions so every task write path enforces the gate.
alter function public.submit_challenge_day(uuid, date, uuid[]) rename to submit_challenge_day_without_checkpoint_gate;

create function public.submit_challenge_day(
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
  member_time_zone text;
  scoring_date date;
begin
  select member.scoring_time_zone into member_time_zone
  from public.challenge_members member
  where member.challenge_id = target_challenge_id
    and member.profile_id = auth.uid()
    and member.status = 'active';
  if member_time_zone is null then raise exception 'Active membership required'; end if;
  scoring_date := (now() at time zone member_time_zone)::date;
  if public.has_unfinished_challenge_checkpoint(target_challenge_id, auth.uid(), scoring_date) then
    raise exception 'Complete your required progress check-in before submitting tasks';
  end if;
  return query select * from public.submit_challenge_day_without_checkpoint_gate(
    target_challenge_id, target_local_date, selected_occurrence_ids
  );
end;
$$;

revoke all on function public.submit_challenge_day_without_checkpoint_gate(uuid, date, uuid[]) from public, anon, authenticated;
revoke all on function public.submit_challenge_day(uuid, date, uuid[]) from public, anon, authenticated;
grant execute on function public.submit_challenge_day(uuid, date, uuid[]) to authenticated;

alter function public.amend_challenge_day(uuid, date, uuid[]) rename to amend_challenge_day_without_checkpoint_gate;

create function public.amend_challenge_day(
  target_challenge_id uuid,
  target_local_date date,
  completed_occurrence_ids uuid[]
)
returns table (completed_count integer, score_delta integer, day_points integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if public.has_unfinished_challenge_checkpoint(target_challenge_id, auth.uid(), target_local_date) then
    raise exception 'Complete the required progress check-in for this date first';
  end if;
  return query select * from public.amend_challenge_day_without_checkpoint_gate(
    target_challenge_id, target_local_date, completed_occurrence_ids
  );
end;
$$;

revoke all on function public.amend_challenge_day_without_checkpoint_gate(uuid, date, uuid[]) from public, anon, authenticated;
revoke all on function public.amend_challenge_day(uuid, date, uuid[]) from public, anon, authenticated;
grant execute on function public.amend_challenge_day(uuid, date, uuid[]) to authenticated;

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
  is_current_user boolean,
  weight_bonus_calculation text,
  body_fat_bonus_calculation text,
  weight_bonus_points numeric,
  body_fat_bonus_points numeric,
  weight_baseline numeric,
  weight_final numeric,
  body_fat_baseline numeric,
  body_fat_final numeric
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
    select rules.weight_bonus_calculation, rules.body_fat_bonus_calculation
    from public.challenges challenge
    join public.winner_rules rules
      on rules.challenge_id = challenge.id and rules.rules_version = challenge.rules_version
    where challenge.id = target_challenge_id
  ), scores as (
    select ledger.member_id, coalesce(sum(ledger.points), 0)::integer as points,
      count(*) filter (where ledger.entry_type = 'perfect_day')::integer as perfect_count
    from public.score_ledger ledger
    where ledger.challenge_id = target_challenge_id
    group by ledger.member_id
  ), completion as (
    select occurrence.member_id, count(*)::integer as scheduled_count,
      count(*) filter (where occurrence.status = 'complete')::integer as completed_count
    from public.task_occurrences occurrence
    where occurrence.challenge_id = target_challenge_id
    group by occurrence.member_id
  ), checkpoint_values as (
    select member.id as member_id,
      max(log.weight) filter (where checkpoint.checkpoint_kind = 'start') as weight_start,
      max(log.weight) filter (where checkpoint.checkpoint_kind = 'final') as weight_end,
      max(log.body_fat_percentage) filter (where checkpoint.checkpoint_kind = 'start') as body_fat_start,
      max(log.body_fat_percentage) filter (where checkpoint.checkpoint_kind = 'final') as body_fat_end
    from public.challenge_members member
    left join public.body_logs log
      on log.challenge_id = member.challenge_id and log.profile_id = member.profile_id
    left join public.challenge_checkpoints checkpoint on checkpoint.id = log.checkpoint_id
    where member.challenge_id = target_challenge_id and member.status in ('active', 'completed')
    group by member.id
  ), prepared as (
    select member.id as member_id, member.profile_id, profile.display_name, profile.avatar_path,
      coalesce(scores.points, 0)::integer as core_points,
      case when coalesce(completion.scheduled_count, 0) = 0 then 0::numeric
        else round(completion.completed_count::numeric / completion.scheduled_count * 100, 1) end as completion_pct,
      coalesce(scores.perfect_count, 0)::integer as perfect_count,
      selected_rule.weight_bonus_calculation, selected_rule.body_fat_bonus_calculation,
      case
        when selected_rule.weight_bonus_calculation is null or values.weight_start is null or values.weight_end is null then 0::numeric
        when selected_rule.weight_bonus_calculation = 'percentage' and values.weight_start > 0
          then round(greatest(0, (values.weight_start - values.weight_end) / values.weight_start * 100), 2)
        else round(greatest(0, values.weight_start - values.weight_end), 2)
      end as weight_points,
      case
        when selected_rule.body_fat_bonus_calculation is null or values.body_fat_start is null or values.body_fat_end is null then 0::numeric
        when selected_rule.body_fat_bonus_calculation = 'percentage' and values.body_fat_start > 0
          then round(greatest(0, (values.body_fat_start - values.body_fat_end) / values.body_fat_start * 100), 2)
        else round(greatest(0, values.body_fat_start - values.body_fat_end), 2)
      end as body_fat_points,
      values.weight_start, values.weight_end, values.body_fat_start, values.body_fat_end,
      member.profile_id = auth.uid() as mine, member.joined_at
    from public.challenge_members member
    join public.profiles profile on profile.id = member.profile_id
    cross join selected_rule
    left join scores on scores.member_id = member.id
    left join completion on completion.member_id = member.id
    left join checkpoint_values values on values.member_id = member.id
    where member.challenge_id = target_challenge_id and member.status in ('active', 'completed')
  ), ranked as (
    select row_number() over (
      order by (prepared.core_points + prepared.weight_points + prepared.body_fat_points) desc,
        prepared.completion_pct desc, prepared.perfect_count desc, prepared.joined_at, prepared.member_id
    ) as place, prepared.*
    from prepared
  )
  select ranked.place, ranked.member_id, ranked.profile_id, ranked.display_name, ranked.avatar_path,
    ranked.core_points, ranked.completion_pct, ranked.perfect_count, 'total_points'::text,
    case when ranked.weight_bonus_calculation is not null and ranked.body_fat_bonus_calculation is null then 'weight'
         when ranked.body_fat_bonus_calculation is not null and ranked.weight_bonus_calculation is null then 'body_fat'
         else 'none' end,
    coalesce(ranked.weight_bonus_calculation, ranked.body_fat_bonus_calculation),
    ranked.weight_points + ranked.body_fat_points,
    ranked.core_points + ranked.weight_points + ranked.body_fat_points,
    ranked.weight_points + ranked.body_fat_points,
    case when ranked.mine and ranked.weight_bonus_calculation is not null and ranked.body_fat_bonus_calculation is null then ranked.weight_start
         when ranked.mine and ranked.body_fat_bonus_calculation is not null and ranked.weight_bonus_calculation is null then ranked.body_fat_start end,
    case when ranked.mine and ranked.weight_bonus_calculation is not null and ranked.body_fat_bonus_calculation is null then ranked.weight_end
         when ranked.mine and ranked.body_fat_bonus_calculation is not null and ranked.weight_bonus_calculation is null then ranked.body_fat_end end,
    ranked.mine,
    ranked.weight_bonus_calculation, ranked.body_fat_bonus_calculation,
    ranked.weight_points, ranked.body_fat_points,
    case when ranked.mine then ranked.weight_start end,
    case when ranked.mine then ranked.weight_end end,
    case when ranked.mine then ranked.body_fat_start end,
    case when ranked.mine then ranked.body_fat_end end
  from ranked order by ranked.place;
end;
$$;

revoke all on function public.list_challenge_leaderboard(uuid) from public, anon, authenticated;
grant execute on function public.list_challenge_leaderboard(uuid) to authenticated;

drop function if exists public.list_challenges();
create function public.list_challenges()
returns table (
  id uuid, slug text, name text, description text, category text,
  visibility public.challenge_visibility, join_policy text, challenge_status text,
  starts_on date, ends_on date, participant_count bigint, membership_status text,
  cover_path text, prize_description text, scoring_method text,
  bonus_metric text, bonus_calculation text,
  weight_bonus_calculation text, body_fat_bonus_calculation text,
  is_saved boolean, is_queued boolean, queue_status text, is_owner boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select challenge.id, challenge.slug, challenge.name, challenge.description, challenge.category,
    challenge.visibility, challenge.join_policy, challenge.status::text,
    challenge.starts_on, challenge.ends_on,
    count(member.id) filter (where member.status in ('pending', 'active', 'completed')),
    coalesce(max(mine.status::text), 'none'), challenge.cover_path, challenge.prize_description,
    'total_points'::text, coalesce(rules.bonus_metric, 'none'), rules.bonus_calculation,
    rules.weight_bonus_calculation, rules.body_fat_bonus_calculation,
    bool_or(saved.profile_id is not null), bool_or(my_queue.status in ('queued', 'blocked')),
    max(my_queue.status), challenge.owner_id = auth.uid()
  from public.challenges challenge
  left join public.challenge_members member on member.challenge_id = challenge.id
  left join public.challenge_members mine on mine.challenge_id = challenge.id and mine.profile_id = auth.uid()
  left join public.winner_rules rules on rules.challenge_id = challenge.id and rules.rules_version = challenge.rules_version
  left join public.challenge_saves saved on saved.challenge_id = challenge.id and saved.profile_id = auth.uid()
  left join public.challenge_join_queue my_queue on my_queue.challenge_id = challenge.id and my_queue.profile_id = auth.uid()
  where challenge.visibility = 'public' or challenge.owner_id = auth.uid() or mine.id is not null
  group by challenge.id, rules.bonus_metric, rules.bonus_calculation,
    rules.weight_bonus_calculation, rules.body_fat_bonus_calculation
  order by case when max(mine.status::text) = 'active' then 0 else 1 end,
    challenge.starts_on, challenge.created_at desc;
$$;

revoke all on function public.list_challenges() from public, anon, authenticated;
grant execute on function public.list_challenges() to anon, authenticated;
