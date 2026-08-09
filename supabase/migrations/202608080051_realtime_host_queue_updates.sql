create or replace function public.publish_challenge_queue_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_challenge_id uuid := coalesce(new.challenge_id, old.challenge_id);
  affected_profile_id uuid := coalesce(new.profile_id, old.profile_id);
  next_status text := case when tg_op = 'DELETE' then 'removed' else new.status end;
begin
  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'challenge:' || affected_challenge_id::text || ':activity',
    case tg_op
      when 'INSERT' then 'challenge.queue_added'
      when 'UPDATE' then 'challenge.queue_updated'
      else 'challenge.queue_removed'
    end,
    affected_challenge_id,
    jsonb_build_object(
      'version', 1,
      'challengeId', affected_challenge_id,
      'profileId', affected_profile_id,
      'status', next_status
    )
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.publish_challenge_queue_change() from public, anon, authenticated;

drop trigger if exists publish_challenge_queue_change_after_write on public.challenge_join_queue;
create trigger publish_challenge_queue_change_after_write
after insert or update or delete on public.challenge_join_queue
for each row execute function public.publish_challenge_queue_change();

comment on function public.publish_challenge_queue_change() is
  'Publishes every queue mutation to the owning challenge channel for immediate host updates.';
