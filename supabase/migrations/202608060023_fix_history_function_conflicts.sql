-- Return-column names become PL/pgSQL variables. Referencing the named unique
-- constraint avoids ambiguity inside both history materialization functions.

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
  on conflict on constraint task_occurrences_member_id_task_definition_id_local_date_key do nothing;

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
  on conflict on constraint task_occurrences_member_id_task_definition_id_local_date_key do nothing;

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

revoke all on function public.list_challenge_history(uuid) from public, anon, authenticated;
revoke all on function public.list_challenge_day(uuid, date) from public, anon, authenticated;
grant execute on function public.list_challenge_history(uuid) to authenticated;
grant execute on function public.list_challenge_day(uuid, date) to authenticated;
