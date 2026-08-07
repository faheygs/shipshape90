create or replace function public.publish_challenge(target_challenge_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_record record;
  next_status public.challenge_status;
  owner_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select c.*
  into challenge_record
  from public.challenges c
  where c.id = target_challenge_id
    and c.owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Owned challenge not found';
  end if;
  if challenge_record.status <> 'draft' then
    raise exception 'Only a draft challenge can be published';
  end if;
  if challenge_record.ends_on < current_date then
    raise exception 'The challenge end date must be today or later';
  end if;
  if not exists (
    select 1 from public.task_definitions td
    where td.challenge_id = target_challenge_id
      and td.rules_version = challenge_record.rules_version
  ) then
    raise exception 'Add at least one task before publishing';
  end if;
  if not exists (
    select 1 from public.winner_rules wr
    where wr.challenge_id = target_challenge_id
      and wr.rules_version = challenge_record.rules_version
  ) then
    raise exception 'Set a winning condition before publishing';
  end if;
  if exists (
    select 1
    from public.challenge_members cm
    where cm.profile_id = auth.uid()
      and cm.challenge_id <> target_challenge_id
      and cm.status in ('pending', 'active')
  ) then
    raise exception 'Finish or leave your active challenge before publishing another';
  end if;

  next_status := case
    when challenge_record.starts_on <= current_date then 'active'::public.challenge_status
    else 'registration'::public.challenge_status
  end;

  update public.challenges
  set status = next_status,
      rules_locked_at = now(),
      updated_at = now()
  where id = target_challenge_id;

  insert into public.challenge_members (
    challenge_id,
    profile_id,
    role,
    status,
    joined_at,
    prize_eligible
  )
  values (target_challenge_id, auth.uid(), 'owner', 'active', now(), true)
  on conflict (challenge_id, profile_id) do update
  set role = 'owner',
      status = 'active',
      joined_at = coalesce(public.challenge_members.joined_at, now()),
      prize_eligible = true,
      withdrawn_at = null,
      forfeiture_reason = null
  returning id into owner_member_id;

  insert into public.activity_entries (
    challenge_id,
    actor_profile_id,
    event_type,
    body,
    visibility,
    metadata
  )
  values (
    target_challenge_id,
    auth.uid(),
    'member_joined',
    'Created the challenge',
    'challenge',
    jsonb_build_object('memberId', owner_member_id, 'role', 'owner')
  );

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'challenge:' || target_challenge_id::text || ':activity',
    'challenge.published',
    target_challenge_id,
    jsonb_build_object(
      'version', 1,
      'challengeId', target_challenge_id,
      'profileId', auth.uid(),
      'memberId', owner_member_id,
      'status', next_status
    )
  );

  return next_status::text;
end;
$$;

