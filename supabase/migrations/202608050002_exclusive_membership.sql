alter table public.challenge_members
  add column if not exists prize_eligible boolean not null default true,
  add column if not exists withdrawn_at timestamptz,
  add column if not exists forfeiture_reason text;

create unique index if not exists one_open_challenge_per_profile_idx
  on public.challenge_members (profile_id)
  where status in ('pending', 'active');

create or replace function public.enforce_membership_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'left' and new.status <> 'left' then
    raise exception 'A withdrawn member cannot rejoin this challenge';
  end if;

  if old.status = 'completed' and new.status in ('pending', 'active') then
    raise exception 'A completed membership cannot be reopened';
  end if;

  if old.prize_eligible = false and new.prize_eligible = true then
    raise exception 'Prize eligibility cannot be restored';
  end if;

  if new.status = 'left' and old.status <> 'left' then
    new.prize_eligible := false;
    new.withdrawn_at := coalesce(new.withdrawn_at, now());
    new.forfeiture_reason := coalesce(new.forfeiture_reason, 'voluntary_withdrawal');
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_membership_lifecycle_trigger on public.challenge_members;
create trigger enforce_membership_lifecycle_trigger
before update on public.challenge_members
for each row execute function public.enforce_membership_lifecycle();

create or replace function public.leave_challenge(target_challenge_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_membership_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.challenge_members
  set
    status = 'left',
    prize_eligible = false,
    withdrawn_at = now(),
    forfeiture_reason = 'voluntary_withdrawal'
  where challenge_id = target_challenge_id
    and profile_id = auth.uid()
    and status in ('pending', 'active')
  returning id into target_membership_id;

  if target_membership_id is null then
    raise exception 'Open challenge membership not found';
  end if;

  return target_membership_id;
end;
$$;

revoke all on function public.leave_challenge(uuid) from public;
grant execute on function public.leave_challenge(uuid) to authenticated;
