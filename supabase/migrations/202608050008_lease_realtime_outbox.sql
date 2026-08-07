alter table public.domain_event_outbox
  add column lease_id uuid,
  add column leased_at timestamptz;

create or replace function public.claim_realtime_outbox_events(batch_size integer default 100)
returns table (
  id uuid,
  topic text,
  event_type text,
  payload jsonb,
  attempts integer,
  lease_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_lease_id uuid := gen_random_uuid();
begin
  if batch_size < 1 or batch_size > 500 then
    raise exception 'batch_size must be between 1 and 500';
  end if;

  return query
  with claimable as (
    select event.id
    from public.domain_event_outbox event
    where event.published_at is null
      and (event.leased_at is null or event.leased_at < now() - interval '5 minutes')
    order by event.created_at
    for update skip locked
    limit batch_size
  ), claimed as (
    update public.domain_event_outbox event
    set lease_id = current_lease_id,
        leased_at = now(),
        attempts = event.attempts + 1
    from claimable
    where event.id = claimable.id
    returning event.id, event.topic, event.event_type, event.payload, event.attempts, event.lease_id
  )
  select claimed.id, claimed.topic, claimed.event_type, claimed.payload, claimed.attempts, claimed.lease_id
  from claimed;
end;
$$;

revoke all on function public.claim_realtime_outbox_events(integer) from public, anon, authenticated;
grant execute on function public.claim_realtime_outbox_events(integer) to service_role;
