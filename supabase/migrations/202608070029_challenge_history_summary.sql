create or replace function public.list_my_challenge_history()
returns table (
  challenge_id uuid,
  challenge_name text,
  starts_on date,
  ends_on date,
  membership_status text,
  result_status text,
  joined_at timestamptz,
  withdrawn_at timestamptz,
  prize_eligible boolean,
  forfeiture_reason text,
  total_points integer,
  completed_tasks integer,
  scheduled_tasks integer,
  completion_percentage numeric,
  perfect_days integer,
  days_participated integer,
  final_rank bigint,
  participant_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  return query
  with mine as (
    select
      member.id as member_id,
      member.challenge_id,
      member.status,
      member.joined_at,
      member.withdrawn_at,
      member.prize_eligible,
      member.forfeiture_reason,
      member.scoring_time_zone,
      challenge.name,
      challenge.starts_on,
      challenge.ends_on
    from public.challenge_members member
    join public.challenges challenge on challenge.id = member.challenge_id
    where member.profile_id = auth.uid()
      and member.joined_at is not null
      and (
        member.status in ('left', 'removed', 'completed')
        or (now() at time zone member.scoring_time_zone)::date > challenge.ends_on
      )
  ), scores as (
    select ledger.member_id,
           coalesce(sum(ledger.points), 0)::integer as total_points,
           count(*) filter (where ledger.entry_type = 'perfect_day')::integer as perfect_days
    from public.score_ledger ledger
    where ledger.challenge_id in (select mine.challenge_id from mine)
    group by ledger.member_id
  ), completion as (
    select occurrence.member_id,
           count(*)::integer as scheduled_tasks,
           count(*) filter (
             where occurrence.status in ('complete', 'pending_review')
           )::integer as completed_tasks,
           count(distinct occurrence.local_date)::integer as days_participated
    from public.task_occurrences occurrence
    where occurrence.challenge_id in (select mine.challenge_id from mine)
    group by occurrence.member_id
  ), eligible as (
    select
      member.challenge_id,
      member.id as member_id,
      coalesce(scores.total_points, 0) as total_points,
      case when coalesce(completion.scheduled_tasks, 0) = 0 then 0::numeric
        else round(completion.completed_tasks::numeric / completion.scheduled_tasks * 100, 1)
      end as completion_percentage,
      coalesce(scores.perfect_days, 0) as perfect_days,
      member.joined_at
    from public.challenge_members member
    left join scores on scores.member_id = member.id
    left join completion on completion.member_id = member.id
    where member.challenge_id in (select mine.challenge_id from mine)
      and member.status in ('active', 'completed')
      and member.prize_eligible
  ), ranked as (
    select eligible.challenge_id,
           eligible.member_id,
           row_number() over (
             partition by eligible.challenge_id
             order by eligible.total_points desc,
                      eligible.completion_percentage desc,
                      eligible.perfect_days desc,
                      eligible.joined_at,
                      eligible.member_id
           ) as final_rank
    from eligible
  ), participants as (
    select member.challenge_id,
           count(*) filter (where member.joined_at is not null) as participant_count
    from public.challenge_members member
    where member.challenge_id in (select mine.challenge_id from mine)
    group by member.challenge_id
  )
  select
    mine.challenge_id,
    mine.name,
    mine.starts_on,
    mine.ends_on,
    mine.status::text,
    case
      when mine.status = 'left' then 'forfeited'
      when mine.status = 'removed' then 'removed'
      else 'completed'
    end,
    mine.joined_at,
    mine.withdrawn_at,
    mine.prize_eligible,
    mine.forfeiture_reason,
    coalesce(scores.total_points, 0)::integer,
    coalesce(completion.completed_tasks, 0)::integer,
    coalesce(completion.scheduled_tasks, 0)::integer,
    case when coalesce(completion.scheduled_tasks, 0) = 0 then 0::numeric
      else round(completion.completed_tasks::numeric / completion.scheduled_tasks * 100, 1)
    end,
    coalesce(scores.perfect_days, 0)::integer,
    coalesce(completion.days_participated, 0)::integer,
    case when mine.prize_eligible then ranked.final_rank else null end,
    coalesce(participants.participant_count, 0)
  from mine
  left join scores on scores.member_id = mine.member_id
  left join completion on completion.member_id = mine.member_id
  left join ranked on ranked.member_id = mine.member_id
  left join participants on participants.challenge_id = mine.challenge_id
  order by coalesce(mine.withdrawn_at, mine.ends_on::timestamptz) desc;
end;
$$;

revoke all on function public.list_my_challenge_history() from public, anon, authenticated;
grant execute on function public.list_my_challenge_history() to authenticated;

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

  select member.id, member.joined_at, member.withdrawn_at,
         member.scoring_time_zone, member.status
  into member_record
  from public.challenge_members member
  where member.challenge_id = target_challenge_id
    and member.profile_id = auth.uid();

  if member_record.id is null or member_record.joined_at is null then
    raise exception 'Challenge participation required';
  end if;

  select challenge.starts_on, challenge.ends_on, challenge.rules_version
  into challenge_record
  from public.challenges challenge
  where challenge.id = target_challenge_id;

  first_date := greatest(
    challenge_record.starts_on,
    (member_record.joined_at at time zone member_record.scoring_time_zone)::date
  );
  last_date := least(
    challenge_record.ends_on,
    (now() at time zone member_record.scoring_time_zone)::date,
    coalesce(
      (member_record.withdrawn_at at time zone member_record.scoring_time_zone)::date,
      challenge_record.ends_on
    )
  );

  if first_date > last_date then return; end if;

  insert into public.task_occurrences (
    challenge_id, member_id, task_definition_id, local_date
  )
  select target_challenge_id, member_record.id, task.id, day_value::date
  from generate_series(first_date::timestamp, last_date::timestamp, interval '1 day') day_value
  join public.task_definitions task
    on task.challenge_id = target_challenge_id
   and task.rules_version = challenge_record.rules_version
   and task.schedule ->> 'kind' = 'daily'
  on conflict on constraint task_occurrences_member_id_task_definition_id_local_date_key do nothing;

  return query
  with occurrence_totals as (
    select occurrence.local_date,
           count(*)::integer as task_count,
           count(*) filter (
             where occurrence.status in ('complete', 'pending_review')
           )::integer as completed_count,
           count(*) filter (where occurrence.status = 'missed')::integer as missed_count,
           count(*) filter (where occurrence.status = 'pending')::integer as pending_count
    from public.task_occurrences occurrence
    where occurrence.challenge_id = target_challenge_id
      and occurrence.member_id = member_record.id
      and occurrence.local_date between first_date and last_date
    group by occurrence.local_date
  ), ledger_totals as (
    select ledger.effective_date,
           coalesce(sum(ledger.points), 0)::integer as day_points
    from public.score_ledger ledger
    where ledger.challenge_id = target_challenge_id
      and ledger.member_id = member_record.id
      and ledger.effective_date between first_date and last_date
    group by ledger.effective_date
  )
  select occurrence_totals.local_date,
         occurrence_totals.task_count,
         occurrence_totals.completed_count,
         occurrence_totals.missed_count,
         occurrence_totals.pending_count,
         coalesce(ledger_totals.day_points, 0)::integer
  from occurrence_totals
  left join ledger_totals
    on ledger_totals.effective_date = occurrence_totals.local_date
  order by occurrence_totals.local_date desc;
end;
$$;

revoke all on function public.list_challenge_history(uuid) from public, anon, authenticated;
grant execute on function public.list_challenge_history(uuid) to authenticated;

comment on function public.list_my_challenge_history() is
  'Read model for completed, forfeited, and removed challenge participation with final performance.';
