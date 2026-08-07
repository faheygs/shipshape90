alter table public.challenges
  alter column owner_id drop not null;

alter table public.challenges
  drop constraint challenges_owner_id_fkey,
  add constraint challenges_owner_id_fkey
    foreign key (owner_id) references public.profiles(id) on delete set null;

alter table public.challenge_invites
  alter column created_by drop not null;

alter table public.challenge_invites
  drop constraint challenge_invites_created_by_fkey,
  add constraint challenge_invites_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

create or replace function public.has_enabled_push_device()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.push_devices device
    where device.profile_id = auth.uid()
      and device.enabled
  );
$$;

create or replace function public.disable_all_push_devices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  disabled_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  update public.push_devices device
  set enabled = false, updated_at = now()
  where device.profile_id = auth.uid()
    and device.enabled;

  get diagnostics disabled_count = row_count;
  return disabled_count;
end;
$$;

create or replace function public.prepare_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owned_challenge record;
  active_membership record;
  closed_count integer := 0;
  forfeited_count integer := 0;
  user_id uuid := auth.uid();
begin
  if user_id is null then raise exception 'Authentication required'; end if;

  for owned_challenge in
    select challenge.id, challenge.status
    from public.challenges challenge
    where challenge.owner_id = user_id
      and challenge.status not in ('complete', 'archived')
    order by challenge.created_at
  loop
    perform public.close_owned_challenge(
      owned_challenge.id,
      case when owned_challenge.status in ('draft', 'registration') then 'cancel' else 'end' end
    );
    closed_count := closed_count + 1;
  end loop;

  for active_membership in
    select member.challenge_id
    from public.challenge_members member
    where member.profile_id = user_id
      and member.status = 'active'
      and not exists (
        select 1 from public.challenges challenge
        where challenge.id = member.challenge_id
          and challenge.owner_id = user_id
      )
  loop
    perform public.leave_challenge(active_membership.challenge_id);
    forfeited_count := forfeited_count + 1;
  end loop;

  update public.challenge_join_queue queue
  set status = 'failed',
      processed_at = now(),
      failure_reason = 'Account deleted'
  where queue.profile_id = user_id
    and queue.status in ('queued', 'blocked');

  delete from public.domain_event_outbox event
  where event.topic like 'user:' || user_id::text || ':%';

  update public.domain_event_outbox event
  set payload = event.payload - 'profileId' - 'memberId' - 'applicantHandle' - 'applicantName'
  where event.payload ->> 'profileId' = user_id::text;

  return jsonb_build_object(
    'closedOwnedChallenges', closed_count,
    'forfeitedMemberships', forfeited_count
  );
end;
$$;

revoke all on function public.has_enabled_push_device() from public, anon, authenticated;
revoke all on function public.disable_all_push_devices() from public, anon, authenticated;
revoke all on function public.prepare_account_deletion() from public, anon, authenticated;

grant execute on function public.has_enabled_push_device() to authenticated;
grant execute on function public.disable_all_push_devices() to authenticated;
grant execute on function public.prepare_account_deletion() to authenticated;

comment on function public.prepare_account_deletion() is
  'Closes challenges owned by the authenticated member and forfeits active participation before permanent account deletion.';
