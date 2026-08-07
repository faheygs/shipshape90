-- Challenge history and authoritative past-day amendments.
-- A member may correct any eligible day through today while the challenge is active.
-- Every edit rebuilds task points for that day and perfect/streak bonuses from that
-- date forward so rankings remain deterministic.

create or replace function public.list_challenge_history(target_challenge_id uuid)
returns table (
  local_date date,
  task_count integer,
  completed_count integer,
  missed_count integer,
  pending_count integer,
  day_points integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_record record;
  challenge_record record;
  first_date date;
  last_date date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select member.id, member.joined_at
  into member_record
  from public.challenge_members member
  where member.challenge_id = target_challenge_id
    and member.profile_id = auth.uid()
    and member.status in ('active', 'completed');

  if member_record.id is null then raise exception 'Challenge membership required'; end if;

  select challenge.starts_on, challenge.ends_on, challenge.time_zone, challenge.rules_version
  into challenge_record
  from public.challenges challenge
  where challenge.id = target_challenge_id;

  first_date := greatest(
    challenge_record.starts_on,
    coalesce((member_record.joined_at at time zone challenge_record.time_zone)::date, challenge_record.starts_on)
  );
  last_date := least(challenge_record.ends_on, (now() at time zone challenge_record.time_zone)::date);

  if first_date > last_date then return; end if;

  insert into public.task_occurrences (challenge_id, member_id, task_definition_id, local_date)
  select
    target_challenge_id,
    member_record.id,
    task.id,
    day_value::date
  from generate_series(first_date::timestamp, last_date::timestamp, interval '1 day') day_value
  join public.task_definitions task
    on task.challenge_id = target_challenge_id
   and task.rules_version = challenge_record.rules_version
   and task.schedule ->> 'kind' = 'daily'
  on conflict (member_id, task_definition_id, local_date) do nothing;

  return query
  with occurrence_totals as (
    select
      occurrence.local_date,
      count(*)::integer as task_count,
      count(*) filter (where occurrence.status in ('complete', 'pending_review'))::integer as completed_count,
      count(*) filter (where occurrence.status = 'missed')::integer as missed_count,
      count(*) filter (where occurrence.status = 'pending')::integer as pending_count
    from public.task_occurrences occurrence
    where occurrence.challenge_id = target_challenge_id
      and occurrence.member_id = member_record.id
      and occurrence.local_date between first_date and last_date
    group by occurrence.local_date
  ), ledger_totals as (
    select ledger.effective_date, coalesce(sum(ledger.points), 0)::integer as day_points
    from public.score_ledger ledger
    where ledger.challenge_id = target_challenge_id
      and ledger.member_id = member_record.id
      and ledger.effective_date between first_date and last_date
    group by ledger.effective_date
  )
  select
    occurrence_totals.local_date,
    occurrence_totals.task_count,
    occurrence_totals.completed_count,
    occurrence_totals.missed_count,
    occurrence_totals.pending_count,
    coalesce(ledger_totals.day_points, 0)::integer
  from occurrence_totals
  left join ledger_totals on ledger_totals.effective_date = occurrence_totals.local_date
  order by occurrence_totals.local_date desc;
end;
$$;

create or replace function public.list_challenge_day(
  target_challenge_id uuid,
  target_local_date date
)
returns table (
  occurrence_id uuid,
  task_definition_id uuid,
  title text,
  instructions text,
  task_type text,
  target_value numeric,
  unit text,
  points integer,
  proof_policy public.proof_policy,
  status public.occurrence_status,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_record record;
  challenge_record record;
  first_date date;
  last_date date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select member.id, member.joined_at
  into member_record
  from public.challenge_members member
  where member.challenge_id = target_challenge_id
    and member.profile_id = auth.uid()
    and member.status in ('active', 'completed');

  if member_record.id is null then raise exception 'Challenge membership required'; end if;

  select challenge.starts_on, challenge.ends_on, challenge.time_zone, challenge.rules_version
  into challenge_record
  from public.challenges challenge
  where challenge.id = target_challenge_id;

  first_date := greatest(
    challenge_record.starts_on,
    coalesce((member_record.joined_at at time zone challenge_record.time_zone)::date, challenge_record.starts_on)
  );
  last_date := least(challenge_record.ends_on, (now() at time zone challenge_record.time_zone)::date);

  if target_local_date < first_date or target_local_date > last_date then
    raise exception 'That date is outside your challenge history';
  end if;

  insert into public.task_occurrences (challenge_id, member_id, task_definition_id, local_date)
  select target_challenge_id, member_record.id, task.id, target_local_date
  from public.task_definitions task
  where task.challenge_id = target_challenge_id
    and task.rules_version = challenge_record.rules_version
    and task.schedule ->> 'kind' = 'daily'
  on conflict (member_id, task_definition_id, local_date) do nothing;

  return query
  select
    occurrence.id,
    task.id,
    task.title,
    task.instructions,
    task.task_type,
    task.target_value,
    task.unit,
    1,
    task.proof_policy,
    occurrence.status,
    occurrence.completed_at
  from public.task_occurrences occurrence
  join public.task_definitions task on task.id = occurrence.task_definition_id
  where occurrence.challenge_id = target_challenge_id
    and occurrence.member_id = member_record.id
    and occurrence.local_date = target_local_date
  order by task.ordinal;
end;
$$;

create or replace function public.amend_challenge_day(
  target_challenge_id uuid,
  target_local_date date,
  completed_occurrence_ids uuid[]
)
returns table (completed_count integer, score_delta integer, day_points integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_record record;
  challenge_record record;
  first_date date;
  last_date date;
  normalized_ids uuid[] := coalesce(completed_occurrence_ids, array[]::uuid[]);
  points_before integer := 0;
  points_after integer := 0;
  updated_day_points integer := 0;
  completed_total integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select member.id, member.joined_at
  into member_record
  from public.challenge_members member
  where member.challenge_id = target_challenge_id
    and member.profile_id = auth.uid()
    and member.status = 'active';

  if member_record.id is null then raise exception 'Active membership required'; end if;

  select challenge.starts_on, challenge.ends_on, challenge.time_zone,
         challenge.rules_version, challenge.status
  into challenge_record
  from public.challenges challenge
  where challenge.id = target_challenge_id;

  if challenge_record.status <> 'active' then raise exception 'Challenge is not active'; end if;

  first_date := greatest(
    challenge_record.starts_on,
    coalesce((member_record.joined_at at time zone challenge_record.time_zone)::date, challenge_record.starts_on)
  );
  last_date := least(challenge_record.ends_on, (now() at time zone challenge_record.time_zone)::date);

  if target_local_date < first_date or target_local_date > last_date then
    raise exception 'That date cannot be edited';
  end if;

  if cardinality(normalized_ids) <> (
    select count(distinct submitted.id)::integer from unnest(normalized_ids) submitted(id)
  ) then raise exception 'A task can only be selected once'; end if;

  insert into public.task_occurrences (challenge_id, member_id, task_definition_id, local_date)
  select target_challenge_id, member_record.id, task.id, target_local_date
  from public.task_definitions task
  where task.challenge_id = target_challenge_id
    and task.rules_version = challenge_record.rules_version
    and task.schedule ->> 'kind' = 'daily'
  on conflict (member_id, task_definition_id, local_date) do nothing;

  perform 1
  from public.task_occurrences occurrence
  where occurrence.challenge_id = target_challenge_id
    and occurrence.member_id = member_record.id
    and occurrence.local_date = target_local_date
  for update;

  if not found then raise exception 'No tasks are scheduled for this day'; end if;

  if exists (
    select 1
    from unnest(normalized_ids) submitted(id)
    left join public.task_occurrences occurrence
      on occurrence.id = submitted.id
     and occurrence.challenge_id = target_challenge_id
     and occurrence.member_id = member_record.id
     and occurrence.local_date = target_local_date
     and occurrence.status <> 'excused'
    where occurrence.id is null
  ) then raise exception 'One or more selected tasks are unavailable'; end if;

  select coalesce(sum(ledger.points), 0)::integer into points_before
  from public.score_ledger ledger
  where ledger.challenge_id = target_challenge_id
    and ledger.member_id = member_record.id;

  -- Keep every task non-perfect while task ledger rows are rebuilt. This prevents
  -- the insert trigger from awarding transient bonuses before the final state exists.
  update public.task_occurrences occurrence
  set status = 'pending'::public.occurrence_status,
      completed_at = null
  where occurrence.challenge_id = target_challenge_id
    and occurrence.member_id = member_record.id
    and occurrence.local_date = target_local_date
    and occurrence.status <> 'excused';

  delete from public.score_ledger ledger
  where ledger.challenge_id = target_challenge_id
    and ledger.member_id = member_record.id
    and (
      (ledger.effective_date = target_local_date and ledger.entry_type in ('task_complete', 'missed_penalty'))
      or (ledger.effective_date >= target_local_date and ledger.entry_type in ('perfect_day', 'streak_bonus'))
    );

  delete from public.checkins checkin
  using public.task_occurrences occurrence
  where checkin.occurrence_id = occurrence.id
    and occurrence.challenge_id = target_challenge_id
    and occurrence.member_id = member_record.id
    and occurrence.local_date = target_local_date
    and not (occurrence.id = any(normalized_ids));

  insert into public.checkins (
    occurrence_id, member_id, idempotency_key, completed_at
  )
  select
    occurrence.id,
    member_record.id,
    'history:' || member_record.id::text || ':' || occurrence.id::text,
    (target_local_date::timestamp + interval '12 hours') at time zone challenge_record.time_zone
  from public.task_occurrences occurrence
  where occurrence.challenge_id = target_challenge_id
    and occurrence.member_id = member_record.id
    and occurrence.local_date = target_local_date
    and occurrence.id = any(normalized_ids)
  on conflict (occurrence_id) do update
  set completed_at = excluded.completed_at;

  insert into public.score_ledger (
    challenge_id, member_id, occurrence_id, entry_type, points,
    effective_date, idempotency_key, metadata
  )
  select
    target_challenge_id,
    member_record.id,
    occurrence.id,
    'task_complete'::public.ledger_entry_type,
    1,
    target_local_date,
    'task:' || member_record.id::text || ':' || occurrence.id::text,
    jsonb_build_object('source', 'history_edit')
  from public.task_occurrences occurrence
  where occurrence.challenge_id = target_challenge_id
    and occurrence.member_id = member_record.id
    and occurrence.local_date = target_local_date
    and occurrence.id = any(normalized_ids);

  insert into public.score_ledger (
    challenge_id, member_id, occurrence_id, entry_type, points,
    effective_date, idempotency_key, metadata
  )
  select
    target_challenge_id,
    member_record.id,
    occurrence.id,
    'missed_penalty'::public.ledger_entry_type,
    -3,
    target_local_date,
    'missed:' || member_record.id::text || ':' || occurrence.id::text,
    jsonb_build_object('points', -3, 'reason', 'history_edit')
  from public.task_occurrences occurrence
  where occurrence.challenge_id = target_challenge_id
    and occurrence.member_id = member_record.id
    and occurrence.local_date = target_local_date
    and occurrence.status <> 'excused'
    and not (occurrence.id = any(normalized_ids));

  update public.task_occurrences occurrence
  set
    status = case
      when occurrence.id = any(normalized_ids)
        then case when task.proof_policy = 'required'
          then 'pending_review'::public.occurrence_status
          else 'complete'::public.occurrence_status end
      else 'missed'::public.occurrence_status
    end,
    completed_at = case when occurrence.id = any(normalized_ids)
      then (target_local_date::timestamp + interval '12 hours') at time zone challenge_record.time_zone
      else null end
  from public.task_definitions task
  where occurrence.task_definition_id = task.id
    and occurrence.challenge_id = target_challenge_id
    and occurrence.member_id = member_record.id
    and occurrence.local_date = target_local_date
    and occurrence.status <> 'excused';

  -- Rebuild bonuses from the edited date forward. Streak numbering is computed
  -- from the member's complete challenge history, so adding or removing a perfect
  -- day correctly shifts every later seven-day milestone.
  with day_stats as (
    select
      occurrence.local_date,
      count(*)::integer as task_count,
      bool_and(occurrence.status in ('complete', 'pending_review')) as is_perfect
    from public.task_occurrences occurrence
    where occurrence.challenge_id = target_challenge_id
      and occurrence.member_id = member_record.id
      and occurrence.local_date between first_date and last_date
    group by occurrence.local_date
  ), perfect_days as (
    select local_date, task_count
    from day_stats
    where task_count > 0 and is_perfect
  )
  insert into public.score_ledger (
    challenge_id, member_id, entry_type, points, effective_date, idempotency_key, metadata
  )
  select
    target_challenge_id,
    member_record.id,
    'perfect_day'::public.ledger_entry_type,
    public.shipshape_perfect_day_bonus(perfect_days.task_count),
    perfect_days.local_date,
    'perfect:' || member_record.id::text || ':' || perfect_days.local_date::text,
    jsonb_build_object(
      'bonus', public.shipshape_perfect_day_bonus(perfect_days.task_count),
      'taskCount', perfect_days.task_count,
      'source', 'history_recalculation'
    )
  from perfect_days
  where perfect_days.local_date >= target_local_date;

  with day_stats as (
    select
      occurrence.local_date,
      count(*)::integer as task_count,
      bool_and(occurrence.status in ('complete', 'pending_review')) as is_perfect
    from public.task_occurrences occurrence
    where occurrence.challenge_id = target_challenge_id
      and occurrence.member_id = member_record.id
      and occurrence.local_date between first_date and last_date
    group by occurrence.local_date
  ), perfect_days as (
    select local_date, task_count
    from day_stats
    where task_count > 0 and is_perfect
  ), numbered as (
    select
      local_date,
      task_count,
      local_date - row_number() over (order by local_date)::integer as streak_group
    from perfect_days
  ), streaked as (
    select
      local_date,
      task_count,
      row_number() over (partition by streak_group order by local_date)::integer as streak_number
    from numbered
  )
  insert into public.score_ledger (
    challenge_id, member_id, entry_type, points, effective_date, idempotency_key, metadata
  )
  select
    target_challenge_id,
    member_record.id,
    'streak_bonus'::public.ledger_entry_type,
    public.shipshape_seven_day_streak_bonus(streaked.task_count),
    streaked.local_date,
    'streak:' || member_record.id::text || ':' || streaked.local_date::text || ':' || streaked.streak_number::text,
    jsonb_build_object(
      'points', public.shipshape_seven_day_streak_bonus(streaked.task_count),
      'streak', streaked.streak_number,
      'taskCount', streaked.task_count,
      'source', 'history_recalculation'
    )
  from streaked
  where streaked.local_date >= target_local_date
    and streaked.streak_number % 7 = 0;

  select count(*)::integer into completed_total
  from public.task_occurrences occurrence
  where occurrence.challenge_id = target_challenge_id
    and occurrence.member_id = member_record.id
    and occurrence.local_date = target_local_date
    and occurrence.status in ('complete', 'pending_review');

  select coalesce(sum(ledger.points), 0)::integer into points_after
  from public.score_ledger ledger
  where ledger.challenge_id = target_challenge_id
    and ledger.member_id = member_record.id;

  select coalesce(sum(ledger.points), 0)::integer into updated_day_points
  from public.score_ledger ledger
  where ledger.challenge_id = target_challenge_id
    and ledger.member_id = member_record.id
    and ledger.effective_date = target_local_date;

  insert into public.activity_entries (
    challenge_id, actor_profile_id, event_type, body, visibility, metadata
  ) values (
    target_challenge_id,
    auth.uid(),
    'day_submitted',
    'updated a past day',
    'challenge',
    jsonb_build_object(
      'date', target_local_date,
      'completedCount', completed_total,
      'points', points_after - points_before,
      'historyEdit', true
    )
  );

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'challenge:' || target_challenge_id::text || ':activity',
    'score.day_updated',
    target_challenge_id,
    jsonb_build_object(
      'version', 1,
      'challengeId', target_challenge_id,
      'memberId', member_record.id,
      'profileId', auth.uid(),
      'date', target_local_date,
      'completedCount', completed_total,
      'scoreDelta', points_after - points_before,
      'dayPoints', updated_day_points
    )
  );

  return query select completed_total, points_after - points_before, updated_day_points;
end;
$$;

revoke all on function public.list_challenge_history(uuid) from public, anon, authenticated;
revoke all on function public.list_challenge_day(uuid, date) from public, anon, authenticated;
revoke all on function public.amend_challenge_day(uuid, date, uuid[]) from public, anon, authenticated;
grant execute on function public.list_challenge_history(uuid) to authenticated;
grant execute on function public.list_challenge_day(uuid, date) to authenticated;
grant execute on function public.amend_challenge_day(uuid, date, uuid[]) to authenticated;

comment on function public.list_challenge_history(uuid) is
  'Lists the signed-in member daily challenge history through today with authoritative day points.';
comment on function public.list_challenge_day(uuid, date) is
  'Returns editable task occurrences for one eligible challenge date.';
comment on function public.amend_challenge_day(uuid, date, uuid[]) is
  'Replaces a member day state and deterministically recalculates task, perfect-day, and streak points.';
