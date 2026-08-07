create or replace function public.get_challenge_management(target_challenge_id uuid)
returns table (
  challenge_id uuid,
  name text,
  description text,
  challenge_status text,
  visibility public.challenge_visibility,
  join_policy text,
  starts_on date,
  ends_on date,
  rules_locked boolean,
  active_members bigint,
  pending_requests bigint,
  queued_members bigint,
  total_points bigint,
  average_completion numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.challenges challenge
    where challenge.id = target_challenge_id
      and challenge.owner_id = auth.uid()
  ) then raise exception 'Challenge owner access required'; end if;

  return query
  with member_scores as (
    select member.id,
           coalesce(sum(ledger.points), 0)::bigint as points
    from public.challenge_members member
    left join public.score_ledger ledger on ledger.member_id = member.id
    where member.challenge_id = target_challenge_id
      and member.status in ('active', 'completed')
    group by member.id
  ), member_completion as (
    select occurrence.member_id,
           case when count(*) = 0 then 0::numeric
             else count(*) filter (where occurrence.status in ('complete', 'pending_review'))::numeric / count(*) * 100
           end as completion
    from public.task_occurrences occurrence
    where occurrence.challenge_id = target_challenge_id
    group by occurrence.member_id
  )
  select
    challenge.id,
    challenge.name,
    challenge.description,
    challenge.status::text,
    challenge.visibility,
    challenge.join_policy,
    challenge.starts_on,
    challenge.ends_on,
    challenge.rules_locked_at is not null,
    (select count(*) from public.challenge_members member where member.challenge_id = challenge.id and member.status in ('active', 'completed')),
    (select count(*) from public.challenge_members member where member.challenge_id = challenge.id and member.status = 'pending'),
    (select count(*) from public.challenge_join_queue queue where queue.challenge_id = challenge.id and queue.status in ('queued', 'blocked')),
    coalesce((select sum(member_scores.points) from member_scores), 0)::bigint,
    coalesce((select round(avg(member_completion.completion), 1) from member_completion), 0::numeric)
  from public.challenges challenge
  where challenge.id = target_challenge_id;
end;
$$;

create or replace function public.list_challenge_management_members(target_challenge_id uuid)
returns table (
  member_id uuid,
  profile_id uuid,
  display_name text,
  handle text,
  avatar_path text,
  role public.member_role,
  member_status public.member_status,
  joined_at timestamptz,
  prize_eligible boolean,
  total_points integer,
  completion_percentage numeric,
  perfect_days integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.challenges challenge
    where challenge.id = target_challenge_id
      and challenge.owner_id = auth.uid()
  ) then raise exception 'Challenge owner access required'; end if;

  return query
  with scores as (
    select ledger.member_id,
           coalesce(sum(ledger.points), 0)::integer as total_points,
           count(*) filter (where ledger.entry_type = 'perfect_day')::integer as perfect_days
    from public.score_ledger ledger
    where ledger.challenge_id = target_challenge_id
    group by ledger.member_id
  ), completion as (
    select occurrence.member_id,
           count(*)::integer as task_count,
           count(*) filter (where occurrence.status in ('complete', 'pending_review'))::integer as completed_count
    from public.task_occurrences occurrence
    where occurrence.challenge_id = target_challenge_id
    group by occurrence.member_id
  )
  select
    member.id,
    member.profile_id,
    profile.display_name,
    profile.handle,
    profile.avatar_path,
    member.role,
    member.status,
    member.joined_at,
    member.prize_eligible,
    coalesce(scores.total_points, 0),
    case when coalesce(completion.task_count, 0) = 0 then 0::numeric
      else round(completion.completed_count::numeric / completion.task_count * 100, 1)
    end,
    coalesce(scores.perfect_days, 0)
  from public.challenge_members member
  join public.profiles profile on profile.id = member.profile_id
  left join scores on scores.member_id = member.id
  left join completion on completion.member_id = member.id
  where member.challenge_id = target_challenge_id
  order by
    case member.status when 'pending' then 0 when 'active' then 1 when 'completed' then 2 else 3 end,
    case member.role when 'owner' then 0 when 'moderator' then 1 else 2 end,
    member.created_at;
end;
$$;

create or replace function public.list_challenge_management_queue(target_challenge_id uuid)
returns table (
  profile_id uuid,
  display_name text,
  handle text,
  avatar_path text,
  queue_status text,
  queued_at timestamptz,
  scoring_time_zone text,
  allow_auto_switch boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.challenges challenge
    where challenge.id = target_challenge_id
      and challenge.owner_id = auth.uid()
  ) then raise exception 'Challenge owner access required'; end if;

  return query
  select queue.profile_id, profile.display_name, profile.handle, profile.avatar_path,
         queue.status, queue.queued_at, queue.scoring_time_zone, queue.allow_auto_switch
  from public.challenge_join_queue queue
  join public.profiles profile on profile.id = queue.profile_id
  where queue.challenge_id = target_challenge_id
    and queue.status in ('queued', 'blocked')
  order by queue.queued_at;
