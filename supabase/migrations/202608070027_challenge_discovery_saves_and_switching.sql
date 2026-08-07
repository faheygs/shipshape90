create table if not exists public.challenge_saves (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, challenge_id)
);

alter table public.challenge_saves enable row level security;

drop policy if exists "users read their saved challenges" on public.challenge_saves;
create policy "users read their saved challenges"
on public.challenge_saves for select to authenticated
using (profile_id = auth.uid());

drop policy if exists "users save challenges" on public.challenge_saves;
create policy "users save challenges"
on public.challenge_saves for insert to authenticated
with check (profile_id = auth.uid());

drop policy if exists "users remove saved challenges" on public.challenge_saves;
create policy "users remove saved challenges"
on public.challenge_saves for delete to authenticated
using (profile_id = auth.uid());

grant select, insert, delete on public.challenge_saves to authenticated;

create or replace function public.set_challenge_saved(
  target_challenge_id uuid,
  should_save boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.challenges challenge
    where challenge.id = target_challenge_id
      and (challenge.visibility = 'public' or challenge.owner_id = auth.uid())
  ) then raise exception 'Challenge not found'; end if;

  if should_save then
    insert into public.challenge_saves (profile_id, challenge_id)
    values (auth.uid(), target_challenge_id)
    on conflict (profile_id, challenge_id) do nothing;
  else
    delete from public.challenge_saves saved
    where saved.profile_id = auth.uid()
      and saved.challenge_id = target_challenge_id;
  end if;

  return should_save;
end;
$$;

revoke all on function public.set_challenge_saved(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_challenge_saved(uuid, boolean) to authenticated;

drop function if exists public.list_challenges();
create function public.list_challenges()
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  category text,
  visibility public.challenge_visibility,
  join_policy text,
  starts_on date,
  ends_on date,
  participant_count bigint,
  membership_status text,
  cover_path text,
  prize_description text,
  scoring_method text,
  bonus_metric text,
  bonus_calculation text,
  is_saved boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    challenge.id,
    challenge.slug,
    challenge.name,
    challenge.description,
    challenge.category,
    challenge.visibility,
    challenge.join_policy,
    challenge.starts_on,
    challenge.ends_on,
    count(member.id) filter (
      where member.status in ('pending', 'active', 'completed')
    ) as participant_count,
    coalesce(max(mine.status::text), 'none') as membership_status,
    challenge.cover_path,
    challenge.prize_description,
    'total_points'::text as scoring_method,
    coalesce(rules.bonus_metric, 'none') as bonus_metric,
    rules.bonus_calculation,
    bool_or(saved.profile_id is not null) as is_saved
  from public.challenges challenge
  left join public.challenge_members member
    on member.challenge_id = challenge.id
  left join public.challenge_members mine
    on mine.challenge_id = challenge.id
   and mine.profile_id = auth.uid()
  left join public.winner_rules rules
    on rules.challenge_id = challenge.id
   and rules.rules_version = challenge.rules_version
  left join public.challenge_saves saved
    on saved.challenge_id = challenge.id
   and saved.profile_id = auth.uid()
  where challenge.visibility = 'public'
     or challenge.owner_id = auth.uid()
     or mine.id is not null
  group by challenge.id, rules.bonus_metric, rules.bonus_calculation
  order by
    case when max(mine.status::text) = 'active' then 0 else 1 end,
    challenge.starts_on,
    challenge.created_at desc;
$$;

revoke all on function public.list_challenges() from public, anon, authenticated;
grant execute on function public.list_challenges() to anon, authenticated;

create or replace function public.switch_challenge(
  target_challenge_id uuid,
  submitted_invite_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_membership record;
  joined_member_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select member.challenge_id, challenge.name
  into current_membership
  from public.challenge_members member
  join public.challenges challenge on challenge.id = member.challenge_id
  where member.profile_id = auth.uid()
    and member.challenge_id <> target_challenge_id
    and member.status in ('pending', 'active')
  for update of member;

  if current_membership.challenge_id is null then
    raise exception 'There is no current challenge to switch from';
  end if;

  perform public.leave_challenge(current_membership.challenge_id);

  update public.challenge_members
  set forfeiture_reason = 'switched_challenge'
  where challenge_id = current_membership.challenge_id
    and profile_id = auth.uid()
    and status = 'left';

  select public.join_challenge(target_challenge_id, submitted_invite_code)
  into joined_member_id;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'user:' || auth.uid()::text || ':notifications',
    'member.challenge_switched',
    target_challenge_id,
    jsonb_build_object(
      'version', 1,
      'profileId', auth.uid(),
      'fromChallengeId', current_membership.challenge_id,
      'fromChallengeName', current_membership.name,
      'toChallengeId', target_challenge_id,
      'memberId', joined_member_id
    )
  );

  return joined_member_id;
end;
$$;

revoke all on function public.switch_challenge(uuid, text) from public, anon, authenticated;
grant execute on function public.switch_challenge(uuid, text) to authenticated;

comment on table public.challenge_saves is
  'Challenges a member is considering; saving does not create membership or prize eligibility.';
comment on function public.switch_challenge(uuid, text) is
  'Atomically forfeits the current membership and joins the target, rolling back the forfeiture if joining fails.';
