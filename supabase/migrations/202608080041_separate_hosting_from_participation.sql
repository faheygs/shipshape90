create or replace function public.has_challenge_role(
  target_challenge_id uuid,
  allowed_roles public.member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      'owner'::public.member_role = any(allowed_roles)
      and exists (
        select 1
        from public.challenges challenge
        where challenge.id = target_challenge_id
          and challenge.owner_id = auth.uid()
      )
    )
    or exists (
      select 1
      from public.challenge_members member
      where member.challenge_id = target_challenge_id
        and member.profile_id = auth.uid()
        and member.status = 'active'
        and member.role = any(allowed_roles)
    );
$$;

revoke all on function public.has_challenge_role(uuid, public.member_role[]) from public;
grant execute on function public.has_challenge_role(uuid, public.member_role[]) to authenticated;

create or replace function public.publish_challenge(target_challenge_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_record record;
  next_status public.challenge_status;
  owner_member_id uuid;
  owner_local_date date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select challenge.* into challenge_record
  from public.challenges challenge
  where challenge.id = target_challenge_id
    and challenge.owner_id = auth.uid()
  for update;

  if not found then raise exception 'Owned challenge not found'; end if;
  if challenge_record.status <> 'draft' then raise exception 'Only a draft challenge can be published'; end if;

  owner_local_date := (now() at time zone challenge_record.time_zone)::date;
  if challenge_record.ends_on < owner_local_date then
    raise exception 'The challenge end date must be today or later';
  end if;
  if not exists (
    select 1 from public.task_definitions task
    where task.challenge_id = target_challenge_id
      and task.rules_version = challenge_record.rules_version
  ) then raise exception 'Add at least one task before publishing'; end if;
  if not exists (
    select 1 from public.winner_rules rules
    where rules.challenge_id = target_challenge_id
      and rules.rules_version = challenge_record.rules_version
  ) then raise exception 'Set a winning condition before publishing'; end if;

  next_status := case
    when challenge_record.starts_on <= owner_local_date then 'active'::public.challenge_status
    else 'registration'::public.challenge_status
  end;

  update public.challenges
  set status = next_status, rules_locked_at = now(), updated_at = now()
  where id = target_challenge_id;

  -- Publishing is always allowed. The creator only becomes a participant
  -- immediately when the challenge is live and they are not already competing.
  if next_status = 'active' and not exists (
    select 1 from public.challenge_members member
    where member.profile_id = auth.uid()
      and member.challenge_id <> target_challenge_id
      and member.status in ('pending', 'active')
  ) then
    insert into public.challenge_members (
      challenge_id, profile_id, role, status, joined_at, prize_eligible
    ) values (
      target_challenge_id, auth.uid(), 'owner', 'active', now(), true
    )
    on conflict (challenge_id, profile_id) do update
    set role = 'owner', status = 'active',
        joined_at = coalesce(public.challenge_members.joined_at, now()),
        prize_eligible = true, withdrawn_at = null, forfeiture_reason = null
    returning id into owner_member_id;

    insert into public.activity_entries (
      challenge_id, actor_profile_id, event_type, body, visibility, metadata
    ) values (
      target_challenge_id, auth.uid(), 'member_joined', 'Created the challenge',
      'challenge', jsonb_build_object('memberId', owner_member_id, 'role', 'owner')
    );
  end if;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'challenge:' || target_challenge_id::text || ':activity',
    'challenge.published',
    target_challenge_id,
    jsonb_strip_nulls(jsonb_build_object(
      'version', 2,
      'challengeId', target_challenge_id,
      'profileId', auth.uid(),
      'memberId', owner_member_id,
      'status', next_status,
      'creatorParticipating', owner_member_id is not null
    ))
  );

  return next_status::text;
end;
$$;

