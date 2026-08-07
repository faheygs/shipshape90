create extension if not exists pgcrypto;

create type public.challenge_visibility as enum ('public', 'unlisted', 'private');
create type public.challenge_status as enum ('draft', 'registration', 'active', 'review', 'complete', 'archived');
create type public.member_role as enum ('owner', 'moderator', 'participant');
create type public.member_status as enum ('pending', 'active', 'left', 'removed', 'completed');
create type public.occurrence_status as enum ('pending', 'complete', 'missed', 'excused', 'pending_review');
create type public.proof_policy as enum ('none', 'optional', 'required');
create type public.ledger_entry_type as enum ('task_complete', 'perfect_day', 'streak_bonus', 'missed_penalty', 'manual_adjustment');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 60),
  handle text unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  avatar_path text,
  time_zone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '',
  visibility public.challenge_visibility not null default 'private',
  status public.challenge_status not null default 'draft',
  starts_on date not null,
  ends_on date not null,
  registration_closes_at timestamptz,
  time_zone text not null default 'UTC',
  participant_limit integer check (participant_limit is null or participant_limit > 1),
  rules_version integer not null default 1 check (rules_version > 0),
  rules_locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.challenge_members (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'participant',
  status public.member_status not null default 'pending',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (challenge_id, profile_id)
);

create table public.task_definitions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  rules_version integer not null check (rules_version > 0),
  ordinal integer not null check (ordinal >= 0),
  title text not null check (char_length(title) between 2 and 100),
  instructions text not null default '',
  task_type text not null check (task_type in ('boolean', 'count', 'quantity', 'duration', 'evidence', 'checkpoint')),
  target_value numeric,
  unit text,
  points integer not null default 1,
  required boolean not null default true,
  proof_policy public.proof_policy not null default 'none',
  schedule jsonb not null,
  created_at timestamptz not null default now(),
  unique (challenge_id, rules_version, ordinal)
);

create table public.task_occurrences (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  member_id uuid not null references public.challenge_members(id) on delete cascade,
  task_definition_id uuid not null references public.task_definitions(id),
  local_date date not null,
  due_at timestamptz,
  status public.occurrence_status not null default 'pending',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (member_id, task_definition_id, local_date)
);

create table public.evidence_assets (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  member_id uuid not null references public.challenge_members(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image', 'video', 'document', 'text')),
  visibility text not null default 'private' check (visibility in ('private', 'moderators', 'challenge')),
  created_at timestamptz not null default now()
);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.task_occurrences(id) on delete cascade,
  member_id uuid not null references public.challenge_members(id) on delete cascade,
  value numeric,
  note text,
  evidence_id uuid references public.evidence_assets(id),
  idempotency_key text not null unique,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (occurrence_id)
);

