-- Keep the challenge feed focused on meaningful milestones and publish completed
-- progress check-ins to every connected participant in real time.

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
    'day_submitted',
    'checkin_completed'
  ));

create or replace function public.publish_completed_checkin_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  checkpoint_label text;
begin
  select checkpoint.label
  into checkpoint_label
  from public.challenge_checkpoints checkpoint
  where checkpoint.id = new.checkpoint_id;

  insert into public.activity_entries (
    challenge_id, actor_profile_id, event_type, visibility, metadata
  ) values (
    new.challenge_id,
    new.profile_id,
    'checkin_completed',
    'challenge',
    jsonb_build_object(
      'checkpointId', new.checkpoint_id,
      'bodyLogId', new.id,
      'label', coalesce(checkpoint_label, 'a check-in')
    )
  );

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'challenge:' || new.challenge_id::text || ':activity',
    'progress.checkpoint_completed',
    new.challenge_id,
    jsonb_build_object(
      'version', 1,
      'challengeId', new.challenge_id,
      'profileId', new.profile_id,
      'checkpointId', new.checkpoint_id,
      'bodyLogId', new.id,
      'label', coalesce(checkpoint_label, 'a check-in')
    )
  );

  return new;
end;
$$;

drop trigger if exists publish_completed_checkin_activity_trigger on public.body_logs;
create trigger publish_completed_checkin_activity_trigger
after insert on public.body_logs
for each row execute function public.publish_completed_checkin_activity();

insert into public.activity_entries (
  challenge_id, actor_profile_id, event_type, visibility, metadata, created_at
)
select
  log.challenge_id,
  log.profile_id,
  'checkin_completed',
  'challenge',
  jsonb_build_object(
    'checkpointId', log.checkpoint_id,
    'bodyLogId', log.id,
    'label', coalesce(checkpoint.label, 'a check-in')
  ),
  log.created_at
from public.body_logs log
left join public.challenge_checkpoints checkpoint on checkpoint.id = log.checkpoint_id
where log.checkpoint_id is not null
  and not exists (
    select 1
    from public.activity_entries activity
    where activity.event_type = 'checkin_completed'
      and activity.metadata ->> 'bodyLogId' = log.id::text
  );

revoke all on function public.publish_completed_checkin_activity() from public, anon, authenticated;

comment on function public.publish_completed_checkin_activity() is
  'Publishes one high-level challenge activity event when a required progress check-in is first completed.';
