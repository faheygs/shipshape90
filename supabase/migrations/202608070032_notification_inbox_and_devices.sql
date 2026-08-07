create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  source_event_id uuid unique references public.domain_event_outbox(id) on delete set null,
  notification_type text not null,
  title text not null,
  body text not null,
  challenge_id uuid references public.challenges(id) on delete set null,
  action_path text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_profile_created_idx
  on public.notifications(profile_id, created_at desc);
create index notifications_profile_unread_idx
  on public.notifications(profile_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

create policy "members read own notifications"
on public.notifications for select to authenticated
using (profile_id = auth.uid());

create policy "members update own notifications"
on public.notifications for update to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

grant select, update on public.notifications to authenticated;

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_devices_profile_enabled_idx
  on public.push_devices(profile_id)
  where enabled;

alter table public.push_devices enable row level security;

create policy "members read own push devices"
on public.push_devices for select to authenticated
using (profile_id = auth.uid());

revoke all on public.push_devices from anon, authenticated;
grant select on public.push_devices to authenticated;

create or replace function public.register_push_device(
  submitted_token text,
  submitted_platform text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  device_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if submitted_platform not in ('ios', 'android') then raise exception 'Unsupported device platform'; end if;
  if submitted_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' then
    raise exception 'Invalid Expo push token';
  end if;

  insert into public.push_devices (profile_id, expo_push_token, platform)
  values (auth.uid(), submitted_token, submitted_platform)
  on conflict (expo_push_token) do update
  set profile_id = auth.uid(),
      platform = excluded.platform,
      enabled = true,
      last_seen_at = now(),
      updated_at = now()
  returning id into device_id;

  return device_id;
end;
$$;

create or replace function public.disable_push_device(submitted_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.push_devices device
  set enabled = false, updated_at = now()
  where device.profile_id = auth.uid()
    and device.expo_push_token = submitted_token;
  return found;
end;
$$;

create or replace function public.list_my_notifications(page_size integer default 50)
returns table (
  id uuid,
  notification_type text,
  title text,
  body text,
  challenge_id uuid,
  action_path text,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select notification.id, notification.notification_type, notification.title,
         notification.body, notification.challenge_id, notification.action_path,
         notification.payload, notification.read_at, notification.created_at
  from public.notifications notification
  where notification.profile_id = auth.uid()
  order by notification.created_at desc
  limit least(greatest(coalesce(page_size, 50), 1), 100);
$$;

create or replace function public.get_my_notification_unread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.notifications notification
  where notification.profile_id = auth.uid()
    and notification.read_at is null;
$$;

create or replace function public.mark_notification_read(target_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.notifications notification
  set read_at = coalesce(notification.read_at, now())
  where notification.id = target_notification_id
    and notification.profile_id = auth.uid();
  return found;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  marked_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.notifications notification
  set read_at = now()
  where notification.profile_id = auth.uid()
    and notification.read_at is null;
  get diagnostics marked_count = row_count;
  return marked_count;
end;
$$;

create or replace function public.persist_user_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile_id uuid;
  challenge_name text;
  notification_title text;
  notification_body text;
  notification_path text;
begin
  if new.topic !~ '^user:[0-9a-f-]+:notifications$' then return new; end if;
  if new.event_type not in (
    'challenge.join_requested',
    'challenge.request_approved',
    'challenge.request_declined',
    'challenge.member_removed',
    'challenge.queue_blocked',
    'challenge.queue_joined',
    'challenge.queue_failed',
    'challenge.started',
    'challenge.cancelled',
    'challenge.ended'
  ) then return new; end if;

  begin
    target_profile_id := split_part(new.topic, ':', 2)::uuid;
  exception when invalid_text_representation then
    return new;
  end;

  select challenge.name into challenge_name
  from public.challenges challenge
  where challenge.id = new.aggregate_id;
  challenge_name := coalesce(new.payload ->> 'challengeName', challenge_name, 'your challenge');

  case new.event_type
    when 'challenge.join_requested' then
      notification_title := 'New join request';
      notification_body := coalesce(new.payload ->> 'applicantName', 'Someone') || ' wants to join ' || challenge_name || '.';
      notification_path := '/manage-challenge/' || new.aggregate_id::text || '?section=requests';
    when 'challenge.request_approved' then
      notification_title := 'You’re in';
      notification_body := 'Your request to join ' || challenge_name || ' was approved.';
      notification_path := '/challenge/' || new.aggregate_id::text;
    when 'challenge.request_declined' then
      notification_title := 'Request declined';
      notification_body := 'Your request to join ' || challenge_name || ' was not approved.';
      notification_path := '/challenge-detail/' || new.aggregate_id::text;
    when 'challenge.member_removed' then
      notification_title := 'Removed from challenge';
      notification_body := 'The host removed you from ' || challenge_name || '.';
      notification_path := '/history';
    when 'challenge.queue_blocked' then
      notification_title := 'Your next challenge needs a choice';
      notification_body := challenge_name || ' started, but your current challenge is still active.';
      notification_path := '/challenge-detail/' || new.aggregate_id::text;
    when 'challenge.queue_joined' then
      notification_title := 'Your challenge is ready';
      notification_body := 'You joined ' || challenge_name || '. Your first day is open.';
      notification_path := '/challenge/' || new.aggregate_id::text;
    when 'challenge.queue_failed' then
      notification_title := 'Couldn’t join queued challenge';
      notification_body := coalesce(new.payload ->> 'reason', challenge_name || ' could not be joined automatically.');
      notification_path := '/challenge-detail/' || new.aggregate_id::text;
    when 'challenge.started' then
      notification_title := 'Challenge started';
      notification_body := challenge_name || ' is live. Own today.';
      notification_path := '/challenge/' || new.aggregate_id::text;
    when 'challenge.cancelled' then
      notification_title := 'Challenge cancelled';
      notification_body := challenge_name || ' was cancelled by the host.';
      notification_path := '/history';
    when 'challenge.ended' then
      notification_title := 'Challenge ended';
      notification_body := challenge_name || ' was ended by the host. Your result is ready.';
      notification_path := '/history/' || new.aggregate_id::text;
  end case;

  insert into public.notifications (
    profile_id, source_event_id, notification_type, title, body,
    challenge_id, action_path, payload
  ) values (
    target_profile_id, new.id, new.event_type, notification_title,
    notification_body, new.aggregate_id, notification_path, new.payload
  ) on conflict (source_event_id) do nothing;

  return new;
end;
$$;

drop trigger if exists persist_user_notification_after_outbox on public.domain_event_outbox;
create trigger persist_user_notification_after_outbox
after insert on public.domain_event_outbox
for each row execute function public.persist_user_notification();

create or replace function public.notify_private_join_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_record record;
  applicant_record record;
begin
  if new.role <> 'participant' or new.status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'pending' then return new; end if;

  select challenge.owner_id, challenge.name, challenge.visibility
  into challenge_record
  from public.challenges challenge
  where challenge.id = new.challenge_id;

  if challenge_record.visibility <> 'private' then return new; end if;

  select profile.display_name, profile.handle into applicant_record
  from public.profiles profile
  where profile.id = new.profile_id;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'user:' || challenge_record.owner_id::text || ':notifications',
    'challenge.join_requested',
    new.challenge_id,
    jsonb_build_object(
      'version', 1,
      'challengeId', new.challenge_id,
      'challengeName', challenge_record.name,
      'memberId', new.id,
      'profileId', new.profile_id,
      'applicantName', applicant_record.display_name,
      'applicantHandle', applicant_record.handle
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_private_join_request_after_member on public.challenge_members;
create trigger notify_private_join_request_after_member
after insert or update of status on public.challenge_members
for each row execute function public.notify_private_join_request();

create or replace function public.notify_challenge_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_record record;
  lifecycle_event text;
begin
  if new.status = old.status then return new; end if;
  lifecycle_event := case
    when new.status = 'active' then 'challenge.started'
    when new.status = 'complete' then 'challenge.ended'
    when new.status = 'archived' then 'challenge.cancelled'
    else null
  end;
  if lifecycle_event is null then return new; end if;

  for member_record in
    select distinct audience.profile_id
    from (
      select member.profile_id
      from public.challenge_members member
      where member.challenge_id = new.id
        and member.status in ('pending', 'active', 'completed')
      union all
      select queue.profile_id
      from public.challenge_join_queue queue
      where queue.challenge_id = new.id
        and queue.status in ('queued', 'blocked')
    ) audience
    where audience.profile_id <> new.owner_id
  loop
    insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
    values (
      'user:' || member_record.profile_id::text || ':notifications',
      lifecycle_event,
      new.id,
      jsonb_build_object('version', 1, 'challengeId', new.id, 'challengeName', new.name, 'status', new.status)
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_challenge_lifecycle_after_status on public.challenges;
create trigger notify_challenge_lifecycle_after_status
after update of status on public.challenges
for each row execute function public.notify_challenge_lifecycle();

revoke all on function public.register_push_device(text, text) from public, anon, authenticated;
revoke all on function public.disable_push_device(text) from public, anon, authenticated;
revoke all on function public.list_my_notifications(integer) from public, anon, authenticated;
revoke all on function public.get_my_notification_unread_count() from public, anon, authenticated;
revoke all on function public.mark_notification_read(uuid) from public, anon, authenticated;
revoke all on function public.mark_all_notifications_read() from public, anon, authenticated;
revoke all on function public.persist_user_notification() from public, anon, authenticated;
revoke all on function public.notify_private_join_request() from public, anon, authenticated;
revoke all on function public.notify_challenge_lifecycle() from public, anon, authenticated;

grant execute on function public.register_push_device(text, text) to authenticated;
grant execute on function public.disable_push_device(text) to authenticated;
grant execute on function public.list_my_notifications(integer) to authenticated;
grant execute on function public.get_my_notification_unread_count() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

comment on table public.notifications is
  'Durable user inbox materialized from realtime user-domain events.';
comment on table public.push_devices is
  'Expo push tokens registered to a signed-in member device.';
