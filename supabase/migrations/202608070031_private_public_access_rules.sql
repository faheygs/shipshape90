create or replace function public.normalize_challenge_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visibility = 'public' then
    new.join_policy := 'open';
  elsif new.visibility = 'private' then
    new.join_policy := 'approval';
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_challenge_access_before_write on public.challenges;
create trigger normalize_challenge_access_before_write
before insert or update of visibility, join_policy on public.challenges
for each row execute function public.normalize_challenge_access();

create or replace function public.ensure_private_challenge_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_code text;
begin
  if new.visibility <> 'private' or exists (
    select 1
    from public.challenge_invites invite
    where invite.challenge_id = new.id
      and invite.revoked_at is null
      and (invite.expires_at is null or invite.expires_at > now())
      and (invite.max_uses is null or invite.use_count < invite.max_uses)
  ) then
    return new;
  end if;

  loop
    generated_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));
    begin
      insert into public.challenge_invites (challenge_id, code, created_by)
      values (new.id, generated_code, new.owner_id);
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists ensure_private_challenge_code_after_write on public.challenges;
create trigger ensure_private_challenge_code_after_write
after insert or update of visibility on public.challenges
for each row execute function public.ensure_private_challenge_code();

update public.challenges
set join_policy = case when visibility = 'public' then 'open' else 'approval' end,
    updated_at = now()
where visibility in ('public', 'private')
  and join_policy is distinct from case when visibility = 'public' then 'open' else 'approval' end;

do $$
declare
  challenge_record record;
  generated_code text;
begin
  for challenge_record in
    select challenge.id, challenge.owner_id
    from public.challenges challenge
    where challenge.visibility = 'private'
      and not exists (
        select 1
        from public.challenge_invites invite
        where invite.challenge_id = challenge.id
          and invite.revoked_at is null
          and (invite.expires_at is null or invite.expires_at > now())
          and (invite.max_uses is null or invite.use_count < invite.max_uses)
      )
  loop
    loop
      generated_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));
      begin
        insert into public.challenge_invites (challenge_id, code, created_by)
        values (challenge_record.id, generated_code, challenge_record.owner_id);
        exit;
      exception when unique_violation then
        null;
      end;
    end loop;
  end loop;
end;
$$;

update public.challenge_members member
set status = 'active',
    joined_at = coalesce(member.joined_at, now()),
    prize_eligible = true,
    withdrawn_at = null,
    forfeiture_reason = null
from public.challenges challenge
where challenge.id = member.challenge_id
  and challenge.visibility = 'public'
  and member.status = 'pending';

revoke all on function public.normalize_challenge_access() from public, anon, authenticated;
revoke all on function public.ensure_private_challenge_code() from public, anon, authenticated;

comment on function public.normalize_challenge_access() is
  'Enforces open joining for public challenges and code-plus-approval joining for private challenges.';
comment on function public.ensure_private_challenge_code() is
  'Creates the single permanent access code attached to a private challenge.';
