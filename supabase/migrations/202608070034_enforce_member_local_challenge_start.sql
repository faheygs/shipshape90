create or replace function public.enforce_member_local_challenge_start()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_start date;
  member_zone text;
begin
  if new.role = 'owner' or new.status not in ('pending', 'active') then
    return new;
  end if;

  select challenge.starts_on
  into challenge_start
  from public.challenges challenge
  where challenge.id = new.challenge_id;

  select coalesce(
    (
      select profile.time_zone
      from public.profiles profile
      where profile.id = new.profile_id
        and exists (
          select 1
          from pg_catalog.pg_timezone_names zone
          where zone.name = profile.time_zone
        )
    ),
    'UTC'
  ) into member_zone;

  if (now() at time zone member_zone)::date < challenge_start then
    raise exception 'This challenge has not started in your timezone; save or queue it instead';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_member_local_challenge_start_before_membership
on public.challenge_members;

create trigger enforce_member_local_challenge_start_before_membership
before insert or update of challenge_id, profile_id, role, status
on public.challenge_members
for each row execute function public.enforce_member_local_challenge_start();

revoke all on function public.enforce_member_local_challenge_start() from public, anon, authenticated;

comment on function public.enforce_member_local_challenge_start() is
  'Prevents participant membership before the challenge start date in that member locked timezone; owners may publish upcoming challenges.';
