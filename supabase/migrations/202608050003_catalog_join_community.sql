alter table public.profiles
  add column if not exists is_public boolean not null default true;

alter table public.challenges
  add column if not exists category text not null default 'fitness',
  add column if not exists cover_path text,
  add column if not exists join_policy text not null default 'open'
    check (join_policy in ('open', 'approval', 'invite_only')),
  add column if not exists prize_description text,
  add column if not exists rules_summary text not null default '';

create table public.task_catalog (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  category text not null check (category in ('fitness', 'nutrition', 'hydration', 'recovery', 'mindset', 'habits', 'outdoor', 'team')),
  title text not null check (char_length(title) between 2 and 100),
  description text not null default '',
  task_type text not null check (task_type in ('boolean', 'count', 'quantity', 'duration', 'evidence', 'checkpoint')),
  default_target_value numeric,
  default_unit text,
  default_proof_policy public.proof_policy not null default 'none',
  safety_note text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (owner_id, category, title)
);

alter table public.task_definitions
  add column if not exists catalog_task_id uuid references public.task_catalog(id) on delete set null;

create table public.challenge_invites (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6,12}$'),
  created_by uuid not null references public.profiles(id),
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.activity_entries (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references public.challenges(id) on delete cascade,
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('member_joined', 'task_completed', 'perfect_day', 'streak', 'rank_change', 'announcement', 'post')),
  body text check (body is null or char_length(body) <= 2000),
  visibility text not null default 'challenge' check (visibility in ('public', 'challenge')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activity_entries(id) on delete cascade,
  author_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activity_reactions (
  activity_id uuid not null references public.activity_entries(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null default 'cheer' check (reaction in ('cheer')),
  created_at timestamptz not null default now(),
  primary key (activity_id, profile_id, reaction)
);

create table public.profile_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create table public.domain_event_outbox (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  event_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  attempts integer not null default 0
);

create index task_catalog_category_idx on public.task_catalog(category, is_public);
create index challenge_invites_challenge_idx on public.challenge_invites(challenge_id, revoked_at, expires_at);
create index activity_entries_feed_idx on public.activity_entries(created_at desc);
create index activity_entries_challenge_idx on public.activity_entries(challenge_id, created_at desc);
create index domain_event_outbox_pending_idx on public.domain_event_outbox(created_at) where published_at is null;

drop policy if exists "users may request public challenge membership" on public.challenge_members;

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
    generated_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10));
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

create or replace function public.join_challenge(
  target_challenge_id uuid,
  submitted_invite_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_record record;
  existing_membership record;
  invite_record record;
  created_member_id uuid;
  created_status public.member_status;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid()) then raise exception 'Complete your profile before joining'; end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select c.* into challenge_record
  from public.challenges c
  where c.id = target_challenge_id
  for update;

  if not found then raise exception 'Challenge not found'; end if;
  if challenge_record.status <> 'registration' then raise exception 'Challenge is not accepting members'; end if;
  if challenge_record.registration_closes_at is not null and challenge_record.registration_closes_at <= now() then raise exception 'Challenge registration is closed'; end if;

  select cm.* into existing_membership
  from public.challenge_members cm
  where cm.challenge_id = target_challenge_id and cm.profile_id = auth.uid();

  if found then
    if existing_membership.status = 'left' then raise exception 'You withdrew and cannot rejoin this challenge'; end if;
    raise exception 'You already have a membership for this challenge';
  end if;

  if exists (
    select 1 from public.challenge_members cm
    where cm.profile_id = auth.uid() and cm.status in ('pending', 'active')
  ) then raise exception 'Finish or leave your active challenge before joining another'; end if;

  if challenge_record.participant_limit is not null and (
    select count(*) from public.challenge_members cm
    where cm.challenge_id = target_challenge_id and cm.status in ('pending', 'active')
  ) >= challenge_record.participant_limit then raise exception 'Challenge is full'; end if;

  if challenge_record.visibility in ('private', 'unlisted') or challenge_record.join_policy = 'invite_only' then
    if submitted_invite_code is null then raise exception 'A valid invite code is required'; end if;
    select ci.* into invite_record
    from public.challenge_invites ci
    where ci.challenge_id = target_challenge_id
      and ci.code = upper(trim(submitted_invite_code))
      and ci.revoked_at is null
      and (ci.expires_at is null or ci.expires_at > now())
      and (ci.max_uses is null or ci.use_count < ci.max_uses)
    for update;
    if not found then raise exception 'Invite code is invalid or expired'; end if;
  end if;

  created_status := case when challenge_record.join_policy = 'approval' then 'pending'::public.member_status else 'active'::public.member_status end;

  insert into public.challenge_members (challenge_id, profile_id, role, status, joined_at, prize_eligible)
  values (target_challenge_id, auth.uid(), 'participant', created_status, case when created_status = 'active' then now() else null end, true)
  returning id into created_member_id;

  if invite_record.id is not null then
    update public.challenge_invites set use_count = use_count + 1 where id = invite_record.id;
  end if;

  if created_status = 'active' then
    insert into public.activity_entries (challenge_id, actor_profile_id, event_type, visibility, metadata)
    values (target_challenge_id, auth.uid(), 'member_joined', 'challenge', jsonb_build_object('memberId', created_member_id));
  end if;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'challenge:' || target_challenge_id::text || ':activity',
    case when created_status = 'active' then 'member.joined' else 'member.requested' end,
    target_challenge_id,
    jsonb_build_object('challengeId', target_challenge_id, 'memberId', created_member_id, 'profileId', auth.uid(), 'status', created_status)
  );

  return created_member_id;
