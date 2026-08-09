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
  challenge_record record;
  member_time_zone text;
  member_local_date date;
  can_queue boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select challenge.* into challenge_record
  from public.challenges challenge
  where challenge.id = target_challenge_id and challenge.owner_id = auth.uid()
  for update;

  if not found then raise exception 'Challenge owner access required'; end if;

  select member.id, member.profile_id into legacy_member_id, target_profile_id
  from public.challenge_members member
  where member.id = target_member_id
    and member.challenge_id = target_challenge_id
    and member.status = 'pending'
  for update;

  if legacy_member_id is not null then
    next_status := case
      when approve_request then 'active'::public.member_status
      else 'removed'::public.member_status
    end;

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
    where request.id = target_member_id
      and request.challenge_id = target_challenge_id
      and request.status = 'requested'
    for update;

    if target_profile_id is null then raise exception 'Pending request not found'; end if;

    update public.challenge_access_requests request
    set status = case when approve_request then 'approved' else 'declined' end,
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where request.id = target_member_id;

    next_status := case
      when approve_request then 'pending'::public.member_status
      else 'removed'::public.member_status
    end;

    if approve_request then
      perform pg_advisory_xact_lock(hashtext(target_profile_id::text));

      select coalesce(
        case
          when exists (
            select 1
            from pg_catalog.pg_timezone_names zone
            where zone.name = profile.time_zone
          ) then profile.time_zone
          else null
        end,
        'UTC'
      ) into member_time_zone
      from public.profiles profile
      where profile.id = target_profile_id;

      member_time_zone := coalesce(member_time_zone, 'UTC');
      member_local_date := (now() at time zone member_time_zone)::date;

      can_queue := challenge_record.status = 'registration'
        and member_local_date < challenge_record.starts_on
        and not exists (
          select 1
          from public.challenge_members member
          where member.profile_id = target_profile_id
            and member.status in ('pending', 'active')
        )
        and not exists (
          select 1
          from public.challenge_join_queue queue
          where queue.profile_id = target_profile_id
            and queue.status in ('queued', 'blocked')
        )
        and (
          challenge_record.participant_limit is null
          or (
            (select count(*) from public.challenge_members member
              where member.challenge_id = target_challenge_id
                and member.status in ('pending', 'active'))
            + (select count(*) from public.challenge_join_queue queue
              where queue.challenge_id = target_challenge_id
                and queue.status in ('queued', 'blocked'))
          ) < challenge_record.participant_limit
        );

      if can_queue then
        insert into public.challenge_join_queue (
          profile_id,
          challenge_id,
          scoring_time_zone,
          allow_auto_switch,
          status,
          queued_at,
          processed_at,
          failure_reason
        ) values (
          target_profile_id,
          target_challenge_id,
          member_time_zone,
          false,
          'queued',
          now(),
          null,
          null
        ) on conflict do nothing;

        insert into public.challenge_saves (profile_id, challenge_id)
        values (target_profile_id, target_challenge_id)
        on conflict (profile_id, challenge_id) do nothing;
      end if;
    end if;
  end if;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'user:' || target_profile_id::text || ':notifications',
    case when approve_request then 'challenge.request_approved' else 'challenge.request_declined' end,
    target_challenge_id,
    jsonb_build_object(
      'version', 1,
      'challengeId', target_challenge_id,
      'profileId', target_profile_id,
      'status', case when approve_request then 'approved' else 'declined' end,
      'queuedForStart', can_queue
    )
  );

  return next_status;
end;
$$;

revoke all on function public.review_challenge_join_request(uuid, uuid, boolean)
from public, anon, authenticated;
grant execute on function public.review_challenge_join_request(uuid, uuid, boolean)
to authenticated;

-- Repair approved private requests that were left between access approval and the
-- start queue by the previous approval flow. Existing memberships and queues are
-- never replaced, and an active challenge is never forfeited without consent.
with eligible as (
  select
    request.profile_id,
    request.challenge_id,
    coalesce(
      case
        when exists (
          select 1
          from pg_catalog.pg_timezone_names zone
          where zone.name = profile.time_zone
        ) then profile.time_zone
        else null
      end,
      'UTC'
    ) as scoring_time_zone
  from public.challenge_access_requests request
  join public.challenges challenge on challenge.id = request.challenge_id
  join public.profiles profile on profile.id = request.profile_id
  where request.status = 'approved'
    and challenge.visibility = 'private'
    and challenge.status = 'registration'
    and (now() at time zone coalesce(
      case
        when exists (
          select 1
          from pg_catalog.pg_timezone_names zone
          where zone.name = profile.time_zone
        ) then profile.time_zone
        else null
      end,
      'UTC'
    ))::date < challenge.starts_on
    and not exists (
      select 1
      from public.challenge_members member
      where member.profile_id = request.profile_id
        and member.status in ('pending', 'active')
    )
    and not exists (
      select 1
      from public.challenge_join_queue queue
      where queue.profile_id = request.profile_id
        and queue.status in ('queued', 'blocked')
    )
    and (
      challenge.participant_limit is null
      or (
        (select count(*) from public.challenge_members member
          where member.challenge_id = challenge.id
            and member.status in ('pending', 'active'))
        + (select count(*) from public.challenge_join_queue queue
          where queue.challenge_id = challenge.id
            and queue.status in ('queued', 'blocked'))
      ) < challenge.participant_limit
    )
)
insert into public.challenge_join_queue (
  profile_id,
  challenge_id,
  scoring_time_zone,
  allow_auto_switch,
  status,
  queued_at,
  processed_at,
  failure_reason
)
select
  eligible.profile_id,
  eligible.challenge_id,
  eligible.scoring_time_zone,
  false,
  'queued',
  now(),
  null,
  null
from eligible
on conflict do nothing;

comment on function public.review_challenge_join_request(uuid, uuid, boolean) is
  'Reviews a host join request. Safe, conflict-free approvals for future private challenges are placed directly into the start queue.';
