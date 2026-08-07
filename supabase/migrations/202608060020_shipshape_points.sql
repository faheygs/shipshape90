-- ShipShape points are fixed platform rules:
-- +1 completed task, -3 missed task, +3 perfect day, +5 every 7 perfect days.

alter table public.activity_entries
  drop constraint if exists activity_entries_event_type_check;

alter table public.activity_entries
  add constraint activity_entries_event_type_check
  check (event_type in (
    'member_joined',
    'task_completed',
    'perfect_day',
    'streak',
    'rank_change',
    'announcement',
    'post',
    'day_submitted'
  ));

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
  missed_count integer := 0;
  points_before integer := 0;
  points_after integer := 0;
  normalized_selected_ids uuid[] := coalesce(selected_occurrence_ids, array[]::uuid[]);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select member.id into target_member_id
  from public.challenge_members member
  where member.challenge_id = target_challenge_id
    and member.profile_id = auth.uid()
    and member.status = 'active';

  if target_member_id is null then raise exception 'Active membership required'; end if;

  perform 1
  from public.task_occurrences occurrence
  where occurrence.challenge_id = target_challenge_id
    and occurrence.member_id = target_member_id
    and occurrence.local_date = target_local_date
  for update;

  if not found then raise exception 'No tasks are scheduled for this day'; end if;

  if cardinality(normalized_selected_ids) <> (
    select count(distinct selected.id)::integer
    from unnest(normalized_selected_ids) selected(id)
  ) then raise exception 'A task can only be selected once'; end if;

  if exists (
    select 1 from unnest(normalized_selected_ids) selected(id)
    left join public.task_occurrences occurrence
      on occurrence.id = selected.id
     and occurrence.challenge_id = target_challenge_id
     and occurrence.member_id = target_member_id
     and occurrence.local_date = target_local_date
     and occurrence.status = 'pending'
    where occurrence.id is null
  ) then raise exception 'One or more selected tasks are unavailable'; end if;

  if not exists (
    select 1 from public.task_occurrences occurrence
    where occurrence.challenge_id = target_challenge_id
      and occurrence.member_id = target_member_id
      and occurrence.local_date = target_local_date
      and occurrence.status = 'pending'
  ) then raise exception 'This day has already been submitted'; end if;

  select coalesce(sum(ledger.points), 0)::integer into points_before
  from public.score_ledger ledger
  where ledger.challenge_id = target_challenge_id
    and ledger.member_id = target_member_id
    and ledger.effective_date = target_local_date;

  foreach occurrence_id_value in array normalized_selected_ids loop
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
  end loop;

  with missed as (
    update public.task_occurrences occurrence
    set status = 'missed'::public.occurrence_status
    where occurrence.challenge_id = target_challenge_id
      and occurrence.member_id = target_member_id
      and occurrence.local_date = target_local_date
      and occurrence.status = 'pending'
      and not (occurrence.id = any(normalized_selected_ids))
    returning occurrence.id, occurrence.challenge_id, occurrence.member_id, occurrence.local_date
  )
  insert into public.score_ledger (
    challenge_id,
    member_id,
    occurrence_id,
    entry_type,
    points,
    effective_date,
    idempotency_key,
    metadata
  )
  select
    missed.challenge_id,
    missed.member_id,
    missed.id,
    'missed_penalty'::public.ledger_entry_type,
    -3,
    missed.local_date,
    'missed:' || missed.member_id::text || ':' || missed.id::text,
    jsonb_build_object('points', -3, 'reason', 'day_submitted')
  from missed
  on conflict (idempotency_key) do nothing;

  get diagnostics missed_count = row_count;

  select coalesce(sum(ledger.points), 0)::integer into points_after
  from public.score_ledger ledger
  where ledger.challenge_id = target_challenge_id
    and ledger.member_id = target_member_id
    and ledger.effective_date = target_local_date;

  insert into public.activity_entries (
    challenge_id,
    actor_profile_id,
    event_type,
    visibility,
    metadata
  ) values (
    target_challenge_id,
    auth.uid(),
    'day_submitted',
    'challenge',
    jsonb_build_object(
      'date', target_local_date,
      'completedCount', total_completed,
      'missedCount', missed_count,
      'points', points_after - points_before
    )
  );

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'challenge:' || target_challenge_id::text || ':activity',
    'score.day_submitted',
    target_challenge_id,
    jsonb_build_object(
      'version', 1,
      'challengeId', target_challenge_id,
      'memberId', target_member_id,
      'profileId', auth.uid(),
      'date', target_local_date,
      'completedCount', total_completed,
      'missedCount', missed_count,
      'points', points_after - points_before
    )
  );

  return query select total_completed, points_after - points_before;