create table public.score_ledger (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  member_id uuid not null references public.challenge_members(id) on delete cascade,
  occurrence_id uuid references public.task_occurrences(id),
  entry_type public.ledger_entry_type not null,
  points integer not null check (points <> 0),
  effective_date date not null,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.winner_rules (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  rules_version integer not null check (rules_version > 0),
  primary_metric text not null check (primary_metric in ('total_points', 'completion_percentage', 'perfect_days', 'target_reached_at', 'team_total', 'team_average')),
  tie_breakers jsonb not null default '[]'::jsonb,
  threshold numeric,
  created_at timestamptz not null default now(),
  unique (challenge_id, rules_version)
);

create index challenge_members_profile_idx on public.challenge_members(profile_id, status);
create index task_occurrences_member_date_idx on public.task_occurrences(member_id, local_date);
create index score_ledger_challenge_member_idx on public.score_ledger(challenge_id, member_id, effective_date);

create function public.complete_task(
  target_occurrence_id uuid,
  command_idempotency_key text,
  task_completed_at timestamptz default now(),
  task_value numeric default null,
  task_note text default null,
  target_evidence_id uuid default null
)
returns table (checkin_id uuid, awarded_points integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  occurrence_record record;
  created_checkin_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(command_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;

  select o.id, o.challenge_id, o.member_id, o.local_date, o.status,
         cm.profile_id, td.points, td.proof_policy
  into occurrence_record
  from public.task_occurrences o
  join public.challenge_members cm on cm.id = o.member_id
  join public.task_definitions td on td.id = o.task_definition_id
  where o.id = target_occurrence_id
  for update of o;

  if not found or occurrence_record.profile_id <> auth.uid() then raise exception 'Occurrence not found'; end if;
  if occurrence_record.proof_policy = 'required' and target_evidence_id is null then raise exception 'Evidence is required'; end if;
  if target_evidence_id is not null and not exists (
    select 1 from public.evidence_assets e where e.id = target_evidence_id and e.member_id = occurrence_record.member_id
  ) then raise exception 'Evidence not found'; end if;

  select c.id into created_checkin_id
  from public.checkins c
  where c.idempotency_key = command_idempotency_key or c.occurrence_id = target_occurrence_id
  limit 1;

  if created_checkin_id is null then
    insert into public.checkins (occurrence_id, member_id, value, note, evidence_id, idempotency_key, completed_at)
    values (target_occurrence_id, occurrence_record.member_id, task_value, task_note, target_evidence_id, command_idempotency_key, task_completed_at)
    returning id into created_checkin_id;

    update public.task_occurrences
    set status = 'complete', completed_at = task_completed_at
    where id = target_occurrence_id;

    if occurrence_record.points <> 0 then
      insert into public.score_ledger (challenge_id, member_id, occurrence_id, entry_type, points, effective_date, idempotency_key, metadata)
      values (occurrence_record.challenge_id, occurrence_record.member_id, target_occurrence_id, 'task_complete', occurrence_record.points, occurrence_record.local_date, 'task:' || occurrence_record.member_id || ':' || target_occurrence_id, jsonb_build_object('checkinId', created_checkin_id))
      on conflict (idempotency_key) do nothing;
    end if;
  end if;

  return query select created_checkin_id, occurrence_record.points::integer;
end;
$$;

create function public.is_challenge_member(target_challenge_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.challenge_members cm where cm.challenge_id = target_challenge_id and cm.profile_id = auth.uid() and cm.status in ('active', 'completed')) $$;

create function public.has_challenge_role(target_challenge_id uuid, allowed_roles public.member_role[])
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.challenge_members cm where cm.challenge_id = target_challenge_id and cm.profile_id = auth.uid() and cm.status = 'active' and cm.role = any(allowed_roles)) $$;

revoke all on function public.is_challenge_member(uuid) from public;
revoke all on function public.has_challenge_role(uuid, public.member_role[]) from public;
grant execute on function public.is_challenge_member(uuid) to authenticated, anon;
grant execute on function public.has_challenge_role(uuid, public.member_role[]) to authenticated;
revoke all on function public.complete_task(uuid, text, timestamptz, numeric, text, uuid) from public;
grant execute on function public.complete_task(uuid, text, timestamptz, numeric, text, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
alter table public.task_definitions enable row level security;
alter table public.task_occurrences enable row level security;
alter table public.evidence_assets enable row level security;
alter table public.checkins enable row level security;
alter table public.score_ledger enable row level security;
alter table public.winner_rules enable row level security;

create policy "profiles are visible to self and challenge peers" on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from public.challenge_members mine
    join public.challenge_members peer on peer.challenge_id = mine.challenge_id
    where mine.profile_id = auth.uid() and mine.status = 'active' and peer.profile_id = profiles.id and peer.status in ('active', 'completed')
  )
);
create policy "profiles insert self" on public.profiles for insert with check (id = auth.uid());
create policy "profiles update self" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "visible challenges are readable" on public.challenges for select using (visibility in ('public', 'unlisted') or owner_id = auth.uid() or public.is_challenge_member(id));
create policy "authenticated users create owned challenges" on public.challenges for insert to authenticated with check (owner_id = auth.uid());
create policy "owners and moderators update challenges" on public.challenges for update to authenticated using (owner_id = auth.uid() or public.has_challenge_role(id, array['owner','moderator']::public.member_role[]));

create policy "members read their challenge roster" on public.challenge_members for select using (profile_id = auth.uid() or public.is_challenge_member(challenge_id));
create policy "users may request public challenge membership" on public.challenge_members for insert to authenticated with check (profile_id = auth.uid() and role = 'participant' and exists (select 1 from public.challenges c where c.id = challenge_id and c.visibility = 'public' and c.status = 'registration'));
create policy "owners and moderators manage membership" on public.challenge_members for update to authenticated using (public.has_challenge_role(challenge_id, array['owner','moderator']::public.member_role[]));

create policy "visible challenge tasks are readable" on public.task_definitions for select using (exists (select 1 from public.challenges c where c.id = challenge_id and (c.visibility in ('public','unlisted') or public.is_challenge_member(c.id))));
create policy "owners and moderators create tasks" on public.task_definitions for insert to authenticated with check (public.has_challenge_role(challenge_id, array['owner','moderator']::public.member_role[]));
create policy "draft tasks can be updated" on public.task_definitions for update to authenticated using (public.has_challenge_role(challenge_id, array['owner','moderator']::public.member_role[]) and exists (select 1 from public.challenges c where c.id = challenge_id and c.status = 'draft'));

create policy "participants read own occurrences and moderators read all" on public.task_occurrences for select using (exists (select 1 from public.challenge_members cm where cm.id = member_id and cm.profile_id = auth.uid()) or public.has_challenge_role(challenge_id, array['owner','moderator']::public.member_role[]));
create policy "evidence owner and moderators may read" on public.evidence_assets for select using (exists (select 1 from public.challenge_members cm where cm.id = member_id and cm.profile_id = auth.uid()) or public.has_challenge_role(challenge_id, array['owner','moderator']::public.member_role[]) or (visibility = 'challenge' and public.is_challenge_member(challenge_id)));
create policy "participants create own evidence" on public.evidence_assets for insert to authenticated with check (exists (select 1 from public.challenge_members cm where cm.id = member_id and cm.profile_id = auth.uid() and cm.status = 'active'));

create policy "participants read own checkins and moderators read all" on public.checkins for select using (exists (select 1 from public.challenge_members cm where cm.id = member_id and cm.profile_id = auth.uid()) or exists (select 1 from public.task_occurrences o where o.id = occurrence_id and public.has_challenge_role(o.challenge_id, array['owner','moderator']::public.member_role[])));

create policy "challenge members read score ledger" on public.score_ledger for select using (public.is_challenge_member(challenge_id));
create policy "challenge members read winner rules" on public.winner_rules for select using (public.is_challenge_member(challenge_id) or exists (select 1 from public.challenges c where c.id = challenge_id and c.visibility in ('public','unlisted')));
create policy "owners create winner rules" on public.winner_rules for insert to authenticated with check (public.has_challenge_role(challenge_id, array['owner']::public.member_role[]));

create view public.leaderboard with (security_invoker = true) as
select
  sl.challenge_id,
  sl.member_id,
  p.display_name,
  p.avatar_path,
  sum(sl.points)::integer as total_points,
  count(*) filter (where sl.entry_type = 'perfect_day')::integer as perfect_days,
  max(sl.created_at) as updated_at
from public.score_ledger sl
join public.challenge_members cm on cm.id = sl.member_id
join public.profiles p on p.id = cm.profile_id
group by sl.challenge_id, sl.member_id, p.display_name, p.avatar_path;

grant usage on schema public to anon, authenticated;
grant select on public.challenges, public.task_definitions, public.winner_rules to anon, authenticated;
grant select, insert, update on public.profiles, public.challenge_members to authenticated;
grant select on public.task_occurrences, public.checkins to authenticated;
grant select, insert on public.evidence_assets to authenticated;
grant select, insert, update on public.challenges, public.task_definitions, public.winner_rules to authenticated;
grant select on public.score_ledger, public.leaderboard to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 15728640, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "members upload evidence to their folder" on storage.objects for insert to authenticated with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "members read their own evidence" on storage.objects for select to authenticated using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
