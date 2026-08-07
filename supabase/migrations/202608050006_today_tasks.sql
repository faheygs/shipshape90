create or replace function public.list_today_tasks(
  target_challenge_id uuid,
  requested_local_date date default current_date
)
returns table (
  occurrence_id uuid,
  task_definition_id uuid,
  title text,
  instructions text,
  task_type text,
  target_value numeric,
  unit text,
  points integer,
  proof_policy public.proof_policy,
  status public.occurrence_status,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  active_member_id uuid;
  challenge_record record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select cm.id
  into active_member_id
  from public.challenge_members cm
  where cm.challenge_id = target_challenge_id
    and cm.profile_id = auth.uid()
    and cm.status in ('active', 'completed');

  if active_member_id is null then raise exception 'Active membership required'; end if;

  select c.status, c.starts_on, c.ends_on, c.rules_version
  into challenge_record
  from public.challenges c
  where c.id = target_challenge_id;

  if not found then raise exception 'Challenge not found'; end if;
  if requested_local_date < challenge_record.starts_on or requested_local_date > challenge_record.ends_on then
    return;
  end if;

  if challenge_record.status = 'active' then
    insert into public.task_occurrences (challenge_id, member_id, task_definition_id, local_date)
    select target_challenge_id, active_member_id, td.id, requested_local_date
    from public.task_definitions td
    where td.challenge_id = target_challenge_id
      and td.rules_version = challenge_record.rules_version
      and td.schedule ->> 'kind' = 'daily'
    on conflict (member_id, task_definition_id, local_date) do nothing;
  end if;

  return query
  select o.id, td.id, td.title, td.instructions, td.task_type, td.target_value,
         td.unit, td.points, td.proof_policy, o.status, o.completed_at
  from public.task_occurrences o
  join public.task_definitions td on td.id = o.task_definition_id
  where o.member_id = active_member_id
    and o.challenge_id = target_challenge_id
    and o.local_date = requested_local_date
  order by td.ordinal;
end;
$$;

revoke all on function public.list_today_tasks(uuid, date) from public;
grant execute on function public.list_today_tasks(uuid, date) to authenticated;
