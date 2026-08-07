alter table public.winner_rules
  drop constraint if exists winner_rules_primary_metric_check;

alter table public.winner_rules
  add constraint winner_rules_primary_metric_check check (
    primary_metric in (
      'total_points',
      'completion_percentage',
      'perfect_days',
      'target_reached_at',
      'team_total',
      'team_average',
      'body_fat_change',
      'weight_change'
    )
  );

create table public.challenge_measurements (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  member_id uuid not null references public.challenge_members(id) on delete cascade,
  metric text not null check (metric in ('body_fat_change', 'weight_change')),
  value numeric not null check (value > 0),
  measured_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (challenge_id, member_id, metric, measured_on)
);

create index challenge_measurements_member_metric_idx
  on public.challenge_measurements(challenge_id, member_id, metric, measured_on, created_at);

alter table public.challenge_measurements enable row level security;

create policy "members read own challenge measurements"
on public.challenge_measurements for select to authenticated using (
  exists (
    select 1 from public.challenge_members member
    where member.id = member_id
      and member.profile_id = auth.uid()
      and member.challenge_id = challenge_id
  )
);

create policy "members manage own challenge measurements"
on public.challenge_measurements for all to authenticated using (
  exists (
    select 1 from public.challenge_members member
    where member.id = member_id
      and member.profile_id = auth.uid()
      and member.challenge_id = challenge_id
      and member.status in ('active', 'completed')
  )
) with check (
  exists (
    select 1 from public.challenge_members member
    where member.id = member_id
      and member.profile_id = auth.uid()
      and member.challenge_id = challenge_id
      and member.status in ('active', 'completed')
  )
);

grant select, insert, update on public.challenge_measurements to authenticated;

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
    insert into public.score_ledger (
      challenge_id, member_id, entry_type, points, effective_date, idempotency_key, metadata
    ) values (
      new.challenge_id,
      new.member_id,
      'perfect_day',
      3,
      new.effective_date,
      'perfect:' || new.member_id::text || ':' || new.effective_date::text,
      jsonb_build_object('bonus', 3)
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
      jsonb_build_object('points', 3, 'date', new.effective_date)
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
        'points', 3,
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
        5,
        new.effective_date,
        'streak:' || new.member_id::text || ':' || new.effective_date::text || ':' || current_streak::text,
        jsonb_build_object('points', 5, 'streak', current_streak)
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
          jsonb_build_object('points', 5, 'streak', current_streak)
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
            'points', 5,
            'streak', current_streak
          )
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists award_shipshape_bonuses_after_task on public.score_ledger;
create trigger award_shipshape_bonuses_after_task
after insert on public.score_ledger
for each row execute function public.award_shipshape_bonuses();

create or replace function public.record_challenge_measurement(
  target_challenge_id uuid,
  measurement_value numeric,
  measurement_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_member_id uuid;
  target_metric text;
  measurement_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select member.id into target_member_id
  from public.challenge_members member
  where member.challenge_id = target_challenge_id
    and member.profile_id = auth.uid()
    and member.status in ('active', 'completed');

  if target_member_id is null then raise exception 'Active membership required'; end if;

  select rules.primary_metric into target_metric
  from public.challenges challenge
  join public.winner_rules rules
    on rules.challenge_id = challenge.id
   and rules.rules_version = challenge.rules_version
  where challenge.id = target_challenge_id;

  if target_metric not in ('body_fat_change', 'weight_change') then
    raise exception 'This challenge is scored with ShipShape Score';
  end if;
  if measurement_value <= 0 then raise exception 'Measurement must be greater than zero'; end if;
  if target_metric = 'body_fat_change' and measurement_value > 75 then
    raise exception 'Body-fat percentage must be 75 or less';
  end if;
  if target_metric = 'weight_change' and measurement_value > 1500 then
    raise exception 'Weight must be 1500 or less';
  end if;

  insert into public.challenge_measurements (
    challenge_id, member_id, metric, value, measured_on
  ) values (
    target_challenge_id, target_member_id, target_metric, measurement_value, measurement_date
  )
  on conflict (challenge_id, member_id, metric, measured_on)
  do update set value = excluded.value, updated_at = now()
  returning id into measurement_id;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'challenge:' || target_challenge_id::text || ':activity',
    'score.measurement_updated',
    target_challenge_id,
    jsonb_build_object(
      'version', 1,
      'challengeId', target_challenge_id,
      'memberId', target_member_id,
      'profileId', auth.uid(),
      'metric', target_metric
    )
  );

  return measurement_id;
end;
$$;

revoke all on function public.record_challenge_measurement(uuid, numeric, date) from public, anon, authenticated;
grant execute on function public.record_challenge_measurement(uuid, numeric, date) to authenticated;

