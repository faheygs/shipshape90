create or replace function public.list_challenges()
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
  prize_description text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.slug,
    c.name,
    c.description,
    c.category,
    c.visibility,
    c.join_policy,
    c.starts_on,
    c.ends_on,
    count(cm.id) filter (where cm.status in ('pending', 'active', 'completed')) as participant_count,
    coalesce(max(mine.status::text), 'none') as membership_status,
    c.cover_path,
    c.prize_description
  from public.challenges c
  left join public.challenge_members cm on cm.challenge_id = c.id
  left join public.challenge_members mine on mine.challenge_id = c.id and mine.profile_id = auth.uid()
  where c.visibility = 'public'
     or c.owner_id = auth.uid()
     or mine.id is not null
  group by c.id
  order by
    case when max(mine.status::text) = 'active' then 0 else 1 end,
    c.starts_on,
    c.created_at desc;
$$;

create or replace function public.resolve_challenge_invite(submitted_invite_code text)
returns table (
  challenge_id uuid,
  name text,
  description text,
  category text,
  starts_on date,
  ends_on date,
  participant_count bigint,
  cover_path text,
  prize_description text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.description,
    c.category,
    c.starts_on,
    c.ends_on,
    count(cm.id) filter (where cm.status in ('pending', 'active', 'completed')) as participant_count,
    c.cover_path,
    c.prize_description
  from public.challenge_invites ci
  join public.challenges c on c.id = ci.challenge_id
  left join public.challenge_members cm on cm.challenge_id = c.id
  where ci.code = upper(trim(submitted_invite_code))
    and ci.revoked_at is null
    and (ci.expires_at is null or ci.expires_at > now())
    and (ci.max_uses is null or ci.use_count < ci.max_uses)
    and c.status = 'registration'
  group by c.id;
$$;

revoke all on function public.list_challenges() from public;
revoke all on function public.resolve_challenge_invite(text) from public;
grant execute on function public.list_challenges() to anon, authenticated;
grant execute on function public.resolve_challenge_invite(text) to authenticated;