end;
$$;

revoke all on function public.submit_challenge_day(uuid, date, uuid[]) from public, anon, authenticated;
grant execute on function public.submit_challenge_day(uuid, date, uuid[]) to authenticated;

create or replace function public.process_shipshape_daily_scoring()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected record;
  inserted_penalties integer := 0;
  group_penalties integer := 0;
begin
  -- Materialize today's daily missions for every active participant. This makes
  -- the deadline authoritative even when somebody never opens the app.
  insert into public.task_occurrences (
    challenge_id,
    member_id,
    task_definition_id,
    local_date
  )
  select
    challenge.id,
    member.id,
    task.id,
    (now() at time zone challenge.time_zone)::date
  from public.challenges challenge
  join public.challenge_members member
    on member.challenge_id = challenge.id
   and member.status = 'active'
  join public.task_definitions task
    on task.challenge_id = challenge.id
   and task.rules_version = challenge.rules_version
   and task.schedule ->> 'kind' = 'daily'
  where challenge.status = 'active'
    and (now() at time zone challenge.time_zone)::date between challenge.starts_on and challenge.ends_on
  on conflict (member_id, task_definition_id, local_date) do nothing;

  for affected in
    select
      occurrence.challenge_id,
      occurrence.member_id,
      occurrence.local_date,
      member.profile_id
    from public.task_occurrences occurrence
    join public.challenges challenge on challenge.id = occurrence.challenge_id
    join public.challenge_members member on member.id = occurrence.member_id
    where occurrence.status = 'pending'
      and occurrence.local_date < (now() at time zone challenge.time_zone)::date
    group by occurrence.challenge_id, occurrence.member_id, occurrence.local_date, member.profile_id
  loop
    with missed as (
      update public.task_occurrences occurrence
      set status = 'missed'::public.occurrence_status
      where occurrence.challenge_id = affected.challenge_id
        and occurrence.member_id = affected.member_id
        and occurrence.local_date = affected.local_date
        and occurrence.status = 'pending'
      returning occurrence.id, occurrence.challenge_id, occurrence.member_id, occurrence.local_date
    )
    insert into public.score_ledger (
      challenge_id,
      member_id,
      occurrence_id,
      entry_type,
      points,
      effective_date,
      idempotency_key,
      metadata
    )
    select
      missed.challenge_id,
      missed.member_id,
      missed.id,
      'missed_penalty'::public.ledger_entry_type,
      -3,
      missed.local_date,
      'missed:' || missed.member_id::text || ':' || missed.id::text,
      jsonb_build_object('points', -3, 'reason', 'deadline')
    from missed
    on conflict (idempotency_key) do nothing;

    get diagnostics group_penalties = row_count;
    inserted_penalties := inserted_penalties + group_penalties;

    if group_penalties > 0 then
      insert into public.activity_entries (
        challenge_id,
        actor_profile_id,
        event_type,
        visibility,
        metadata
      ) values (
        affected.challenge_id,
        affected.profile_id,
        'day_submitted',
        'challenge',
        jsonb_build_object(
          'date', affected.local_date,
          'completedCount', 0,
          'missedCount', group_penalties,
          'points', group_penalties * -3,
          'closedBy', 'deadline'
        )
      );

      insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
      values (
        'challenge:' || affected.challenge_id::text || ':activity',
        'score.day_closed',
        affected.challenge_id,
        jsonb_build_object(
          'version', 1,
          'challengeId', affected.challenge_id,
          'memberId', affected.member_id,
          'profileId', affected.profile_id,
          'date', affected.local_date,
          'missedCount', group_penalties,
          'points', group_penalties * -3
        )
      );
    end if;
  end loop;

  return inserted_penalties;
end;
$$;

revoke all on function public.process_shipshape_daily_scoring() from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'shipshape-daily-scoring';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'shipshape-daily-scoring',
    '* * * * *',
    'select public.process_shipshape_daily_scoring();'
  );
end;
$$;

comment on function public.submit_challenge_day(uuid, date, uuid[]) is
  'Finalizes a day immediately: +1 per selected mission, -3 per missed mission, plus automatic perfect-day and streak bonuses.';

comment on function public.process_shipshape_daily_scoring() is
  'Materializes current daily missions and closes overdue pending missions at -3 points. Realtime delivery remains trigger-driven.';