drop function if exists public.create_challenge_draft(
  text, text, public.challenge_visibility, text, date, date, text, text, jsonb
);

create function public.create_challenge_draft(
  challenge_name text,
  challenge_description text,
  challenge_visibility public.challenge_visibility,
  challenge_join_policy text,
  challenge_starts_on date,
  challenge_ends_on date,
  challenge_reward text,
  challenge_scoring_method text,
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
  if challenge_reward not in ('Bragging rights', 'Prize') then
    raise exception 'Winner reward must be Bragging rights or Prize';
  end if;
  if challenge_scoring_method not in ('total_points', 'body_fat_change', 'weight_change') then
    raise exception 'Invalid scoring method';
  end if;

  created_challenge_id := public.create_challenge_draft(
    challenge_name,
    challenge_description,
    challenge_visibility,
    challenge_join_policy,
    challenge_starts_on,
    challenge_ends_on,
    challenge_reward,
    configured_tasks
  );

  update public.winner_rules
  set primary_metric = challenge_scoring_method,
      tie_breakers = case
        when challenge_scoring_method = 'total_points'
          then '["completion_percentage","perfect_days"]'::jsonb
        else '["completion_percentage","total_points"]'::jsonb
      end
  where challenge_id = created_challenge_id
    and rules_version = 1;

  return created_challenge_id;
end;
$$;

revoke all on function public.create_challenge_draft(
  text, text, public.challenge_visibility, text, date, date, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.create_challenge_draft(
  text, text, public.challenge_visibility, text, date, date, text, text, jsonb
) to authenticated;

comment on function public.create_challenge_draft(
  text, text, public.challenge_visibility, text, date, date, text, text, jsonb
) is 'Creates a configured challenge with a fixed reward type and explicit scoring method.';

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
  scoring_method text
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
    coalesce(rules.primary_metric, 'total_points') as scoring_method
  from public.challenges challenge
  left join public.challenge_members member on member.challenge_id = challenge.id
  left join public.challenge_members mine on mine.challenge_id = challenge.id and mine.profile_id = auth.uid()
  left join public.winner_rules rules
    on rules.challenge_id = challenge.id
   and rules.rules_version = challenge.rules_version
  where challenge.visibility = 'public'
     or challenge.owner_id = auth.uid()
     or mine.id is not null
  group by challenge.id, rules.primary_metric
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
  scoring_method text
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
    coalesce(rules.primary_metric, 'total_points') as scoring_method
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
  group by challenge.id, rules.primary_metric;
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
    select coalesce(rules.primary_metric, 'total_points') as metric
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
  ), measurement_arrays as (
    select
      measurement.member_id,
      (array_agg(measurement.value order by measurement.measured_on, measurement.created_at))[1] as baseline_value,
      (array_agg(measurement.value order by measurement.measured_on desc, measurement.created_at desc))[1] as latest_value
    from public.challenge_measurements measurement
    cross join selected_rule
    where measurement.challenge_id = target_challenge_id
      and measurement.metric = selected_rule.metric
    group by measurement.member_id
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
      selected_rule.metric as scoring_method,
      case
        when selected_rule.metric = 'body_fat_change'
          then round(coalesce(measurement_arrays.baseline_value - measurement_arrays.latest_value, 0), 2)
        when selected_rule.metric = 'weight_change' and measurement_arrays.baseline_value > 0
          then round(coalesce((measurement_arrays.baseline_value - measurement_arrays.latest_value) / measurement_arrays.baseline_value * 100, 0), 2)
        else coalesce(scores.total_points, 0)::numeric
      end as outcome_value,
      measurement_arrays.baseline_value,
      measurement_arrays.latest_value,
      member.profile_id = auth.uid() as is_current_user,
      member.joined_at
    from public.challenge_members member
    join public.profiles profile on profile.id = member.profile_id
    cross join selected_rule
    left join scores on scores.member_id = member.id
    left join completion on completion.member_id = member.id
    left join measurement_arrays on measurement_arrays.member_id = member.id
    where member.challenge_id = target_challenge_id
      and member.status in ('active', 'completed')
  ), ranked as (
    select
      row_number() over (
        order by prepared.outcome_value desc,
          prepared.completion_percentage desc,
          prepared.total_points desc,
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
    ranked.scoring_method,
    ranked.outcome_value,
    ranked.baseline_value,
    ranked.latest_value,
    ranked.is_current_user
  from ranked
  order by ranked.rank;
end;
$$;

revoke all on function public.list_challenge_leaderboard(uuid) from public, anon, authenticated;
grant execute on function public.list_challenge_leaderboard(uuid) to authenticated;
