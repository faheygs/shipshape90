create table if not exists public.challenge_access_requests (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'declined', 'joined', 'cancelled')),
  invite_id uuid references public.challenge_invites(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  unique (challenge_id, profile_id)
);

alter table public.challenge_access_requests enable row level security;

drop policy if exists "users read their private challenge requests" on public.challenge_access_requests;
create policy "users read their private challenge requests"
on public.challenge_access_requests for select to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1 from public.challenges challenge
    where challenge.id = challenge_access_requests.challenge_id and challenge.owner_id = auth.uid()
  )
);

grant select on public.challenge_access_requests to authenticated;

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
  invite_record public.challenge_invites%rowtype;
  next_status text;
  current_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles profile where profile.id = auth.uid()) then
    raise exception 'Complete your profile before requesting access';
  end if;

  select challenge.* into challenge_record
  from public.challenges challenge
  where challenge.id = target_challenge_id
  for update;

  if not found or challenge_record.status not in ('registration', 'active') then
    raise exception 'Challenge not found';
  end if;
  if challenge_record.visibility <> 'private' then raise exception 'This challenge is not private'; end if;
  if challenge_record.owner_id = auth.uid() then raise exception 'You own this challenge'; end if;
  if current_date > challenge_record.ends_on then raise exception 'Challenge has ended'; end if;
  if exists (
    select 1 from public.challenge_members member
    where member.challenge_id = target_challenge_id and member.profile_id = auth.uid()
  ) then raise exception 'You already have a membership for this challenge'; end if;

  select request.status into current_status
  from public.challenge_access_requests request
  where request.challenge_id = target_challenge_id and request.profile_id = auth.uid()
  for update;

  if current_status in ('requested', 'approved') and submitted_invite_code is null then
    return current_status;
  end if;

  next_status := 'requested';
  if submitted_invite_code is not null then
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
  set status = excluded.status,
      invite_id = excluded.invite_id,
      requested_at = now(),
      reviewed_at = excluded.reviewed_at,
      reviewed_by = excluded.reviewed_by;

  if invite_record.id is not null and current_status is distinct from 'approved' then
    update public.challenge_invites invite
    set use_count = use_count + 1
    where invite.id = invite_record.id;
  end if;

  insert into public.challenge_saves (profile_id, challenge_id)
  values (auth.uid(), target_challenge_id)
  on conflict (profile_id, challenge_id) do nothing;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    case when next_status = 'requested'
      then 'user:' || challenge_record.owner_id::text || ':notifications'
      else 'user:' || auth.uid()::text || ':notifications'
    end,
    case when next_status = 'requested' then 'challenge.access_requested' else 'challenge.access_unlocked' end,
    target_challenge_id,
    jsonb_build_object('version', 1, 'challengeId', target_challenge_id, 'profileId', auth.uid(), 'status', next_status)
  );

  return next_status;
end;
$$;

revoke all on function public.request_private_challenge_join(uuid, text) from public, anon, authenticated;
grant execute on function public.request_private_challenge_join(uuid, text) to authenticated;

create or replace function public.set_challenge_saved(
  target_challenge_id uuid,
  should_save boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.challenges challenge
    where challenge.id = target_challenge_id
      and challenge.status <> 'draft'
      and (challenge.visibility in ('public', 'private') or challenge.owner_id = auth.uid())
  ) then raise exception 'Challenge not found'; end if;

  if should_save then
    insert into public.challenge_saves (profile_id, challenge_id)
    values (auth.uid(), target_challenge_id)
    on conflict (profile_id, challenge_id) do nothing;
  else
    delete from public.challenge_saves saved
    where saved.profile_id = auth.uid() and saved.challenge_id = target_challenge_id;
  end if;
  return should_save;
end;
$$;

