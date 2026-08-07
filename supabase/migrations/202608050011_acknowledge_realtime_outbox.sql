create or replace function public.complete_realtime_outbox_event(
  p_event_id uuid,
  p_lease_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with completed as (
    update public.domain_event_outbox
    set published_at = clock_timestamp(),
        lease_id = null,
        leased_at = null
    where id = p_event_id
      and lease_id = p_lease_id
      and published_at is null
    returning id
  )
  select exists(select 1 from completed);
$$;

create or replace function public.release_realtime_outbox_event(
  p_event_id uuid,
  p_lease_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with released as (
    update public.domain_event_outbox
    set lease_id = null,
        leased_at = null
    where id = p_event_id
      and lease_id = p_lease_id
      and published_at is null
    returning id
  )
  select exists(select 1 from released);
$$;

revoke all on function public.complete_realtime_outbox_event(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_realtime_outbox_event(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_realtime_outbox_event(uuid, uuid) to service_role;
grant execute on function public.release_realtime_outbox_event(uuid, uuid) to service_role;

comment on function public.complete_realtime_outbox_event(uuid, uuid) is
  'Atomically acknowledges a published outbox event only for its active lease.';

comment on function public.release_realtime_outbox_event(uuid, uuid) is
  'Releases a failed outbox event lease so the recovery relay can retry it.';