create or replace function public.list_challenge_tasks(target_challenge_id uuid)
returns table (
  task_definition_id uuid,
  title text,
  instructions text,
  task_type text,
  target_value numeric,
  unit text,
  points integer,
  proof_policy public.proof_policy,
  required boolean,
  ordinal integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  challenge_rules_version integer;
begin
  select c.rules_version
  into challenge_rules_version
  from public.challenges c
  where c.id = target_challenge_id
    and (
      c.visibility in ('public', 'unlisted')
      or c.owner_id = auth.uid()
      or exists (
        select 1 from public.challenge_members cm
        where cm.challenge_id = c.id
          and cm.profile_id = auth.uid()
      )
    );

  if challenge_rules_version is null then
    raise exception 'Challenge not found';
  end if;

  return query
  select td.id, td.title, td.instructions, td.task_type, td.target_value,
         td.unit, td.points, td.proof_policy, td.required, td.ordinal
  from public.task_definitions td
  where td.challenge_id = target_challenge_id
    and td.rules_version = challenge_rules_version
  order by td.ordinal;
end;
$$;

create or replace function public.list_challenge_leaderboard(target_challenge_id uuid)
returns table (
  rank bigint,
  member_id uuid,
  profile_id uuid,
  display_name text,
  avatar_path text,
  total_points integer,
  completion_percentage numeric,
  perfect_days integer,
  is_current_user boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not exists (
    select 1
    from public.challenge_members cm
    where cm.challenge_id = target_challenge_id
      and cm.profile_id = auth.uid()
      and cm.status in ('active', 'completed')
  ) then
    raise exception 'Active membership required';
  end if;

  return query
  with scores as (
    select
      sl.member_id,
      coalesce(sum(sl.points), 0)::integer as total_points,
      count(*) filter (where sl.entry_type = 'perfect_day')::integer as perfect_days
    from public.score_ledger sl
    where sl.challenge_id = target_challenge_id
    group by sl.member_id
  ), completion as (
    select
      occurrence.member_id,
      count(*)::integer as scheduled_count,
      count(*) filter (where occurrence.status in ('complete', 'pending_review'))::integer as completed_count
    from public.task_occurrences occurrence
    where occurrence.challenge_id = target_challenge_id
    group by occurrence.member_id
  ), ranked as (
    select
      row_number() over (
        order by
          coalesce(scores.total_points, 0) desc,
          case
            when coalesce(completion.scheduled_count, 0) = 0 then 0
            else completion.completed_count::numeric / completion.scheduled_count
          end desc,
          cm.joined_at,
          cm.id
      ) as rank,
      cm.id as member_id,
      cm.profile_id,
      profile.display_name,
      profile.avatar_path,
      coalesce(scores.total_points, 0)::integer as total_points,
      case
        when coalesce(completion.scheduled_count, 0) = 0 then 0::numeric
        else round((completion.completed_count::numeric / completion.scheduled_count) * 100, 1)
      end as completion_percentage,
      coalesce(scores.perfect_days, 0)::integer as perfect_days,
      cm.profile_id = auth.uid() as is_current_user
    from public.challenge_members cm
    join public.profiles profile on profile.id = cm.profile_id
    left join scores on scores.member_id = cm.id
    left join completion on completion.member_id = cm.id
    where cm.challenge_id = target_challenge_id
      and cm.status in ('active', 'completed')
  )
  select ranked.rank, ranked.member_id, ranked.profile_id, ranked.display_name,
         ranked.avatar_path, ranked.total_points, ranked.completion_percentage,
         ranked.perfect_days, ranked.is_current_user
  from ranked
  order by ranked.rank;
end;
$$;

create or replace function public.complete_task(
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
set search_path = ''
as $$
declare
  occurrence_record record;
  existing_checkin record;
  created_checkin_id uuid;
  created_activity_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(command_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;

  select
    occurrence.id,
    occurrence.challenge_id,
    occurrence.member_id,
    occurrence.task_definition_id,
    occurrence.local_date,
    occurrence.status,
    member.profile_id,
    task.title,
    task.points,
    task.proof_policy,
    challenge.status as challenge_status
  into occurrence_record
  from public.task_occurrences occurrence
  join public.challenge_members member on member.id = occurrence.member_id
  join public.task_definitions task on task.id = occurrence.task_definition_id
  join public.challenges challenge on challenge.id = occurrence.challenge_id
  where occurrence.id = target_occurrence_id
  for update of occurrence;

  if not found or occurrence_record.profile_id <> auth.uid() then raise exception 'Occurrence not found'; end if;

  select checkin.id, checkin.occurrence_id
  into existing_checkin
  from public.checkins checkin
  where checkin.idempotency_key = command_idempotency_key
     or checkin.occurrence_id = target_occurrence_id
  limit 1;

  if found then
    if existing_checkin.occurrence_id <> target_occurrence_id then
      raise exception 'Idempotency key was already used';
    end if;
    return query select existing_checkin.id::uuid, occurrence_record.points::integer;
    return;
  end if;

  if occurrence_record.challenge_status <> 'active' then raise exception 'Challenge is not active'; end if;
  if occurrence_record.status <> 'pending' then raise exception 'Task is not available for completion'; end if;
  if occurrence_record.proof_policy = 'required' and target_evidence_id is null then raise exception 'Evidence is required'; end if;
  if target_evidence_id is not null and not exists (
    select 1 from public.evidence_assets evidence
    where evidence.id = target_evidence_id
      and evidence.member_id = occurrence_record.member_id
  ) then raise exception 'Evidence not found'; end if;

  insert into public.checkins (occurrence_id, member_id, value, note, evidence_id, idempotency_key, completed_at)
  values (target_occurrence_id, occurrence_record.member_id, task_value, task_note, target_evidence_id, command_idempotency_key, task_completed_at)
  returning id into created_checkin_id;

  update public.task_occurrences
  set status = case when occurrence_record.proof_policy = 'required' then 'pending_review'::public.occurrence_status else 'complete'::public.occurrence_status end,
      completed_at = task_completed_at
  where id = target_occurrence_id;

  if occurrence_record.points <> 0 then
    insert into public.score_ledger (challenge_id, member_id, occurrence_id, entry_type, points, effective_date, idempotency_key, metadata)
    values (
      occurrence_record.challenge_id,
      occurrence_record.member_id,
      target_occurrence_id,
      'task_complete',
      occurrence_record.points,
      occurrence_record.local_date,
      'task:' || occurrence_record.member_id || ':' || target_occurrence_id,
      jsonb_build_object('checkinId', created_checkin_id)
    )
    on conflict (idempotency_key) do nothing;
  end if;

  insert into public.activity_entries (challenge_id, actor_profile_id, event_type, body, visibility, metadata)
  values (
    occurrence_record.challenge_id,
    auth.uid(),
    'task_completed',
    null,
    'challenge',
    jsonb_build_object(
      'taskTitle', occurrence_record.title,
      'points', occurrence_record.points,
      'occurrenceId', target_occurrence_id,
      'checkinId', created_checkin_id
    )
  )
  returning id into created_activity_id;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'challenge:' || occurrence_record.challenge_id::text || ':activity',
    'task.completed',
    occurrence_record.challenge_id,
    jsonb_build_object(
      'version', 1,
      'challengeId', occurrence_record.challenge_id,
      'memberId', occurrence_record.member_id,
      'profileId', auth.uid(),
      'occurrenceId', target_occurrence_id,
      'taskDefinitionId', occurrence_record.task_definition_id,
      'activityId', created_activity_id,
      'status', case when occurrence_record.proof_policy = 'required' then 'pending_review' else 'complete' end,
      'points', occurrence_record.points
    )
  );

  return query select created_checkin_id, occurrence_record.points::integer;
end;
$$;

revoke all on function public.publish_challenge(uuid) from public, anon, authenticated;
revoke all on function public.list_challenge_tasks(uuid) from public, anon, authenticated;
revoke all on function public.list_challenge_leaderboard(uuid) from public, anon, authenticated;
revoke all on function public.complete_task(uuid, text, timestamptz, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.publish_challenge(uuid) to authenticated;
grant execute on function public.list_challenge_tasks(uuid) to anon, authenticated;
grant execute on function public.list_challenge_leaderboard(uuid) to authenticated;
grant execute on function public.complete_task(uuid, text, timestamptz, numeric, text, uuid) to authenticated;

comment on function public.publish_challenge(uuid) is
  'Locks challenge rules, activates the owner membership, and opens or starts the challenge.';
comment on function public.list_challenge_leaderboard(uuid) is
  'Returns the authoritative live ranking for active and completed challenge members.';
comment on function public.complete_task(uuid, text, timestamptz, numeric, text, uuid) is
  'Completes one occurrence idempotently and emits its activity and realtime event atomically.';