revoke all on function public.set_challenge_saved(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_challenge_saved(uuid, boolean) to authenticated;

drop function if exists public.list_challenges();
create function public.list_challenges()
returns table (
  id uuid, slug text, name text, description text, category text,
  visibility public.challenge_visibility, join_policy text, challenge_status text,
  starts_on date, ends_on date, participant_count bigint, membership_status text,
  cover_path text, prize_description text, scoring_method text,
  bonus_metric text, bonus_calculation text,
  weight_bonus_calculation text, body_fat_bonus_calculation text,
  is_saved boolean, is_queued boolean, queue_status text, is_owner boolean,
  join_request_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select challenge.id, challenge.slug, challenge.name, challenge.description, challenge.category,
    challenge.visibility, challenge.join_policy, challenge.status::text,
    challenge.starts_on, challenge.ends_on,
    (select count(*) from public.challenge_members member
      where member.challenge_id = challenge.id and member.status in ('pending', 'active', 'completed')),
    coalesce((select member.status::text from public.challenge_members member
      where member.challenge_id = challenge.id and member.profile_id = auth.uid()), 'none'),
    challenge.cover_path, challenge.prize_description,
    'total_points'::text, coalesce(rules.bonus_metric, 'none'), rules.bonus_calculation,
    rules.weight_bonus_calculation, rules.body_fat_bonus_calculation,
    exists (select 1 from public.challenge_saves saved
      where saved.challenge_id = challenge.id and saved.profile_id = auth.uid()),
    exists (select 1 from public.challenge_join_queue queue
      where queue.challenge_id = challenge.id and queue.profile_id = auth.uid() and queue.status in ('queued', 'blocked')),
    (select queue.status from public.challenge_join_queue queue
      where queue.challenge_id = challenge.id and queue.profile_id = auth.uid()),
    challenge.owner_id = auth.uid(),
    (select request.status from public.challenge_access_requests request
      where request.challenge_id = challenge.id and request.profile_id = auth.uid())
  from public.challenges challenge
  left join public.winner_rules rules
    on rules.challenge_id = challenge.id and rules.rules_version = challenge.rules_version
  where challenge.status <> 'draft'
    and (
      challenge.visibility in ('public', 'private')
      or challenge.owner_id = auth.uid()
      or exists (select 1 from public.challenge_members member
        where member.challenge_id = challenge.id and member.profile_id = auth.uid())
    )
  order by case when exists (
      select 1 from public.challenge_members member
      where member.challenge_id = challenge.id and member.profile_id = auth.uid() and member.status = 'active'
    ) then 0 else 1 end,
    challenge.starts_on, challenge.created_at desc;
$$;

revoke all on function public.list_challenges() from public, anon, authenticated;
grant execute on function public.list_challenges() to anon, authenticated;

drop function if exists public.resolve_challenge_invite(text);
create function public.resolve_challenge_invite(submitted_invite_code text)
returns table (
  challenge_id uuid, name text, description text, category text,
  starts_on date, ends_on date, participant_count bigint, cover_path text,
  prize_description text, scoring_method text, bonus_metric text,
  bonus_calculation text, challenge_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select challenge.id, challenge.name, challenge.description, challenge.category,
    challenge.starts_on, challenge.ends_on,
    count(member.id) filter (where member.status in ('pending', 'active', 'completed')),
    challenge.cover_path, challenge.prize_description, 'total_points'::text,
    coalesce(rules.bonus_metric, 'none'), rules.bonus_calculation, challenge.status::text
  from public.challenge_invites invite
  join public.challenges challenge on challenge.id = invite.challenge_id
  left join public.challenge_members member on member.challenge_id = challenge.id
  left join public.winner_rules rules
    on rules.challenge_id = challenge.id and rules.rules_version = challenge.rules_version
  where invite.code = upper(trim(submitted_invite_code))
    and invite.revoked_at is null
    and (invite.expires_at is null or invite.expires_at > now())
    and (invite.max_uses is null or invite.use_count < invite.max_uses)
    and challenge.status in ('registration', 'active')
  group by challenge.id, rules.bonus_metric, rules.bonus_calculation;
$$;

revoke all on function public.resolve_challenge_invite(text) from public, anon, authenticated;
grant execute on function public.resolve_challenge_invite(text) to authenticated;

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
  access_request public.challenge_access_requests%rowtype;
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
  select challenge.* into challenge_record from public.challenges challenge
  where challenge.id = target_challenge_id for update;
  if not found then raise exception 'Challenge not found'; end if;
  is_owner := challenge_record.owner_id = auth.uid();
  if challenge_record.status not in ('registration', 'active') then raise exception 'Challenge is not accepting members'; end if;
  if member_local_date < challenge_record.starts_on then raise exception 'This challenge has not started in your timezone. Reserve your spot instead.'; end if;
  if member_local_date > challenge_record.ends_on then raise exception 'Challenge has ended in your timezone'; end if;
  if challenge_record.registration_closes_at is not null and challenge_record.registration_closes_at <= now() and not is_owner then
    raise exception 'Challenge registration is closed';
  end if;

  select member.* into existing_membership from public.challenge_members member
  where member.challenge_id = target_challenge_id and member.profile_id = auth.uid();
  if found then
    if existing_membership.status = 'left' then raise exception 'You withdrew and cannot rejoin this challenge'; end if;
    raise exception 'You already have a membership for this challenge';
  end if;
  if exists (select 1 from public.challenge_members member
    where member.profile_id = auth.uid() and member.status in ('pending', 'active')) then
    raise exception 'Finish or leave your active challenge before joining another';
  end if;
  if challenge_record.participant_limit is not null and (
    select count(*) from public.challenge_members member
    where member.challenge_id = target_challenge_id and member.status in ('pending', 'active')
  ) >= challenge_record.participant_limit then raise exception 'Challenge is full'; end if;

  select request.* into access_request from public.challenge_access_requests request
  where request.challenge_id = target_challenge_id
    and request.profile_id = auth.uid()
    and request.status = 'approved'
  for update;

  if not is_owner and (
    challenge_record.visibility in ('private', 'unlisted') or challenge_record.join_policy = 'invite_only'
  ) and access_request.id is null then
    if submitted_invite_code is null then raise exception 'A valid invite code or host approval is required'; end if;
    select invite.* into invite_record from public.challenge_invites invite
    where invite.challenge_id = target_challenge_id
      and invite.code = upper(trim(submitted_invite_code))
      and invite.revoked_at is null
      and (invite.expires_at is null or invite.expires_at > now())
      and (invite.max_uses is null or invite.use_count < invite.max_uses)
    for update;
    if not found then raise exception 'Invite code is invalid or expired'; end if;
  end if;

  created_status := case
    when is_owner or access_request.id is not null or invite_record.id is not null then 'active'::public.member_status
    when challenge_record.join_policy = 'approval' then 'pending'::public.member_status
    else 'active'::public.member_status
  end;
  created_role := case when is_owner then 'owner'::public.member_role else 'participant'::public.member_role end;

  insert into public.challenge_members (
    challenge_id, profile_id, role, status, joined_at, prize_eligible, scoring_time_zone
  ) values (
    target_challenge_id, auth.uid(), created_role, created_status,
    case when created_status = 'active' then now() else null end, true, member_time_zone
  ) returning id into created_member_id;

  if invite_record.id is not null then
    update public.challenge_invites set use_count = use_count + 1 where id = invite_record.id;
  end if;
  if access_request.id is not null then
    update public.challenge_access_requests request
    set status = 'joined', reviewed_at = coalesce(request.reviewed_at, now())
    where request.id = access_request.id;
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

create or replace function public.get_challenge_management(target_challenge_id uuid)
returns table (
  challenge_id uuid, name text, description text, challenge_status text,
  visibility public.challenge_visibility, join_policy text, starts_on date, ends_on date,
  rules_locked boolean, active_members bigint, pending_requests bigint,
  queued_members bigint, total_points bigint, average_completion numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.challenges challenge
    where challenge.id = target_challenge_id and challenge.owner_id = auth.uid()) then
    raise exception 'Challenge owner access required';
  end if;
  return query
  with member_scores as (
    select member.id, coalesce(sum(ledger.points), 0)::bigint as points
    from public.challenge_members member
    left join public.score_ledger ledger on ledger.member_id = member.id
    where member.challenge_id = target_challenge_id and member.status in ('active', 'completed')
    group by member.id
  ), member_completion as (
    select occurrence.member_id,
      case when count(*) = 0 then 0::numeric
        else count(*) filter (where occurrence.status in ('complete', 'pending_review'))::numeric / count(*) * 100 end as completion
    from public.task_occurrences occurrence
    where occurrence.challenge_id = target_challenge_id group by occurrence.member_id
  )
  select challenge.id, challenge.name, challenge.description, challenge.status::text,
    challenge.visibility, challenge.join_policy, challenge.starts_on, challenge.ends_on,
    challenge.rules_locked_at is not null,
    (select count(*) from public.challenge_members member where member.challenge_id = challenge.id and member.status in ('active', 'completed')),
    (select count(*) from public.challenge_access_requests request where request.challenge_id = challenge.id and request.status = 'requested')
      + (select count(*) from public.challenge_members member where member.challenge_id = challenge.id and member.status = 'pending'),
    (select count(*) from public.challenge_join_queue queue where queue.challenge_id = challenge.id and queue.status in ('queued', 'blocked')),
    coalesce((select sum(member_scores.points) from member_scores), 0)::bigint,
    coalesce((select round(avg(member_completion.completion), 1) from member_completion), 0::numeric)
  from public.challenges challenge where challenge.id = target_challenge_id;
end;
$$;

create or replace function public.list_challenge_management_members(target_challenge_id uuid)
returns table (
  member_id uuid, profile_id uuid, display_name text, handle text, avatar_path text,
  role public.member_role, member_status public.member_status, joined_at timestamptz,
  prize_eligible boolean, total_points integer, completion_percentage numeric, perfect_days integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.challenges challenge
    where challenge.id = target_challenge_id and challenge.owner_id = auth.uid()) then
    raise exception 'Challenge owner access required';
  end if;
  return query
  with scores as (
    select ledger.member_id, coalesce(sum(ledger.points), 0)::integer as total_points,
      count(*) filter (where ledger.entry_type = 'perfect_day')::integer as perfect_days
    from public.score_ledger ledger where ledger.challenge_id = target_challenge_id group by ledger.member_id
  ), completion as (
    select occurrence.member_id, count(*)::integer as task_count,
      count(*) filter (where occurrence.status in ('complete', 'pending_review'))::integer as completed_count
    from public.task_occurrences occurrence where occurrence.challenge_id = target_challenge_id group by occurrence.member_id
  ), people as (
    select member.id, member.profile_id, profile.display_name, profile.handle, profile.avatar_path,
      member.role, member.status, member.joined_at, member.prize_eligible,
      coalesce(scores.total_points, 0) as total_points,
      case when coalesce(completion.task_count, 0) = 0 then 0::numeric
        else round(completion.completed_count::numeric / completion.task_count * 100, 1) end as completion_percentage,
      coalesce(scores.perfect_days, 0) as perfect_days, member.created_at as sort_at
    from public.challenge_members member
    join public.profiles profile on profile.id = member.profile_id
    left join scores on scores.member_id = member.id
    left join completion on completion.member_id = member.id
    where member.challenge_id = target_challenge_id
    union all
    select request.id, request.profile_id, profile.display_name, profile.handle, profile.avatar_path,
      'participant'::public.member_role, 'pending'::public.member_status, null::timestamptz, false,
      0, 0::numeric, 0, request.requested_at
    from public.challenge_access_requests request
    join public.profiles profile on profile.id = request.profile_id
    where request.challenge_id = target_challenge_id and request.status = 'requested'
  )
  select people.id, people.profile_id, people.display_name, people.handle, people.avatar_path,
    people.role, people.status, people.joined_at, people.prize_eligible,
    people.total_points, people.completion_percentage, people.perfect_days
  from people
  order by case people.status when 'pending' then 0 when 'active' then 1 when 'completed' then 2 else 3 end,
    case people.role when 'owner' then 0 when 'moderator' then 1 else 2 end, people.sort_at;
end;
$$;

create or replace function public.review_challenge_join_request(
  target_challenge_id uuid,
  target_member_id uuid,
  approve_request boolean
)
returns public.member_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile_id uuid;
  legacy_member_id uuid;
  next_status public.member_status;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.challenges challenge
    where challenge.id = target_challenge_id and challenge.owner_id = auth.uid()) then
    raise exception 'Challenge owner access required';
  end if;

  select member.id, member.profile_id into legacy_member_id, target_profile_id
  from public.challenge_members member
  where member.id = target_member_id and member.challenge_id = target_challenge_id and member.status = 'pending'
  for update;

  if legacy_member_id is not null then
    next_status := case when approve_request then 'active'::public.member_status else 'removed'::public.member_status end;
    update public.challenge_members member
    set status = next_status,
      joined_at = case when approve_request then now() else member.joined_at end,
      prize_eligible = approve_request,
      withdrawn_at = case when approve_request then null else now() end,
      forfeiture_reason = case when approve_request then null else 'join_request_declined' end
    where member.id = legacy_member_id;
  else
    select request.profile_id into target_profile_id
    from public.challenge_access_requests request
    where request.id = target_member_id and request.challenge_id = target_challenge_id and request.status = 'requested'
    for update;
    if target_profile_id is null then raise exception 'Pending request not found'; end if;
    update public.challenge_access_requests request
    set status = case when approve_request then 'approved' else 'declined' end,
      reviewed_at = now(), reviewed_by = auth.uid()
    where request.id = target_member_id;
    next_status := case when approve_request then 'pending'::public.member_status else 'removed'::public.member_status end;
  end if;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'user:' || target_profile_id::text || ':notifications',
    case when approve_request then 'challenge.request_approved' else 'challenge.request_declined' end,
    target_challenge_id,
    jsonb_build_object('version', 1, 'challengeId', target_challenge_id, 'profileId', target_profile_id,
      'status', case when approve_request then 'approved' else 'declined' end)
  );
  return next_status;
end;
$$;

revoke all on function public.get_challenge_management(uuid) from public, anon, authenticated;
revoke all on function public.list_challenge_management_members(uuid) from public, anon, authenticated;
revoke all on function public.review_challenge_join_request(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.get_challenge_management(uuid) to authenticated;
grant execute on function public.list_challenge_management_members(uuid) to authenticated;
grant execute on function public.review_challenge_join_request(uuid, uuid, boolean) to authenticated;

comment on table public.challenge_access_requests is
  'Private challenge access requests are approvals only and never consume the one-active-challenge membership slot.';