create or replace function public.join_challenge(
  target_challenge_id uuid,
  submitted_invite_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_record record;
  existing_membership record;
  invite_record public.challenge_invites%rowtype;
  created_member_id uuid;
  created_status public.member_status;
  created_role public.member_role;
  member_time_zone text;
  member_local_date date;
  is_owner boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select coalesce(
    (select profile.time_zone from public.profiles profile
      where profile.id = auth.uid()
        and exists (select 1 from pg_catalog.pg_timezone_names zone where zone.name = profile.time_zone)),
    'UTC'
  ) into member_time_zone;

  if not exists (select 1 from public.profiles profile where profile.id = auth.uid()) then
    raise exception 'Complete your profile before joining';
  end if;

  member_local_date := (now() at time zone member_time_zone)::date;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select challenge.* into challenge_record
  from public.challenges challenge
  where challenge.id = target_challenge_id
  for update;

  if not found then raise exception 'Challenge not found'; end if;
  is_owner := challenge_record.owner_id = auth.uid();
  if challenge_record.status not in ('registration', 'active') then raise exception 'Challenge is not accepting members'; end if;
  if member_local_date < challenge_record.starts_on then raise exception 'This challenge has not started in your timezone. Reserve your spot instead.'; end if;
  if member_local_date > challenge_record.ends_on then raise exception 'Challenge has ended in your timezone'; end if;
  if challenge_record.registration_closes_at is not null and challenge_record.registration_closes_at <= now() and not is_owner then
    raise exception 'Challenge registration is closed';
  end if;

  select member.* into existing_membership
  from public.challenge_members member
  where member.challenge_id = target_challenge_id and member.profile_id = auth.uid();

  if found then
    if existing_membership.status = 'left' then raise exception 'You withdrew and cannot rejoin this challenge'; end if;
    raise exception 'You already have a membership for this challenge';
  end if;

  if exists (
    select 1 from public.challenge_members member
    where member.profile_id = auth.uid() and member.status in ('pending', 'active')
  ) then raise exception 'Finish or leave your active challenge before joining another'; end if;

  if challenge_record.participant_limit is not null and (
    select count(*) from public.challenge_members member
    where member.challenge_id = target_challenge_id and member.status in ('pending', 'active')
  ) >= challenge_record.participant_limit then raise exception 'Challenge is full'; end if;

  if not is_owner and (
    challenge_record.visibility in ('private', 'unlisted') or challenge_record.join_policy = 'invite_only'
  ) then
    if submitted_invite_code is null then raise exception 'A valid invite code is required'; end if;
    select invite.* into invite_record
    from public.challenge_invites invite
    where invite.challenge_id = target_challenge_id
      and invite.code = upper(trim(submitted_invite_code))
      and invite.revoked_at is null
      and (invite.expires_at is null or invite.expires_at > now())
      and (invite.max_uses is null or invite.use_count < invite.max_uses)
    for update;
    if not found then raise exception 'Invite code is invalid or expired'; end if;
  end if;

  created_status := case
    when is_owner then 'active'::public.member_status
    when challenge_record.join_policy = 'approval' then 'pending'::public.member_status
    else 'active'::public.member_status
  end;
  created_role := case when is_owner then 'owner'::public.member_role else 'participant'::public.member_role end;

  insert into public.challenge_members (
    challenge_id, profile_id, role, status, joined_at, prize_eligible
  ) values (
    target_challenge_id, auth.uid(), created_role, created_status,
    case when created_status = 'active' then now() else null end, true
  ) returning id into created_member_id;

  if invite_record.id is not null then
    update public.challenge_invites set use_count = use_count + 1 where id = invite_record.id;
  end if;

  if created_status = 'active' then
    insert into public.activity_entries (challenge_id, actor_profile_id, event_type, visibility, metadata)
    values (target_challenge_id, auth.uid(), 'member_joined', 'challenge',
      jsonb_build_object('memberId', created_member_id, 'scoringTimeZone', member_time_zone));
  end if;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'challenge:' || target_challenge_id::text || ':activity',
    case when created_status = 'active' then 'member.joined' else 'member.requested' end,
    target_challenge_id,
    jsonb_build_object('challengeId', target_challenge_id, 'memberId', created_member_id,
      'profileId', auth.uid(), 'status', created_status, 'scoringTimeZone', member_time_zone)
  );

  return created_member_id;
end;
$$;

