create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'shipshape-realtime-outbox-relay';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'shipshape-realtime-outbox-relay',
    '* * * * *',
    $job$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'shipshape_project_url'
        ) || '/functions/v1/relay-realtime-outbox',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-outbox-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'shipshape_outbox_relay_secret'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      ) as request_id;
    $job$
  );
end;
$$;
