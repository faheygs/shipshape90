create table public.checkin_notification_deliveries (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  checkpoint_id uuid not null references public.challenge_checkpoints(id) on delete cascade,
  notified_at timestamptz not null default now(),
  primary key (profile_id, checkpoint_id)
);

alter table public.checkin_notification_deliveries enable row level security;

comment on table public.checkin_notification_deliveries is
  'Internal idempotency ledger that prevents a due check-in reminder from being recreated after a member clears it.';

create or replace function public.persist_due_checkin_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile_id uuid;
  challenge_name text;
  checkpoint_label text;
  checkpoint_kind text;
  notification_title text;
begin
  if new.event_type <> 'progress.checkpoint_due'
     or new.topic !~ '^user:[0-9a-f-]+:notifications$' then
    return new;
  end if;

  begin
    target_profile_id := split_part(new.topic, ':', 2)::uuid;
  exception when invalid_text_representation then
    return new;
  end;

  challenge_name := coalesce(new.payload ->> 'challengeName', 'your challenge');
  checkpoint_label := coalesce(new.payload ->> 'label', 'Progress');
  checkpoint_kind := coalesce(new.payload ->> 'kind', 'milestone');
  notification_title := case checkpoint_kind
    when 'start' then 'Start check-in ready'
    when 'final' then 'Final check-in ready'
    else checkpoint_label || ' check-in ready'
  end;

  insert into public.notifications (
    profile_id, source_event_id, notification_type, title, body,
    challenge_id, action_path, payload
  ) values (
    target_profile_id,
    new.id,
    new.event_type,
    notification_title,
    'Complete your required check-in for ' || challenge_name || ' to unlock today''s tasks.',
    new.aggregate_id,
    '/challenge/' || new.aggregate_id::text,
    new.payload
  ) on conflict (source_event_id) do nothing;

  return new;
end;
$$;

revoke all on function public.persist_due_checkin_notification() from public, anon, authenticated;

drop trigger if exists persist_due_checkin_notification_after_outbox on public.domain_event_outbox;
create trigger persist_due_checkin_notification_after_outbox
after insert on public.domain_event_outbox
for each row
when (new.event_type = 'progress.checkpoint_due')
execute function public.persist_due_checkin_notification();

create or replace function public.enqueue_due_checkin_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued_count integer := 0;
begin
  with due as (
    select
      member.profile_id,
      challenge.id as challenge_id,
      challenge.name as challenge_name,
      checkpoint.id as checkpoint_id,
      checkpoint.checkpoint_kind,
      checkpoint.label,
      schedule.due_date
    from public.challenge_members member
    join public.challenges challenge
      on challenge.id = member.challenge_id
     and challenge.status = 'active'
    join public.challenge_checkpoints checkpoint
      on checkpoint.challenge_id = challenge.id
     and checkpoint.rules_version = challenge.rules_version
    cross join lateral (
      select
        greatest(
          challenge.starts_on,
          (member.joined_at at time zone member.scoring_time_zone)::date
        ) as first_date,
        (now() at time zone member.scoring_time_zone)::date as local_date
    ) member_dates
    cross join lateral (
      select case checkpoint.checkpoint_kind
        when 'start' then member_dates.first_date
        when 'final' then challenge.ends_on
        else challenge.starts_on + (checkpoint.day_number - 1)
      end as due_date
    ) schedule
    where member.status = 'active'
      and schedule.due_date <= member_dates.local_date
      and (checkpoint.checkpoint_kind <> 'milestone' or schedule.due_date >= member_dates.first_date)
      and not exists (
        select 1
        from public.body_logs log
        where log.profile_id = member.profile_id
          and log.checkpoint_id = checkpoint.id
      )
  ), claimed as (
    insert into public.checkin_notification_deliveries (profile_id, checkpoint_id)
    select due.profile_id, due.checkpoint_id
    from due
    on conflict (profile_id, checkpoint_id) do nothing
    returning profile_id, checkpoint_id
  )
  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  select
    'user:' || due.profile_id::text || ':notifications',
    'progress.checkpoint_due',
    due.challenge_id,
    jsonb_build_object(
      'version', 1,
      'challengeId', due.challenge_id,
      'challengeName', due.challenge_name,
      'profileId', due.profile_id,
      'checkpointId', due.checkpoint_id,
      'kind', due.checkpoint_kind,
      'label', due.label,
      'scheduledOn', due.due_date
    )
  from due
  join claimed
    on claimed.profile_id = due.profile_id
   and claimed.checkpoint_id = due.checkpoint_id;

  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

revoke all on function public.enqueue_due_checkin_notifications() from public, anon, authenticated;

create or replace function public.run_shipshape_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.process_challenge_lifecycle();
  perform public.enqueue_due_checkin_notifications();
end;
$$;

revoke all on function public.run_shipshape_maintenance() from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'shipshape-process-challenge-lifecycle';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'shipshape-process-challenge-lifecycle',
    '* * * * *',
    $job$select public.run_shipshape_maintenance();$job$
  );
end;
$$;

select public.enqueue_due_checkin_notifications();

comment on function public.enqueue_due_checkin_notifications() is
  'Queues one durable inbox and realtime reminder for each required check-in when it becomes due in that member''s timezone.';