revoke all on function public.join_challenge(uuid, text) from public, anon, authenticated;
grant execute on function public.join_challenge(uuid, text) to authenticated;

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
  is_owner boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if not should_queue then
    delete from public.challenge_join_queue queue
    where queue.profile_id = auth.uid() and queue.challenge_id = target_challenge_id
      and queue.status in ('queued', 'blocked');
    return false;
  end if;

  select coalesce(
    (select profile.time_zone from public.profiles profile
      where profile.id = auth.uid()
        and exists (select 1 from pg_catalog.pg_timezone_names zone where zone.name = profile.time_zone)),
    'UTC'
  ) into member_time_zone;
  if not exists (select 1 from public.profiles profile where profile.id = auth.uid()) then
    raise exception 'Complete your profile before joining the queue';
  end if;

  member_local_date := (now() at time zone member_time_zone)::date;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select challenge.* into challenge_record
  from public.challenges challenge where challenge.id = target_challenge_id for update;

  if not found then raise exception 'Challenge not found'; end if;
  is_owner := challenge_record.owner_id = auth.uid();
  if not is_owner and challenge_record.visibility <> 'public' then raise exception 'Challenge not found'; end if;
  if challenge_record.status <> 'registration' then raise exception 'Challenge is not accepting queued members'; end if;
  if member_local_date >= challenge_record.starts_on then raise exception 'This challenge has already started in your timezone'; end if;
  if challenge_record.registration_closes_at is not null and challenge_record.registration_closes_at <= now() and not is_owner then
    raise exception 'Challenge registration is closed';
  end if;
  if challenge_record.join_policy = 'invite_only' and not is_owner then raise exception 'Invite-only challenges cannot be auto-joined'; end if;
  if exists (
    select 1 from public.challenge_members member
    where member.profile_id = auth.uid() and member.challenge_id = target_challenge_id
  ) then raise exception 'You already have a membership history for this challenge'; end if;

  if challenge_record.participant_limit is not null and (
    (select count(*) from public.challenge_members member
      where member.challenge_id = target_challenge_id and member.status in ('pending', 'active'))
    +
    (select count(*) from public.challenge_join_queue queue
      where queue.challenge_id = target_challenge_id and queue.status in ('queued', 'blocked')
        and queue.profile_id <> auth.uid())
  ) >= challenge_record.participant_limit then raise exception 'Challenge is full'; end if;

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
      status = 'queued', queued_at = now(), processed_at = null, failure_reason = null;

  insert into public.challenge_saves (profile_id, challenge_id)
  values (auth.uid(), target_challenge_id) on conflict (profile_id, challenge_id) do nothing;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'user:' || auth.uid()::text || ':notifications', 'challenge.queue_added', target_challenge_id,
    jsonb_build_object('version', 2, 'profileId', auth.uid(), 'challengeId', target_challenge_id,
      'startsOn', challenge_record.starts_on, 'scoringTimeZone', member_time_zone,
      'allowAutoSwitch', allow_switch_at_start)
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
  created_role public.member_role;
  processed_count integer := 0;
begin
  for queued in
    select queue.*, challenge.name, challenge.owner_id, challenge.status as challenge_status,
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

      if (now() at time zone queued.scoring_time_zone)::date > queued.ends_on then raise exception 'Challenge ended before the queue could be processed'; end if;
      if queued.challenge_status not in ('registration', 'active') then raise exception 'Challenge is not accepting members'; end if;

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

      created_status := case
        when queued.owner_id = queued.profile_id then 'active'::public.member_status
        when queued.join_policy = 'approval' then 'pending'::public.member_status
        else 'active'::public.member_status
      end;
      created_role := case
        when queued.owner_id = queued.profile_id then 'owner'::public.member_role
        else 'participant'::public.member_role
      end;

      insert into public.challenge_members (
        challenge_id, profile_id, role, status, joined_at, prize_eligible
      ) values (
        queued.challenge_id, queued.profile_id, created_role, created_status,
        case when created_status = 'active' then now() else null end, true
      ) returning id into created_member_id;

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

revoke all on function public.process_due_challenge_queues() from public, anon, authenticated;

comment on function public.publish_challenge(uuid) is
  'Publishes an owned challenge without requiring the creator to participate.';
comment on function public.set_challenge_queued(uuid, boolean, boolean) is
  'Reserves a future challenge; allow_switch_at_start controls whether an overlap forfeits automatically or waits for confirmation.';
