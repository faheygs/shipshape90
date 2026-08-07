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
  member_time_zone text;
  member_local_date date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

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
    raise exception 'Complete your profile before joining';
  end if;

  member_local_date := (now() at time zone member_time_zone)::date;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select challenge.* into challenge_record
  from public.challenges challenge
  where challenge.id = target_challenge_id
  for update;

  if not found then raise exception 'Challenge not found'; end if;
  if challenge_record.status not in ('registration', 'active') then
    raise exception 'Challenge is not accepting members';
  end if;
  if member_local_date > challenge_record.ends_on then
    raise exception 'Challenge has ended in your timezone';
  end if;
  if challenge_record.registration_closes_at is not null
     and challenge_record.registration_closes_at <= now() then
    raise exception 'Challenge registration is closed';
  end if;

  select member.* into existing_membership
  from public.challenge_members member
  where member.challenge_id = target_challenge_id
    and member.profile_id = auth.uid();

  if found then
    if existing_membership.status = 'left' then
      raise exception 'You withdrew and cannot rejoin this challenge';
    end if;
    raise exception 'You already have a membership for this challenge';
  end if;

  if exists (
    select 1 from public.challenge_members member
    where member.profile_id = auth.uid()
      and member.status in ('pending', 'active')
  ) then raise exception 'Finish or leave your active challenge before joining another'; end if;

  if challenge_record.participant_limit is not null and (
    select count(*) from public.challenge_members member
    where member.challenge_id = target_challenge_id
      and member.status in ('pending', 'active')
  ) >= challenge_record.participant_limit then raise exception 'Challenge is full'; end if;

  if challenge_record.visibility in ('private', 'unlisted')
     or challenge_record.join_policy = 'invite_only' then
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
    when challenge_record.join_policy = 'approval'
      then 'pending'::public.member_status
    else 'active'::public.member_status
  end;

  insert into public.challenge_members (
    challenge_id, profile_id, role, status, joined_at, prize_eligible
  ) values (
    target_challenge_id,
    auth.uid(),
    'participant',
    created_status,
    case when created_status = 'active' then now() else null end,
    true
  ) returning id into created_member_id;

  if invite_record.id is not null then
    update public.challenge_invites
    set use_count = use_count + 1
    where id = invite_record.id;
  end if;

  if created_status = 'active' then
    insert into public.activity_entries (
      challenge_id, actor_profile_id, event_type, visibility, metadata
    ) values (
      target_challenge_id,
      auth.uid(),
      'member_joined',
      'challenge',
      jsonb_build_object(
        'memberId', created_member_id,
        'scoringTimeZone', member_time_zone
      )
    );
  end if;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'challenge:' || target_challenge_id::text || ':activity',
    case when created_status = 'active' then 'member.joined' else 'member.requested' end,
    target_challenge_id,
    jsonb_build_object(
      'challengeId', target_challenge_id,
      'memberId', created_member_id,
      'profileId', auth.uid(),
      'status', created_status,
      'scoringTimeZone', member_time_zone
    )
  );

  return created_member_id;
end;
$$;

revoke all on function public.join_challenge(uuid, text) from public, anon, authenticated;
grant execute on function public.join_challenge(uuid, text) to authenticated;

comment on function public.join_challenge(uuid, text) is
  'Joins an eligible challenge in the member timezone; public joins do not require an initialized invite record.';
