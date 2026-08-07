create or replace function public.create_challenge_invite(
  target_challenge_id uuid,
  target_max_uses integer default null,
  target_expires_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.challenges c
    where c.id = target_challenge_id
      and (c.owner_id = auth.uid() or public.has_challenge_role(c.id, array['owner','moderator']::public.member_role[]))
  ) then raise exception 'Challenge management permission required'; end if;
  if target_max_uses is not null and target_max_uses <= 0 then raise exception 'Invalid invite use limit'; end if;
  if target_expires_at is not null and target_expires_at <= now() then raise exception 'Invite expiry must be in the future'; end if;

  loop
    generated_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));
    begin
      insert into public.challenge_invites (challenge_id, code, created_by, max_uses, expires_at)
      values (target_challenge_id, generated_code, auth.uid(), target_max_uses, target_expires_at);
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  return generated_code;
end;
$$;

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
    on conflict on constraint task_occurrences_member_id_task_definition_id_local_date_key do nothing;
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

revoke all on function public.create_challenge_invite(uuid, integer, timestamptz) from public;
revoke all on function public.list_today_tasks(uuid, date) from public;
grant execute on function public.create_challenge_invite(uuid, integer, timestamptz) to authenticated;
grant execute on function public.list_today_tasks(uuid, date) to authenticated;