end;
$$;

create or replace function public.leave_challenge(target_challenge_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_membership_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  update public.challenge_members
  set status = 'left', prize_eligible = false, withdrawn_at = now(), forfeiture_reason = 'voluntary_withdrawal'
  where challenge_id = target_challenge_id and profile_id = auth.uid() and status in ('pending', 'active')
  returning id into target_membership_id;

  if target_membership_id is null then raise exception 'Open challenge membership not found'; end if;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values ('challenge:' || target_challenge_id::text || ':activity', 'member.withdrawn', target_challenge_id,
    jsonb_build_object('challengeId', target_challenge_id, 'memberId', target_membership_id, 'profileId', auth.uid(), 'prizeEligible', false));

  return target_membership_id;
end;
$$;

revoke all on function public.create_challenge_invite(uuid, integer, timestamptz) from public;
revoke all on function public.join_challenge(uuid, text) from public;
revoke all on function public.leave_challenge(uuid) from public;
grant execute on function public.create_challenge_invite(uuid, integer, timestamptz) to authenticated;
grant execute on function public.join_challenge(uuid, text) to authenticated;
grant execute on function public.leave_challenge(uuid) to authenticated;

alter table public.task_catalog enable row level security;
alter table public.challenge_invites enable row level security;
alter table public.activity_entries enable row level security;
alter table public.activity_comments enable row level security;
alter table public.activity_reactions enable row level security;
alter table public.profile_follows enable row level security;
alter table public.domain_event_outbox enable row level security;

drop policy if exists "profiles are visible to self and challenge peers" on public.profiles;
create policy "profiles are visible when public, self, or challenge peers" on public.profiles for select using (
  is_public or id = auth.uid() or exists (
    select 1 from public.challenge_members mine
    join public.challenge_members peer on peer.challenge_id = mine.challenge_id
    where mine.profile_id = auth.uid() and mine.status = 'active' and peer.profile_id = profiles.id and peer.status in ('active', 'completed')
  )
);

create policy "task catalog is readable when public or owned" on public.task_catalog for select using (is_public or owner_id = auth.uid());
create policy "creators add custom catalog tasks" on public.task_catalog for insert to authenticated with check (owner_id = auth.uid());
create policy "creators update custom catalog tasks" on public.task_catalog for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "challenge managers read invites" on public.challenge_invites for select to authenticated using (
  exists (select 1 from public.challenges c where c.id = challenge_id and (c.owner_id = auth.uid() or public.has_challenge_role(c.id, array['owner','moderator']::public.member_role[])))
);
create policy "visible activity is readable" on public.activity_entries for select using (visibility = 'public' or (challenge_id is not null and public.is_challenge_member(challenge_id)) or actor_profile_id = auth.uid());
create policy "members create posts" on public.activity_entries for insert to authenticated with check (actor_profile_id = auth.uid() and (challenge_id is null or public.is_challenge_member(challenge_id)));
create policy "visible activity comments are readable" on public.activity_comments for select using (exists (select 1 from public.activity_entries ae where ae.id = activity_id and (ae.visibility = 'public' or (ae.challenge_id is not null and public.is_challenge_member(ae.challenge_id)))));
create policy "users comment as themselves" on public.activity_comments for insert to authenticated with check (author_profile_id = auth.uid() and exists (select 1 from public.activity_entries ae where ae.id = activity_id and (ae.visibility = 'public' or (ae.challenge_id is not null and public.is_challenge_member(ae.challenge_id)))));
create policy "authors update comments" on public.activity_comments for update to authenticated using (author_profile_id = auth.uid()) with check (author_profile_id = auth.uid());
create policy "visible activity reactions are readable" on public.activity_reactions for select using (exists (select 1 from public.activity_entries ae where ae.id = activity_id and (ae.visibility = 'public' or (ae.challenge_id is not null and public.is_challenge_member(ae.challenge_id)))));
create policy "users add their own reactions" on public.activity_reactions for insert to authenticated with check (profile_id = auth.uid());
create policy "users remove their own reactions" on public.activity_reactions for delete to authenticated using (profile_id = auth.uid());
create policy "follows are readable" on public.profile_follows for select using (follower_id = auth.uid() or followed_id = auth.uid());
create policy "users follow as themselves" on public.profile_follows for insert to authenticated with check (follower_id = auth.uid());
create policy "users unfollow as themselves" on public.profile_follows for delete to authenticated using (follower_id = auth.uid());

grant select, insert, update on public.task_catalog to authenticated;
grant select on public.challenge_invites to authenticated;
grant select, insert on public.activity_entries to authenticated;
grant select, insert, update on public.activity_comments to authenticated;
grant select, insert, delete on public.activity_reactions, public.profile_follows to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "users upload their avatar" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users update their avatar" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete their avatar" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

insert into public.task_catalog (owner_id, category, title, description, task_type, default_target_value, default_unit, default_proof_policy, safety_note, is_public)
values
  (null,'fitness','Complete a workout','Complete the challenge-defined workout.','duration',45,'minutes','optional','Choose an intensity appropriate for your current ability.',true),
  (null,'fitness','Morning mobility','Complete a guided mobility or stretching session.','duration',10,'minutes','none',null,true),
  (null,'fitness','Daily steps','Reach the daily step target.','count',10000,'steps','optional',null,true),
  (null,'fitness','Strength session','Complete a strength-focused training session.','duration',45,'minutes','optional','Use safe form and appropriate resistance.',true),
  (null,'fitness','Cardio session','Complete a cardio-focused training session.','duration',30,'minutes','optional','Stop if you feel pain, dizziness, or unusual shortness of breath.',true),
  (null,'fitness','Core work','Complete focused core training.','duration',10,'minutes','none',null,true),
  (null,'nutrition','Follow your meal plan','Stay within the meal plan defined by the challenge.','boolean',null,null,'none',null,true),
  (null,'nutrition','Eat five servings of produce','Log five servings of fruits or vegetables.','count',5,'servings','none',null,true),
  (null,'nutrition','Hit protein target','Reach the challenge-defined protein goal.','quantity',100,'grams','optional',null,true),
  (null,'nutrition','No added sugar','Avoid food and drinks with added sugar today.','boolean',null,null,'none',null,true),
  (null,'nutrition','Prepare tomorrow’s meals','Prepare or plan meals for the next day.','boolean',null,null,'optional',null,true),
  (null,'hydration','Daily water target','Reach the challenge-defined water target.','quantity',100,'ounces','none','Hydration needs vary. Do not force excessive water intake.',true),
  (null,'hydration','Morning water','Drink water after waking.','quantity',16,'ounces','none',null,true),
  (null,'recovery','Sleep target','Meet the challenge-defined sleep duration.','duration',8,'hours','optional',null,true),
  (null,'recovery','Screen-free wind down','Avoid screens before bed.','duration',30,'minutes','none',null,true),
  (null,'recovery','Recovery session','Complete stretching, mobility, or other recovery work.','duration',20,'minutes','optional',null,true),
  (null,'mindset','Read ten pages','Read ten pages from a selected book.','count',10,'pages','optional',null,true),
  (null,'mindset','Meditate','Complete a meditation or breathing session.','duration',10,'minutes','none',null,true),
  (null,'mindset','Daily journal','Write a short reflection for the day.','boolean',null,null,'optional',null,true),
  (null,'mindset','Gratitude practice','Record three things you are grateful for.','count',3,'entries','none',null,true),
  (null,'habits','Make your bed','Complete the habit after waking.','boolean',null,null,'none',null,true),
  (null,'habits','Plan tomorrow','Write the next day’s top priorities.','boolean',null,null,'none',null,true),
  (null,'outdoor','Outdoor activity','Spend intentional time moving outdoors.','duration',30,'minutes','optional','Plan for weather and local conditions.',true),
  (null,'team','Encourage a teammate','Leave a meaningful cheer or comment for another participant.','boolean',null,null,'none',null,true)
on conflict do nothing;