end;
$$;

create or replace function public.list_challenge_management_invites(target_challenge_id uuid)
returns table (
  invite_id uuid,
  code text,
  max_uses integer,
  use_count integer,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.challenges challenge
    where challenge.id = target_challenge_id
      and challenge.owner_id = auth.uid()
  ) then raise exception 'Challenge owner access required'; end if;

  return query
  select invite.id, invite.code, invite.max_uses, invite.use_count,
         invite.expires_at, invite.revoked_at, invite.created_at
  from public.challenge_invites invite
  where invite.challenge_id = target_challenge_id
  order by invite.created_at desc;
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
  target_member record;
  next_status public.member_status;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.challenges challenge
    where challenge.id = target_challenge_id
      and challenge.owner_id = auth.uid()
  ) then raise exception 'Challenge owner access required'; end if;

  select member.id, member.profile_id into target_member
  from public.challenge_members member
  where member.id = target_member_id
    and member.challenge_id = target_challenge_id
    and member.status = 'pending'
  for update;

  if target_member.id is null then raise exception 'Pending request not found'; end if;
  next_status := case when approve_request then 'active'::public.member_status else 'removed'::public.member_status end;

  update public.challenge_members member
  set status = next_status,
      joined_at = case when approve_request then now() else member.joined_at end,
      prize_eligible = approve_request,
      withdrawn_at = case when approve_request then null else now() end,
      forfeiture_reason = case when approve_request then null else 'join_request_declined' end
  where member.id = target_member_id;

  if approve_request then
    insert into public.activity_entries (challenge_id, actor_profile_id, event_type, visibility, metadata)
    values (target_challenge_id, target_member.profile_id, 'member_joined', 'challenge', jsonb_build_object('memberId', target_member_id));
  end if;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values
  (
    'challenge:' || target_challenge_id::text || ':activity',
    case when approve_request then 'member.approved' else 'member.declined' end,
    target_challenge_id,
    jsonb_build_object('version', 1, 'challengeId', target_challenge_id, 'memberId', target_member_id, 'profileId', target_member.profile_id, 'status', next_status)
  ),
  (
    'user:' || target_member.profile_id::text || ':notifications',
    case when approve_request then 'challenge.request_approved' else 'challenge.request_declined' end,
    target_challenge_id,
    jsonb_build_object('version', 1, 'challengeId', target_challenge_id, 'memberId', target_member_id, 'status', next_status)
  );

  return next_status;
end;
$$;

create or replace function public.remove_challenge_member(
  target_challenge_id uuid,
  target_member_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_member record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.challenges challenge
    where challenge.id = target_challenge_id
      and challenge.owner_id = auth.uid()
  ) then raise exception 'Challenge owner access required'; end if;

  select member.id, member.profile_id, member.role into target_member
  from public.challenge_members member
  where member.id = target_member_id
    and member.challenge_id = target_challenge_id
    and member.status in ('pending', 'active')
  for update;

  if target_member.id is null then raise exception 'Active member not found'; end if;
  if target_member.role = 'owner' then raise exception 'The challenge owner cannot be removed'; end if;

  update public.challenge_members member
  set status = 'removed', prize_eligible = false, withdrawn_at = now(), forfeiture_reason = 'removed_by_host'
  where member.id = target_member_id;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values
  (
    'challenge:' || target_challenge_id::text || ':activity',
    'member.removed',
    target_challenge_id,
    jsonb_build_object('version', 1, 'challengeId', target_challenge_id, 'memberId', target_member_id, 'profileId', target_member.profile_id)
  ),
  (
    'user:' || target_member.profile_id::text || ':notifications',
    'challenge.member_removed',
    target_challenge_id,
    jsonb_build_object('version', 1, 'challengeId', target_challenge_id, 'memberId', target_member_id)
  );

  return target_member_id;
end;
$$;

