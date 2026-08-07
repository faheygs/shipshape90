create or replace function public.process_challenge_lifecycle()
returns table (activated_count integer, completed_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_record record;
  activated_total integer := 0;
  completed_total integer := 0;
begin
  for challenge_record in
    select challenge.id
    from public.challenges challenge
    where challenge.status = 'registration'
      and (now() at time zone challenge.time_zone)::date >= challenge.starts_on
    order by challenge.starts_on, challenge.created_at
    for update skip locked
  loop
    update public.challenges challenge
    set status = 'active', updated_at = now()
    where challenge.id = challenge_record.id
      and challenge.status = 'registration';
    if found then activated_total := activated_total + 1; end if;
  end loop;

  for challenge_record in
    select challenge.id, challenge.ends_on
    from public.challenges challenge
    where challenge.status = 'active'
      and (now() at time zone challenge.time_zone)::date > challenge.ends_on
      and not exists (
        select 1
        from public.challenge_members member
        where member.challenge_id = challenge.id
          and member.status = 'active'
          and (now() at time zone member.scoring_time_zone)::date <= challenge.ends_on
      )
    order by challenge.ends_on, challenge.created_at
    for update skip locked
  loop
    update public.challenges challenge
    set status = 'complete', updated_at = now()
    where challenge.id = challenge_record.id
      and challenge.status = 'active';

    if found then
      update public.challenge_members member
      set status = case
            when member.status = 'active' then 'completed'::public.member_status
            else 'removed'::public.member_status
          end,
          prize_eligible = case when member.status = 'active' then member.prize_eligible else false end,
          withdrawn_at = case when member.status = 'pending' then now() else member.withdrawn_at end,
          forfeiture_reason = case
            when member.status = 'pending' then 'challenge_ended_before_approval'
            else member.forfeiture_reason
          end
      where member.challenge_id = challenge_record.id
        and member.status in ('pending', 'active');

      update public.challenge_join_queue queue
      set status = 'failed', processed_at = now(), failure_reason = 'Challenge ended'
      where queue.challenge_id = challenge_record.id
        and queue.status in ('queued', 'blocked');

      completed_total := completed_total + 1;
    end if;
  end loop;

  return query select activated_total, completed_total;
end;
$$;

revoke all on function public.process_challenge_lifecycle() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'shipshape-process-challenge-lifecycle';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'shipshape-process-challenge-lifecycle',
    '* * * * *',
    $job$select public.process_challenge_lifecycle();$job$
  );
end;
$$;

comment on function public.process_challenge_lifecycle() is
  'Activates challenges at their canonical start boundary and completes them only after every active member timezone has passed the final day.';
