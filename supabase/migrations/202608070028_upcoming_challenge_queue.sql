create table public.challenge_join_queue (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  scoring_time_zone text not null,
  allow_auto_switch boolean not null default false,
  status text not null default 'queued'
    check (status in ('queued', 'blocked', 'joined', 'failed')),
  queued_at timestamptz not null default now(),
  processed_at timestamptz,
  failure_reason text,
  primary key (profile_id, challenge_id)
);

alter table public.challenge_join_queue enable row level security;

create policy "users read their challenge queue"
on public.challenge_join_queue for select to authenticated
using (profile_id = auth.uid());

grant select on public.challenge_join_queue to authenticated;

create or replace function public.prevent_early_challenge_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_start date;
  member_time_zone text;
begin
  if new.role <> 'participant' or new.status not in ('pending', 'active') then
    return new;
  end if;

  select challenge.starts_on
  into challenge_start
  from public.challenges challenge
  where challenge.id = new.challenge_id;

  select coalesce(
    (
      select profile.time_zone
      from public.profiles profile
      where profile.id = new.profile_id
        and exists (
          select 1 from pg_catalog.pg_timezone_names zone
          where zone.name = profile.time_zone
        )
    ),
    'UTC'
  ) into member_time_zone;

  if (now() at time zone member_time_zone)::date < challenge_start then
    raise exception 'This challenge has not started in your timezone. Queue it instead.';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_early_challenge_membership() from public, anon, authenticated;

drop trigger if exists prevent_early_challenge_membership on public.challenge_members;
create trigger prevent_early_challenge_membership
before insert on public.challenge_members
for each row execute function public.prevent_early_challenge_membership();

create or replace function public.set_challenge_queued(
  target_challenge_id uuid,
  should_queue boolean,
  allow_switch_at_start boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_record record;
  member_time_zone text;
  member_local_date date;
  current_challenge_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if not should_queue then
    delete from public.challenge_join_queue queue
    where queue.profile_id = auth.uid()
      and queue.challenge_id = target_challenge_id
      and queue.status in ('queued', 'blocked');
    return false;
  end if;

  select coalesce(
    (
      select profile.time_zone
      from public.profiles profile
      where profile.id = auth.uid()
        and exists (
          select 1 from pg_catalog.pg_timezone_names zone
          where zone.name = profile.time_zone
        )
    ),
    'UTC'
  ) into member_time_zone;

  if not exists (select 1 from public.profiles profile where profile.id = auth.uid()) then
    raise exception 'Complete your profile before joining the queue';
  end if;

  member_local_date := (now() at time zone member_time_zone)::date;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select challenge.* into challenge_record
  from public.challenges challenge
  where challenge.id = target_challenge_id
  for update;

  if not found or challenge_record.visibility <> 'public' then
    raise exception 'Challenge not found';
  end if;
  if challenge_record.status <> 'registration' then
    raise exception 'Challenge is not accepting queued members';
  end if;
  if member_local_date >= challenge_record.starts_on then
    raise exception 'This challenge has already started in your timezone';
  end if;
  if challenge_record.registration_closes_at is not null
     and challenge_record.registration_closes_at <= now() then
    raise exception 'Challenge registration is closed';
  end if;
  if challenge_record.join_policy = 'invite_only' then
    raise exception 'Invite-only challenges cannot be auto-joined';
  end if;
  if exists (
    select 1 from public.challenge_members member
    where member.profile_id = auth.uid()
      and member.challenge_id = target_challenge_id
  ) then
    raise exception 'You already have a membership history for this challenge';
  end if;

  select member.challenge_id into current_challenge_id
  from public.challenge_members member
  where member.profile_id = auth.uid()
    and member.status in ('pending', 'active')
  limit 1;

  if current_challenge_id is not null and not allow_switch_at_start then
    raise exception 'Confirm that this queue may replace your current challenge when it starts';
  end if;

  if challenge_record.participant_limit is not null and (
    (select count(*) from public.challenge_members member
      where member.challenge_id = target_challenge_id
        and member.status in ('pending', 'active'))
    +
    (select count(*) from public.challenge_join_queue queue
      where queue.challenge_id = target_challenge_id
        and queue.status in ('queued', 'blocked')
        and queue.profile_id <> auth.uid())
  ) >= challenge_record.participant_limit then
    raise exception 'Challenge is full';
  end if;

  insert into public.challenge_join_queue (
    profile_id, challenge_id, scoring_time_zone, allow_auto_switch,
    status, queued_at, processed_at, failure_reason
  ) values (
    auth.uid(), target_challenge_id, member_time_zone, allow_switch_at_start,
    'queued', now(), null, null
  )
  on conflict (profile_id, challenge_id) do update
  set scoring_time_zone = excluded.scoring_time_zone,
      allow_auto_switch = excluded.allow_auto_switch,
      status = 'queued',
      queued_at = now(),
      processed_at = null,
      failure_reason = null;

  insert into public.challenge_saves (profile_id, challenge_id)
  values (auth.uid(), target_challenge_id)
  on conflict (profile_id, challenge_id) do nothing;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'user:' || auth.uid()::text || ':notifications',
    'challenge.queue_added',
    target_challenge_id,
    jsonb_build_object(
      'version', 1,
      'profileId', auth.uid(),
      'challengeId', target_challenge_id,
      'startsOn', challenge_record.starts_on,
      'scoringTimeZone', member_time_zone,
      'allowAutoSwitch', allow_switch_at_start
    )
  );

  return true;