create or replace function public.revoke_challenge_invite(target_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  update public.challenge_invites invite
  set revoked_at = now()
  where invite.id = target_invite_id
    and invite.revoked_at is null
    and exists (
      select 1 from public.challenges challenge
      where challenge.id = invite.challenge_id
        and challenge.owner_id = auth.uid()
    )
  returning invite.id into revoked_id;

  if revoked_id is null then raise exception 'Active invite not found'; end if;
  return revoked_id;
end;
$$;

create or replace function public.close_owned_challenge(
  target_challenge_id uuid,
  close_action text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_record record;
  next_status public.challenge_status;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if close_action not in ('cancel', 'end') then raise exception 'Invalid close action'; end if;

  select challenge.* into challenge_record
  from public.challenges challenge
  where challenge.id = target_challenge_id
    and challenge.owner_id = auth.uid()
  for update;

  if not found then raise exception 'Owned challenge not found'; end if;
  if challenge_record.status in ('complete', 'archived') then raise exception 'Challenge is already closed'; end if;
  if close_action = 'cancel' and challenge_record.status not in ('draft', 'registration') then
    raise exception 'Only a challenge that has not started can be cancelled';
  end if;
  if close_action = 'end' and current_date < challenge_record.starts_on then
    raise exception 'Use cancel before the challenge starts';
  end if;

  next_status := case when close_action = 'cancel' then 'archived'::public.challenge_status else 'complete'::public.challenge_status end;

  update public.challenges challenge
  set status = next_status,
      ends_on = case when close_action = 'end' then least(challenge.ends_on, current_date) else challenge.ends_on end,
      updated_at = now()
  where challenge.id = target_challenge_id;

  if close_action = 'cancel' then
    update public.challenge_members member
    set status = 'removed', prize_eligible = false, withdrawn_at = now(), forfeiture_reason = 'challenge_cancelled'
    where member.challenge_id = target_challenge_id
      and member.status in ('pending', 'active');
  else
    update public.challenge_members member
    set status = case when member.status = 'active' then 'completed'::public.member_status else 'removed'::public.member_status end,
        prize_eligible = case when member.status = 'active' then member.prize_eligible else false end,
        withdrawn_at = case when member.status = 'pending' then now() else member.withdrawn_at end,
        forfeiture_reason = case when member.status = 'pending' then 'challenge_ended_before_approval' else member.forfeiture_reason end
    where member.challenge_id = target_challenge_id
      and member.status in ('pending', 'active');
  end if;

  update public.challenge_join_queue queue
  set status = 'failed', processed_at = now(), failure_reason = case when close_action = 'cancel' then 'Challenge cancelled by host' else 'Challenge ended by host' end
  where queue.challenge_id = target_challenge_id
    and queue.status in ('queued', 'blocked');

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'challenge:' || target_challenge_id::text || ':activity',
    case when close_action = 'cancel' then 'challenge.cancelled' else 'challenge.ended' end,
    target_challenge_id,
    jsonb_build_object('version', 1, 'challengeId', target_challenge_id, 'profileId', auth.uid(), 'status', next_status)
  );

  return next_status::text;
end;
$$;

revoke all on function public.get_challenge_management(uuid) from public, anon, authenticated;
revoke all on function public.list_challenge_management_members(uuid) from public, anon, authenticated;
revoke all on function public.list_challenge_management_queue(uuid) from public, anon, authenticated;
revoke all on function public.list_challenge_management_invites(uuid) from public, anon, authenticated;
revoke all on function public.review_challenge_join_request(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.remove_challenge_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.revoke_challenge_invite(uuid) from public, anon, authenticated;
revoke all on function public.close_owned_challenge(uuid, text) from public, anon, authenticated;

grant execute on function public.get_challenge_management(uuid) to authenticated;
grant execute on function public.list_challenge_management_members(uuid) to authenticated;
grant execute on function public.list_challenge_management_queue(uuid) to authenticated;
grant execute on function public.list_challenge_management_invites(uuid) to authenticated;
grant execute on function public.review_challenge_join_request(uuid, uuid, boolean) to authenticated;
grant execute on function public.remove_challenge_member(uuid, uuid) to authenticated;
grant execute on function public.revoke_challenge_invite(uuid) to authenticated;
grant execute on function public.close_owned_challenge(uuid, text) to authenticated;

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
  challenge_status text,
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
  queue_status text,
  is_owner boolean
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
    challenge.status::text,
    challenge.starts_on,
    challenge.ends_on,
    count(member.id) filter (where member.status in ('pending', 'active', 'completed')),
    coalesce(max(mine.status::text), 'none'),
    challenge.cover_path,
    challenge.prize_description,
    'total_points'::text,
    coalesce(rules.bonus_metric, 'none'),
    rules.bonus_calculation,
    bool_or(saved.profile_id is not null),
    bool_or(my_queue.status in ('queued', 'blocked')),
    max(my_queue.status),
    challenge.owner_id = auth.uid()
  from public.challenges challenge
  left join public.challenge_members member on member.challenge_id = challenge.id
  left join public.challenge_members mine on mine.challenge_id = challenge.id and mine.profile_id = auth.uid()
  left join public.winner_rules rules on rules.challenge_id = challenge.id and rules.rules_version = challenge.rules_version
  left join public.challenge_saves saved on saved.challenge_id = challenge.id and saved.profile_id = auth.uid()
  left join public.challenge_join_queue my_queue on my_queue.challenge_id = challenge.id and my_queue.profile_id = auth.uid()
  where challenge.visibility = 'public' or challenge.owner_id = auth.uid() or mine.id is not null
  group by challenge.id, rules.bonus_metric, rules.bonus_calculation
  order by case when max(mine.status::text) = 'active' then 0 else 1 end,
           challenge.starts_on,
           challenge.created_at desc;
$$;

revoke all on function public.list_challenges() from public, anon, authenticated;
grant execute on function public.list_challenges() to anon, authenticated;

comment on function public.get_challenge_management(uuid) is
  'Owner-only challenge operations summary.';
