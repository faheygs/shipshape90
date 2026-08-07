create or replace function public.shipshape_perfect_day_bonus(task_count integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(task_count, 0) <= 0 then 0
    else greatest(1, round(task_count::numeric * 3 / 7)::integer)
  end;
$$;

create or replace function public.shipshape_seven_day_streak_bonus(task_count integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(task_count, 0) <= 0 then 0
    else greatest(1, round(task_count::numeric * 5 / 7)::integer)
  end;
$$;

revoke all on function public.shipshape_perfect_day_bonus(integer) from public, anon, authenticated;
revoke all on function public.shipshape_seven_day_streak_bonus(integer) from public, anon, authenticated;

create or replace function public.award_shipshape_bonuses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
  prior_streak integer;
  current_streak integer;
  daily_task_count integer;
  perfect_day_bonus_points integer;
  streak_bonus_points integer;
  profile_id_value uuid;
  activity_id_value uuid;
begin
  if new.entry_type <> 'task_complete' then return new; end if;

  if exists (
    select 1
    from public.task_occurrences occurrence
    where occurrence.challenge_id = new.challenge_id
      and occurrence.member_id = new.member_id
      and occurrence.local_date = new.effective_date
  ) and not exists (
    select 1
    from public.task_occurrences occurrence
    where occurrence.challenge_id = new.challenge_id
      and occurrence.member_id = new.member_id
      and occurrence.local_date = new.effective_date
      and occurrence.status not in ('complete', 'pending_review')
  ) then
    select count(*)::integer into daily_task_count
    from public.task_occurrences occurrence
    where occurrence.challenge_id = new.challenge_id
      and occurrence.member_id = new.member_id
      and occurrence.local_date = new.effective_date;

    perfect_day_bonus_points := public.shipshape_perfect_day_bonus(daily_task_count);
    streak_bonus_points := public.shipshape_seven_day_streak_bonus(daily_task_count);

    insert into public.score_ledger (
      challenge_id, member_id, entry_type, points, effective_date, idempotency_key, metadata
    ) values (
      new.challenge_id,
      new.member_id,
      'perfect_day',
      perfect_day_bonus_points,
      new.effective_date,
      'perfect:' || new.member_id::text || ':' || new.effective_date::text,
      jsonb_build_object('bonus', perfect_day_bonus_points, 'taskCount', daily_task_count)
    ) on conflict (idempotency_key) do nothing;

    get diagnostics inserted_count = row_count;
    if inserted_count = 0 then return new; end if;

    select member.profile_id into profile_id_value
    from public.challenge_members member
    where member.id = new.member_id;

    insert into public.activity_entries (
      challenge_id, actor_profile_id, event_type, visibility, metadata
    ) values (
      new.challenge_id,
      profile_id_value,
      'perfect_day',
      'challenge',
      jsonb_build_object('points', perfect_day_bonus_points, 'date', new.effective_date, 'taskCount', daily_task_count)
    ) returning id into activity_id_value;

    insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
    values (
      'challenge:' || new.challenge_id::text || ':activity',
      'score.perfect_day',
      new.challenge_id,
      jsonb_build_object(
        'version', 1,
        'challengeId', new.challenge_id,
        'memberId', new.member_id,
        'profileId', profile_id_value,
        'activityId', activity_id_value,
        'points', perfect_day_bonus_points,
        'taskCount', daily_task_count,
        'date', new.effective_date
      )
    );

    select count(*)::integer into prior_streak
    from (
      select
        ledger.effective_date,
        row_number() over (order by ledger.effective_date desc)::integer as day_offset
      from public.score_ledger ledger
      where ledger.challenge_id = new.challenge_id
        and ledger.member_id = new.member_id
        and ledger.entry_type = 'perfect_day'
        and ledger.effective_date < new.effective_date
    ) previous_days
    where previous_days.effective_date = new.effective_date - previous_days.day_offset;

    current_streak := prior_streak + 1;
    if current_streak % 7 = 0 then
      insert into public.score_ledger (
        challenge_id, member_id, entry_type, points, effective_date, idempotency_key, metadata
      ) values (
        new.challenge_id,
        new.member_id,
        'streak_bonus',
        streak_bonus_points,
        new.effective_date,
        'streak:' || new.member_id::text || ':' || new.effective_date::text || ':' || current_streak::text,
        jsonb_build_object('points', streak_bonus_points, 'streak', current_streak, 'taskCount', daily_task_count)
      ) on conflict (idempotency_key) do nothing;

      get diagnostics inserted_count = row_count;
      if inserted_count > 0 then
        insert into public.activity_entries (
          challenge_id, actor_profile_id, event_type, visibility, metadata
        ) values (
          new.challenge_id,
          profile_id_value,
          'streak',
          'challenge',
          jsonb_build_object('points', streak_bonus_points, 'streak', current_streak, 'taskCount', daily_task_count)
        ) returning id into activity_id_value;

        insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
        values (
          'challenge:' || new.challenge_id::text || ':activity',
          'score.streak_bonus',
          new.challenge_id,
          jsonb_build_object(
            'version', 1,
            'challengeId', new.challenge_id,
            'memberId', new.member_id,
            'profileId', profile_id_value,
            'activityId', activity_id_value,
            'points', streak_bonus_points,
            'streak', current_streak,
            'taskCount', daily_task_count
          )
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- Bring existing bonus ledger entries onto the same dynamic formula so old
-- totals and new totals cannot disagree.
with bonus_values as (
  select
    ledger.id,
    ledger.entry_type,
    count(occurrence.id)::integer as task_count
  from public.score_ledger ledger
  join public.task_occurrences occurrence
    on occurrence.challenge_id = ledger.challenge_id
   and occurrence.member_id = ledger.member_id
   and occurrence.local_date = ledger.effective_date
  where ledger.entry_type in ('perfect_day', 'streak_bonus')
  group by ledger.id, ledger.entry_type
), prepared as (
  select
    bonus_values.id,
    bonus_values.task_count,
    case
      when bonus_values.entry_type = 'perfect_day'
        then public.shipshape_perfect_day_bonus(bonus_values.task_count)
      else public.shipshape_seven_day_streak_bonus(bonus_values.task_count)
    end as points
  from bonus_values
)
update public.score_ledger ledger
set
  points = prepared.points,
  metadata = ledger.metadata || jsonb_build_object(
    'points', prepared.points,
    'bonus', prepared.points,
    'taskCount', prepared.task_count
  )
from prepared
where ledger.id = prepared.id
  and ledger.points <> prepared.points;

insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
select distinct
  'challenge:' || challenge.id::text || ':activity',
  'score.rules_scaled',
  challenge.id,
  jsonb_build_object('version', 1, 'challengeId', challenge.id)
from public.challenges challenge
where exists (
  select 1 from public.challenge_members member
  where member.challenge_id = challenge.id
    and member.status in ('active', 'completed')
);

comment on function public.shipshape_perfect_day_bonus(integer) is
  'Scales the original +3 perfect-day bonus at a 3/7 ratio, rounded to a minimum of one point.';

comment on function public.shipshape_seven_day_streak_bonus(integer) is
  'Scales the original +5 seven-day streak bonus at a 5/7 ratio, rounded to a minimum of one point.';