end;
$$;

revoke all on function public.set_challenge_queued(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.set_challenge_queued(uuid, boolean, boolean) to authenticated;

create or replace function public.process_due_challenge_queues()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued record;
  current_membership record;
  target_membership record;
  created_member_id uuid;
  created_status public.member_status;
  processed_count integer := 0;
begin
  for queued in
    select queue.*, challenge.name, challenge.status as challenge_status,
           challenge.starts_on, challenge.ends_on, challenge.join_policy,
           challenge.registration_closes_at, challenge.participant_limit
    from public.challenge_join_queue queue
    join public.challenges challenge on challenge.id = queue.challenge_id
    where queue.status in ('queued', 'blocked')
      and (now() at time zone queue.scoring_time_zone)::date >= challenge.starts_on
    order by queue.queued_at
    for update of queue skip locked
    limit 200
  loop
    begin
      perform pg_advisory_xact_lock(hashtext(queued.profile_id::text));
      current_membership := null;
      target_membership := null;

      if (now() at time zone queued.scoring_time_zone)::date > queued.ends_on then
        raise exception 'Challenge ended before the queue could be processed';
      end if;
      if queued.challenge_status not in ('registration', 'active') then
        raise exception 'Challenge is not accepting members';
      end if;

      select member.id, member.status into target_membership
      from public.challenge_members member
      where member.profile_id = queued.profile_id
        and member.challenge_id = queued.challenge_id;

      if target_membership.id is not null then
        if target_membership.status in ('pending', 'active') then
          update public.challenge_join_queue queue
          set status = 'joined', processed_at = now(), failure_reason = null
          where queue.profile_id = queued.profile_id
            and queue.challenge_id = queued.challenge_id;
          processed_count := processed_count + 1;
          continue;
        end if;
        raise exception 'This member cannot rejoin the challenge';
      end if;

      select member.id, member.challenge_id, challenge.name
      into current_membership
      from public.challenge_members member
      join public.challenges challenge on challenge.id = member.challenge_id
      where member.profile_id = queued.profile_id
        and member.status in ('pending', 'active')
      order by member.created_at
      limit 1
      for update of member;

      if current_membership.id is not null and not queued.allow_auto_switch then
        if queued.status <> 'blocked' then
          update public.challenge_join_queue queue
          set status = 'blocked', failure_reason = 'active_challenge_requires_confirmation'
          where queue.profile_id = queued.profile_id
            and queue.challenge_id = queued.challenge_id;

          insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
          values (
            'user:' || queued.profile_id::text || ':notifications',
            'challenge.queue_blocked',
            queued.challenge_id,
            jsonb_build_object(
              'version', 1,
              'profileId', queued.profile_id,
              'challengeId', queued.challenge_id,
              'challengeName', queued.name,
              'currentChallengeId', current_membership.challenge_id,
              'currentChallengeName', current_membership.name
            )
          );
        end if;
        continue;
      end if;

      if queued.participant_limit is not null and (
        select count(*) from public.challenge_members member
        where member.challenge_id = queued.challenge_id
          and member.status in ('pending', 'active')
      ) >= queued.participant_limit then
        raise exception 'Challenge is full';
      end if;

      if current_membership.id is not null then
        update public.challenge_members member
        set status = 'left',
            prize_eligible = false,
            withdrawn_at = now(),
            forfeiture_reason = 'queued_challenge_started'
        where member.id = current_membership.id;

        insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
        values (
          'challenge:' || current_membership.challenge_id::text || ':activity',
          'member.withdrawn',
          current_membership.challenge_id,
          jsonb_build_object(
            'version', 1,
            'challengeId', current_membership.challenge_id,
            'memberId', current_membership.id,
            'profileId', queued.profile_id,
            'reason', 'queued_challenge_started',
            'prizeEligible', false
          )
        );
      end if;

      created_status := case
        when queued.join_policy = 'approval'
          then 'pending'::public.member_status
        else 'active'::public.member_status
      end;

      insert into public.challenge_members (
        challenge_id, profile_id, role, status, joined_at, prize_eligible
      ) values (
        queued.challenge_id,
        queued.profile_id,
        'participant',
        created_status,
        case when created_status = 'active' then now() else null end,
        true
      ) returning id into created_member_id;

      if created_status = 'active' then
        insert into public.activity_entries (
          challenge_id, actor_profile_id, event_type, visibility, metadata
        ) values (
          queued.challenge_id,
          queued.profile_id,
          'member_joined',
          'challenge',
          jsonb_build_object(
            'memberId', created_member_id,
            'scoringTimeZone', queued.scoring_time_zone,
            'source', 'challenge_queue'
          )
        );
      end if;

      update public.challenge_join_queue queue
      set status = 'joined', processed_at = now(), failure_reason = null
      where queue.profile_id = queued.profile_id
        and queue.challenge_id = queued.challenge_id;

      insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
      values
      (
        'challenge:' || queued.challenge_id::text || ':activity',
        case when created_status = 'active' then 'member.joined' else 'member.requested' end,
        queued.challenge_id,
        jsonb_build_object(
          'version', 1,
          'challengeId', queued.challenge_id,
          'memberId', created_member_id,
          'profileId', queued.profile_id,
          'status', created_status,
          'scoringTimeZone', queued.scoring_time_zone,
          'source', 'challenge_queue'
        )
      ),
      (
        'user:' || queued.profile_id::text || ':notifications',
        'challenge.queue_joined',
        queued.challenge_id,
        jsonb_build_object(
          'version', 1,
          'challengeId', queued.challenge_id,
          'challengeName', queued.name,
          'memberId', created_member_id,
          'profileId', queued.profile_id,
          'status', created_status
        )
      );

      processed_count := processed_count + 1;
    exception when others then
      update public.challenge_join_queue queue
      set status = 'failed', processed_at = now(), failure_reason = sqlerrm
      where queue.profile_id = queued.profile_id
        and queue.challenge_id = queued.challenge_id;

      insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
      values (
        'user:' || queued.profile_id::text || ':notifications',
        'challenge.queue_failed',
        queued.challenge_id,
        jsonb_build_object(
          'version', 1,
          'challengeId', queued.challenge_id,
          'challengeName', queued.name,
          'profileId', queued.profile_id,
          'reason', sqlerrm
        )
      );
    end;
  end loop;

  return processed_count;
end;
$$;

revoke all on function public.process_due_challenge_queues() from public, anon, authenticated;

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
  bonus_calculation text,
  is_saved boolean,
  is_queued boolean,
  queue_status text
)
language sql
stable
security definer
set search_path = ''
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
    count(member.id) filter (
      where member.status in ('pending', 'active', 'completed')
    ) as participant_count,
    coalesce(max(mine.status::text), 'none') as membership_status,
    challenge.cover_path,
    challenge.prize_description,
    'total_points'::text as scoring_method,
    coalesce(rules.bonus_metric, 'none') as bonus_metric,
    rules.bonus_calculation,
    bool_or(saved.profile_id is not null) as is_saved,
    bool_or(my_queue.status in ('queued', 'blocked')) as is_queued,
    max(my_queue.status) as queue_status
  from public.challenges challenge
  left join public.challenge_members member
    on member.challenge_id = challenge.id
  left join public.challenge_members mine
    on mine.challenge_id = challenge.id
   and mine.profile_id = auth.uid()
  left join public.winner_rules rules
    on rules.challenge_id = challenge.id
   and rules.rules_version = challenge.rules_version
  left join public.challenge_saves saved
    on saved.challenge_id = challenge.id
   and saved.profile_id = auth.uid()
  left join public.challenge_join_queue my_queue
    on my_queue.challenge_id = challenge.id
   and my_queue.profile_id = auth.uid()
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

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'shipshape-process-challenge-queues';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'shipshape-process-challenge-queues',
    '5 seconds',
    $job$select public.process_due_challenge_queues();$job$
  );
end;
$$;

comment on table public.challenge_join_queue is
  'Explicit future enrollment intent, locked to the member timezone captured when queued.';
comment on function public.process_due_challenge_queues() is
  'Auto-enrolls queued members within five seconds of their local challenge start boundary.';
