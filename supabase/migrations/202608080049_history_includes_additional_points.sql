drop function if exists public.list_my_challenge_history();

create function public.list_my_challenge_history()
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
  total_points numeric,
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
  ), core_scores as (
    select ledger.member_id,
           coalesce(sum(ledger.points), 0)::integer as core_points,
           count(*) filter (where ledger.entry_type = 'perfect_day')::integer as perfect_days
    from public.score_ledger ledger
    where ledger.challenge_id in (select history.challenge_id from mine history)
    group by ledger.member_id
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
    where member.challenge_id in (select history.challenge_id from mine history)
    group by member.id
  ), scores as (
    select member.id as member_id,
      coalesce(core.core_points, 0)::integer as core_points,
      coalesce(core.perfect_days, 0)::integer as perfect_days,
      coalesce(core.core_points, 0)::numeric
        + case
            when rules.weight_bonus_calculation is null
              or values.weight_start is null or values.weight_end is null then 0::numeric
            when rules.weight_bonus_calculation = 'percentage' and values.weight_start > 0
              then round(greatest(0, (values.weight_start - values.weight_end) / values.weight_start * 100), 2)
            else round(greatest(0, values.weight_start - values.weight_end), 2)
          end
        + case
            when rules.body_fat_bonus_calculation is null
              or values.body_fat_start is null or values.body_fat_end is null then 0::numeric
            when rules.body_fat_bonus_calculation = 'percentage' and values.body_fat_start > 0
              then round(greatest(0, (values.body_fat_start - values.body_fat_end) / values.body_fat_start * 100), 2)
            else round(greatest(0, values.body_fat_start - values.body_fat_end), 2)
          end as total_score
    from public.challenge_members member
    join public.challenges challenge on challenge.id = member.challenge_id
    join public.winner_rules rules
      on rules.challenge_id = challenge.id and rules.rules_version = challenge.rules_version
    left join core_scores core on core.member_id = member.id
    left join checkpoint_values values on values.member_id = member.id
    where member.challenge_id in (select history.challenge_id from mine history)
  ), completion as (
    select occurrence.member_id,
           count(*)::integer as scheduled_tasks,
           count(*) filter (where occurrence.status in ('complete', 'pending_review'))::integer as completed_tasks,
           count(distinct occurrence.local_date)::integer as days_participated
    from public.task_occurrences occurrence
    where occurrence.challenge_id in (select history.challenge_id from mine history)
    group by occurrence.member_id
  ), eligible as (
    select
      member.challenge_id,
      member.id as member_id,
      coalesce(scores.total_score, 0::numeric) as total_score,
      case when coalesce(completion.scheduled_tasks, 0) = 0 then 0::numeric
        else round(completion.completed_tasks::numeric / completion.scheduled_tasks * 100, 1)
      end as completion_percentage,
      coalesce(scores.perfect_days, 0)::integer as perfect_days,
      member.joined_at
    from public.challenge_members member
    left join scores on scores.member_id = member.id
    left join completion on completion.member_id = member.id
    where member.challenge_id in (select history.challenge_id from mine history)
      and member.status in ('active', 'completed')
      and member.prize_eligible
  ), ranked as (
    select eligible.challenge_id,
           eligible.member_id,
           row_number() over (
             partition by eligible.challenge_id
             order by eligible.total_score desc,
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
    where member.challenge_id in (select history.challenge_id from mine history)
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
    coalesce(scores.total_score, 0::numeric),
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

comment on function public.list_my_challenge_history() is
  'Returns completed participation history using the same task and additional-point total that determines the live leaderboard.';
