create or replace function public.request_private_challenge_join(
  target_challenge_id uuid,
  submitted_invite_code text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_record record;
  applicant_record record;
  invite_record public.challenge_invites%rowtype;
  next_status text;
  current_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select profile.display_name, profile.handle into applicant_record
  from public.profiles profile where profile.id = auth.uid();
  if not found then raise exception 'Complete your profile before requesting access'; end if;

  select challenge.* into challenge_record
  from public.challenges challenge
  where challenge.id = target_challenge_id
  for update;
  if not found or challenge_record.status not in ('registration', 'active') then raise exception 'Challenge not found'; end if;
  if challenge_record.visibility <> 'private' then raise exception 'This challenge is not private'; end if;
  if challenge_record.owner_id = auth.uid() then raise exception 'You own this challenge'; end if;
  if current_date > challenge_record.ends_on then raise exception 'Challenge has ended'; end if;
  if exists (select 1 from public.challenge_members member
    where member.challenge_id = target_challenge_id and member.profile_id = auth.uid()) then
    raise exception 'You already have a membership for this challenge';
  end if;

  select request.status into current_status
  from public.challenge_access_requests request
  where request.challenge_id = target_challenge_id and request.profile_id = auth.uid()
  for update;

  if current_status in ('requested', 'approved') and submitted_invite_code is null then return current_status; end if;
  if current_status = 'declined' and submitted_invite_code is null then
    raise exception 'The host declined this request. A valid private code is now required.';
  end if;

  next_status := 'requested';
  if submitted_invite_code is not null then
    if challenge_record.participant_limit is not null and (
      (select count(*) from public.challenge_members member
        where member.challenge_id = target_challenge_id and member.status in ('pending', 'active'))
      + (select count(*) from public.challenge_join_queue queue
        where queue.challenge_id = target_challenge_id and queue.status in ('queued', 'blocked'))
    ) >= challenge_record.participant_limit then raise exception 'Challenge is full'; end if;
    select invite.* into invite_record
    from public.challenge_invites invite
    where invite.challenge_id = target_challenge_id
      and invite.code = upper(trim(submitted_invite_code))
      and invite.revoked_at is null
      and (invite.expires_at is null or invite.expires_at > now())
      and (invite.max_uses is null or invite.use_count < invite.max_uses)
    for update;
    if not found then raise exception 'Invite code is invalid or expired'; end if;
    next_status := 'approved';
  end if;

  insert into public.challenge_access_requests (
    challenge_id, profile_id, status, invite_id, requested_at, reviewed_at, reviewed_by
  ) values (
    target_challenge_id, auth.uid(), next_status, invite_record.id, now(),
    case when next_status = 'approved' then now() else null end,
    case when next_status = 'approved' then challenge_record.owner_id else null end
  )
  on conflict (challenge_id, profile_id) do update
  set status = excluded.status, invite_id = excluded.invite_id, requested_at = now(),
      reviewed_at = excluded.reviewed_at, reviewed_by = excluded.reviewed_by;

  if invite_record.id is not null and current_status is distinct from 'approved' then
    update public.challenge_invites invite set use_count = use_count + 1 where invite.id = invite_record.id;
  end if;
  insert into public.challenge_saves (profile_id, challenge_id)
  values (auth.uid(), target_challenge_id)
  on conflict (profile_id, challenge_id) do nothing;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    case when next_status = 'requested'
      then 'user:' || challenge_record.owner_id::text || ':notifications'
      else 'user:' || auth.uid()::text || ':notifications' end,
    case when next_status = 'requested' then 'challenge.join_requested' else 'challenge.access_unlocked' end,
    target_challenge_id,
    jsonb_build_object(
      'version', 1, 'challengeId', target_challenge_id, 'challengeName', challenge_record.name,
      'requestId', (select request.id from public.challenge_access_requests request
        where request.challenge_id = target_challenge_id and request.profile_id = auth.uid()),
      'profileId', auth.uid(), 'applicantName', applicant_record.display_name,
      'applicantHandle', applicant_record.handle, 'status', next_status
    )
  );
  return next_status;
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
    'challenge.join_requested', 'challenge.request_approved', 'challenge.request_declined',
    'challenge.member_removed', 'challenge.queue_blocked', 'challenge.queue_joined',
    'challenge.queue_failed', 'challenge.started', 'challenge.cancelled', 'challenge.ended'
  ) then return new; end if;
  begin
    target_profile_id := split_part(new.topic, ':', 2)::uuid;
  exception when invalid_text_representation then return new;
  end;
  select challenge.name into challenge_name from public.challenges challenge where challenge.id = new.aggregate_id;
  challenge_name := coalesce(new.payload ->> 'challengeName', challenge_name, 'your challenge');

  case new.event_type
    when 'challenge.join_requested' then
      notification_title := 'New join request';
      notification_body := coalesce(new.payload ->> 'applicantName', 'Someone') || ' wants to join ' || challenge_name || '.';
      notification_path := '/manage-challenge/' || new.aggregate_id::text || '?section=requests';
    when 'challenge.request_approved' then
      notification_title := 'Access approved';
      notification_body := 'Your request to join ' || challenge_name || ' was approved.';
      notification_path := '/challenge-detail/' || new.aggregate_id::text;
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
    profile_id, source_event_id, notification_type, title, body, challenge_id, action_path, payload
  ) values (
    target_profile_id, new.id, new.event_type, notification_title, notification_body,
    new.aggregate_id, notification_path, new.payload
  ) on conflict (source_event_id) do nothing;
  return new;
