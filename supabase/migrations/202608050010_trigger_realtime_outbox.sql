create or replace function public.trigger_realtime_outbox_relay()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_url text;
  relay_secret text;
begin
  select decrypted_secret
  into project_url
  from vault.decrypted_secrets
  where name = 'shipshape_project_url'
  order by created_at desc
  limit 1;

  select decrypted_secret
  into relay_secret
  from vault.decrypted_secrets
  where name = 'shipshape_outbox_relay_secret'
  order by created_at desc
  limit 1;

  -- Local and preview databases may intentionally have no hosted relay secrets.
  if project_url is null or relay_secret is null then
    return null;
  end if;

  -- pg_net queues the request transactionally and sends it immediately after commit.
  -- One request per INSERT statement lets a single relay claim the entire event batch.
  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/relay-realtime-outbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-outbox-secret', relay_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );

  return null;
end;
$$;

revoke all on function public.trigger_realtime_outbox_relay() from public, anon, authenticated;

drop trigger if exists trigger_realtime_outbox_relay on public.domain_event_outbox;

create trigger trigger_realtime_outbox_relay
after insert on public.domain_event_outbox
for each statement
execute function public.trigger_realtime_outbox_relay();

comment on function public.trigger_realtime_outbox_relay() is
  'Immediately queues the Ably outbox relay after an outbox INSERT commits.';

comment on trigger trigger_realtime_outbox_relay on public.domain_event_outbox is
  'Primary realtime delivery path. The one-minute cron job is retry recovery only.';