end;
$$;

create or replace function public.list_challenge_tasks(target_challenge_id uuid)
returns table (
  task_definition_id uuid, title text, instructions text, task_type text,
  target_value numeric, unit text, points integer,
  proof_policy public.proof_policy, required boolean, ordinal integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare challenge_rules_version integer;
begin
  select challenge.rules_version into challenge_rules_version
  from public.challenges challenge
  where challenge.id = target_challenge_id
    and (
      challenge.visibility in ('public', 'unlisted')
      or challenge.owner_id = auth.uid()
      or exists (select 1 from public.challenge_members member
        where member.challenge_id = challenge.id and member.profile_id = auth.uid())
      or exists (select 1 from public.challenge_access_requests request
        where request.challenge_id = challenge.id and request.profile_id = auth.uid()
          and request.status in ('approved', 'joined'))
    );
  if challenge_rules_version is null then raise exception 'Challenge not found'; end if;
  return query
  select task.id, task.title, task.instructions, task.task_type, task.target_value,
    task.unit, task.points, task.proof_policy, task.required, task.ordinal
  from public.task_definitions task
  where task.challenge_id = target_challenge_id and task.rules_version = challenge_rules_version
  order by task.ordinal;
end;
$$;

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
  has_private_access boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not should_queue then
    delete from public.challenge_join_queue queue
    where queue.profile_id = auth.uid() and queue.challenge_id = target_challenge_id
      and queue.status in ('queued', 'blocked');
    return false;
  end if;
  select coalesce((select profile.time_zone from public.profiles profile
    where profile.id = auth.uid() and exists (select 1 from pg_catalog.pg_timezone_names zone
      where zone.name = profile.time_zone)), 'UTC') into member_time_zone;
  if not exists (select 1 from public.profiles profile where profile.id = auth.uid()) then
    raise exception 'Complete your profile before joining the queue';
  end if;
  member_local_date := (now() at time zone member_time_zone)::date;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  select challenge.* into challenge_record from public.challenges challenge
  where challenge.id = target_challenge_id for update;
  if not found then raise exception 'Challenge not found'; end if;
  has_private_access := challenge_record.owner_id = auth.uid() or exists (
    select 1 from public.challenge_access_requests request
    where request.challenge_id = target_challenge_id and request.profile_id = auth.uid()
      and request.status in ('approved', 'joined')
  );
  if challenge_record.visibility = 'private' and not has_private_access then
    raise exception 'Private challenge access is required before joining the queue';
  end if;
  if challenge_record.visibility = 'unlisted' and challenge_record.owner_id <> auth.uid() then
    raise exception 'Challenge not found';
  end if;
  if challenge_record.status <> 'registration' then raise exception 'Challenge is not accepting queued members'; end if;
  if member_local_date >= challenge_record.starts_on then raise exception 'This challenge has already started in your timezone'; end if;
  if challenge_record.registration_closes_at is not null and challenge_record.registration_closes_at <= now() then
    raise exception 'Challenge registration is closed';
  end if;
  if challenge_record.join_policy = 'invite_only' and not has_private_access then
    raise exception 'Private challenge access is required before joining the queue';
  end if;
  if exists (select 1 from public.challenge_members member
    where member.profile_id = auth.uid() and member.challenge_id = target_challenge_id) then
    raise exception 'You already have a membership history for this challenge';
  end if;
  select member.challenge_id into current_challenge_id
  from public.challenge_members member
  where member.profile_id = auth.uid() and member.status in ('pending', 'active') limit 1;
  if current_challenge_id is not null and not allow_switch_at_start then
    raise exception 'Confirm that this queue may replace your current challenge when it starts';
  end if;
  if challenge_record.participant_limit is not null and (
    (select count(*) from public.challenge_members member
      where member.challenge_id = target_challenge_id and member.status in ('pending', 'active'))
    + (select count(*) from public.challenge_join_queue queue
      where queue.challenge_id = target_challenge_id and queue.status in ('queued', 'blocked')
        and queue.profile_id <> auth.uid())
  ) >= challenge_record.participant_limit then raise exception 'Challenge is full'; end if;

  insert into public.challenge_join_queue (
    profile_id, challenge_id, scoring_time_zone, allow_auto_switch,
    status, queued_at, processed_at, failure_reason
  ) values (
    auth.uid(), target_challenge_id, member_time_zone, allow_switch_at_start,
    'queued', now(), null, null
  ) on conflict (profile_id, challenge_id) do update
  set scoring_time_zone = excluded.scoring_time_zone,
      allow_auto_switch = excluded.allow_auto_switch, status = 'queued',
      queued_at = now(), processed_at = null, failure_reason = null;
  insert into public.challenge_saves (profile_id, challenge_id)
  values (auth.uid(), target_challenge_id) on conflict (profile_id, challenge_id) do nothing;
  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values ('user:' || auth.uid()::text || ':notifications', 'challenge.queue_added', target_challenge_id,
    jsonb_build_object('version', 1, 'profileId', auth.uid(), 'challengeId', target_challenge_id,
      'startsOn', challenge_record.starts_on, 'scoringTimeZone', member_time_zone,
      'allowAutoSwitch', allow_switch_at_start));
  return true;
end;
$$;

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
  created_role public.member_role;
  processed_count integer := 0;
begin
  for queued in
    select queue.*, challenge.name, challenge.status as challenge_status,
      challenge.starts_on, challenge.ends_on, challenge.join_policy,
      challenge.visibility, challenge.owner_id,
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
      if queued.visibility = 'private' and queued.owner_id <> queued.profile_id and not exists (
        select 1 from public.challenge_access_requests request
        where request.challenge_id = queued.challenge_id and request.profile_id = queued.profile_id
          and request.status in ('approved', 'joined')
      ) then raise exception 'Private challenge access is no longer valid'; end if;

      select member.id, member.status into target_membership
      from public.challenge_members member
      where member.profile_id = queued.profile_id and member.challenge_id = queued.challenge_id;
      if target_membership.id is not null then
        if target_membership.status in ('pending', 'active') then
          update public.challenge_join_queue queue set status = 'joined', processed_at = now(), failure_reason = null
          where queue.profile_id = queued.profile_id and queue.challenge_id = queued.challenge_id;
          processed_count := processed_count + 1;
          continue;
        end if;
        raise exception 'This member cannot rejoin the challenge';
      end if;

      select member.id, member.challenge_id, challenge.name into current_membership
      from public.challenge_members member
      join public.challenges challenge on challenge.id = member.challenge_id
      where member.profile_id = queued.profile_id and member.status in ('pending', 'active')
      order by member.created_at limit 1 for update of member;
      if current_membership.id is not null and not queued.allow_auto_switch then
        if queued.status <> 'blocked' then
          update public.challenge_join_queue queue
          set status = 'blocked', failure_reason = 'active_challenge_requires_confirmation'
          where queue.profile_id = queued.profile_id and queue.challenge_id = queued.challenge_id;
          insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
          values ('user:' || queued.profile_id::text || ':notifications', 'challenge.queue_blocked', queued.challenge_id,
            jsonb_build_object('version', 1, 'profileId', queued.profile_id,
              'challengeId', queued.challenge_id, 'challengeName', queued.name,
              'currentChallengeId', current_membership.challenge_id,
              'currentChallengeName', current_membership.name));
        end if;
        continue;
      end if;
      if queued.participant_limit is not null and (
        select count(*) from public.challenge_members member
        where member.challenge_id = queued.challenge_id and member.status in ('pending', 'active')
      ) >= queued.participant_limit then raise exception 'Challenge is full'; end if;

      if current_membership.id is not null then
        update public.challenge_members member
        set status = 'left', prize_eligible = false, withdrawn_at = now(),
          forfeiture_reason = 'queued_challenge_started'
        where member.id = current_membership.id;
        insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
        values ('challenge:' || current_membership.challenge_id::text || ':activity',
          'member.withdrawn', current_membership.challenge_id,
          jsonb_build_object('version', 1, 'challengeId', current_membership.challenge_id,
            'memberId', current_membership.id, 'profileId', queued.profile_id,
            'reason', 'queued_challenge_started', 'prizeEligible', false));
      end if;

      created_status := case when queued.owner_id = queued.profile_id then 'active'::public.member_status
        when queued.join_policy = 'approval' and queued.visibility <> 'private' then 'pending'::public.member_status
        else 'active'::public.member_status end;
      created_role := case when queued.owner_id = queued.profile_id then 'owner'::public.member_role
        else 'participant'::public.member_role end;
      insert into public.challenge_members (
        challenge_id, profile_id, role, status, joined_at, prize_eligible, scoring_time_zone
      ) values (
        queued.challenge_id, queued.profile_id, created_role, created_status,
        case when created_status = 'active' then now() else null end, true, queued.scoring_time_zone
      ) returning id into created_member_id;
      update public.challenge_access_requests request
      set status = 'joined', reviewed_at = coalesce(request.reviewed_at, now())
      where request.challenge_id = queued.challenge_id and request.profile_id = queued.profile_id
        and request.status = 'approved';
      if created_status = 'active' then
        insert into public.activity_entries (challenge_id, actor_profile_id, event_type, visibility, metadata)
        values (queued.challenge_id, queued.profile_id, 'member_joined', 'challenge',
          jsonb_build_object('memberId', created_member_id, 'scoringTimeZone', queued.scoring_time_zone,
            'source', 'challenge_queue'));
      end if;
      update public.challenge_join_queue queue
      set status = 'joined', processed_at = now(), failure_reason = null
      where queue.profile_id = queued.profile_id and queue.challenge_id = queued.challenge_id;
      insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
      values
      ('challenge:' || queued.challenge_id::text || ':activity',
        case when created_status = 'active' then 'member.joined' else 'member.requested' end,
        queued.challenge_id,
        jsonb_build_object('version', 1, 'challengeId', queued.challenge_id,
          'memberId', created_member_id, 'profileId', queued.profile_id,
          'status', created_status, 'scoringTimeZone', queued.scoring_time_zone,
          'source', 'challenge_queue')),
      ('user:' || queued.profile_id::text || ':notifications', 'challenge.queue_joined',
        queued.challenge_id,
        jsonb_build_object('version', 1, 'challengeId', queued.challenge_id,
          'challengeName', queued.name, 'memberId', created_member_id,
          'profileId', queued.profile_id, 'status', created_status));
      processed_count := processed_count + 1;
    exception when others then
      update public.challenge_join_queue queue
      set status = 'failed', processed_at = now(), failure_reason = sqlerrm
      where queue.profile_id = queued.profile_id and queue.challenge_id = queued.challenge_id;
      insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
      values ('user:' || queued.profile_id::text || ':notifications', 'challenge.queue_failed',
        queued.challenge_id,
        jsonb_build_object('version', 1, 'challengeId', queued.challenge_id,
          'challengeName', queued.name, 'profileId', queued.profile_id, 'reason', sqlerrm));
    end;
  end loop;
  return processed_count;
end;
$$;

revoke all on function public.request_private_challenge_join(uuid, text) from public, anon, authenticated;
revoke all on function public.persist_user_notification() from public, anon, authenticated;
revoke all on function public.list_challenge_tasks(uuid) from public, anon, authenticated;
revoke all on function public.set_challenge_queued(uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.process_due_challenge_queues() from public, anon, authenticated;
grant execute on function public.request_private_challenge_join(uuid, text) to authenticated;
grant execute on function public.list_challenge_tasks(uuid) to anon, authenticated;
grant execute on function public.set_challenge_queued(uuid, boolean, boolean) to authenticated;

comment on function public.set_challenge_queued(uuid, boolean, boolean) is
  'Queues public challenges and private challenges that the member owns or has unlocked. Capacity and one-open-queue rules are enforced atomically.';
