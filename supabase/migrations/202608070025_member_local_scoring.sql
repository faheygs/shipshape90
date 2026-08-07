-- Every participant owns their scoring-day boundary. The timezone is copied
-- from their profile when the membership is created and remains locked for the
-- life of that membership.

alter table public.challenge_members
  add column if not exists scoring_time_zone text;

update public.challenge_members member
set scoring_time_zone = coalesce(
  (
    select profile.time_zone
    from public.profiles profile
    where profile.id = member.profile_id
      and exists (
        select 1 from pg_catalog.pg_timezone_names zone
        where zone.name = profile.time_zone
      )
  ),
  'UTC'
)
where member.scoring_time_zone is null;

alter table public.challenge_members
  alter column scoring_time_zone set not null;

create or replace function public.lock_member_scoring_time_zone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_zone text;
begin
  if tg_op = 'UPDATE' then
    if new.scoring_time_zone is distinct from old.scoring_time_zone then
      raise exception 'A challenge scoring timezone cannot change after joining';
    end if;
    return new;
  end if;

  select profile.time_zone
  into profile_zone
  from public.profiles profile
  where profile.id = new.profile_id
    and exists (
      select 1 from pg_catalog.pg_timezone_names zone
      where zone.name = profile.time_zone
    );

  new.scoring_time_zone := coalesce(profile_zone, 'UTC');
  return new;
end;
$$;

drop trigger if exists lock_member_scoring_time_zone on public.challenge_members;
create trigger lock_member_scoring_time_zone
before insert or update of scoring_time_zone on public.challenge_members
for each row execute function public.lock_member_scoring_time_zone();

create or replace function public.join_challenge(
  target_challenge_id uuid,
  submitted_invite_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_record record;
  existing_membership record;
  invite_record record;
  created_member_id uuid;
  created_status public.member_status;
  member_time_zone text;
  member_local_date date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select coalesce(
    (
      select profile.time_zone
      from public.profiles profile
      where profile.id = auth.uid()
        and exists (
          select 1 from pg_catalog.pg_timezone_names zone
          where zone.name = profile.time_zone
        )
    ),
    'UTC'
  ) into member_time_zone;

  if not exists (select 1 from public.profiles profile where profile.id = auth.uid()) then
    raise exception 'Complete your profile before joining';
  end if;

  member_local_date := (now() at time zone member_time_zone)::date;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select challenge.* into challenge_record
  from public.challenges challenge
  where challenge.id = target_challenge_id
  for update;

  if not found then raise exception 'Challenge not found'; end if;
  if challenge_record.status not in ('registration', 'active') then
    raise exception 'Challenge is not accepting members';
  end if;
  if member_local_date > challenge_record.ends_on then
    raise exception 'Challenge has ended in your timezone';
  end if;
  if challenge_record.registration_closes_at is not null
     and challenge_record.registration_closes_at <= now() then
    raise exception 'Challenge registration is closed';
  end if;

  select member.* into existing_membership
  from public.challenge_members member
  where member.challenge_id = target_challenge_id
    and member.profile_id = auth.uid();

  if found then
    if existing_membership.status = 'left' then
      raise exception 'You withdrew and cannot rejoin this challenge';
    end if;
    raise exception 'You already have a membership for this challenge';
  end if;

  if exists (
    select 1 from public.challenge_members member
    where member.profile_id = auth.uid()
      and member.status in ('pending', 'active')
  ) then raise exception 'Finish or leave your active challenge before joining another'; end if;

  if challenge_record.participant_limit is not null and (
    select count(*) from public.challenge_members member
    where member.challenge_id = target_challenge_id
      and member.status in ('pending', 'active')
  ) >= challenge_record.participant_limit then raise exception 'Challenge is full'; end if;

  if challenge_record.visibility in ('private', 'unlisted')
     or challenge_record.join_policy = 'invite_only' then
    if submitted_invite_code is null then raise exception 'A valid invite code is required'; end if;
    select invite.* into invite_record
    from public.challenge_invites invite
    where invite.challenge_id = target_challenge_id
      and invite.code = upper(trim(submitted_invite_code))
      and invite.revoked_at is null
      and (invite.expires_at is null or invite.expires_at > now())
      and (invite.max_uses is null or invite.use_count < invite.max_uses)
    for update;
    if not found then raise exception 'Invite code is invalid or expired'; end if;
  end if;

  created_status := case
    when challenge_record.join_policy = 'approval'
      then 'pending'::public.member_status
    else 'active'::public.member_status
  end;

  insert into public.challenge_members (
    challenge_id, profile_id, role, status, joined_at, prize_eligible
  ) values (
    target_challenge_id,
    auth.uid(),
    'participant',
    created_status,
    case when created_status = 'active' then now() else null end,
    true
  ) returning id into created_member_id;

  if invite_record.id is not null then
    update public.challenge_invites
    set use_count = use_count + 1
    where id = invite_record.id;
  end if;

  if created_status = 'active' then
    insert into public.activity_entries (
      challenge_id, actor_profile_id, event_type, visibility, metadata
    ) values (
      target_challenge_id,
      auth.uid(),
      'member_joined',
      'challenge',
      jsonb_build_object(
        'memberId', created_member_id,
        'scoringTimeZone', member_time_zone
      )
    );
  end if;

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'challenge:' || target_challenge_id::text || ':activity',
    case when created_status = 'active' then 'member.joined' else 'member.requested' end,
    target_challenge_id,
    jsonb_build_object(
      'challengeId', target_challenge_id,
      'memberId', created_member_id,
      'profileId', auth.uid(),
      'status', created_status,
      'scoringTimeZone', member_time_zone
    )
  );

  return created_member_id;
end;
$$;

revoke all on function public.join_challenge(uuid, text) from public, anon, authenticated;
grant execute on function public.join_challenge(uuid, text) to authenticated;

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
set search_path = ''
as $$
declare
  member_record record;
  challenge_record record;
  scoring_date date;
  first_scoring_date date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select member.id, member.joined_at, member.scoring_time_zone
  into member_record
  from public.challenge_members member
  where member.challenge_id = target_challenge_id
    and member.profile_id = auth.uid()
    and member.status in ('active', 'completed');

  if member_record.id is null then raise exception 'Active membership required'; end if;

  select challenge.status, challenge.starts_on, challenge.ends_on, challenge.rules_version
  into challenge_record
  from public.challenges challenge
  where challenge.id = target_challenge_id;

  if not found then raise exception 'Challenge not found'; end if;

  scoring_date := (now() at time zone member_record.scoring_time_zone)::date;
  first_scoring_date := greatest(
    challenge_record.starts_on,
    (member_record.joined_at at time zone member_record.scoring_time_zone)::date
  );

  if scoring_date < first_scoring_date or scoring_date > challenge_record.ends_on then return; end if;

  if challenge_record.status in ('registration', 'active') then
    insert into public.task_occurrences (
      challenge_id, member_id, task_definition_id, local_date
    )
    select target_challenge_id, member_record.id, task.id, scoring_date
    from public.task_definitions task
    where task.challenge_id = target_challenge_id
      and task.rules_version = challenge_record.rules_version
      and task.schedule ->> 'kind' = 'daily'
    on conflict on constraint task_occurrences_member_id_task_definition_id_local_date_key do nothing;
  end if;

  return query
  select occurrence.id, task.id, task.title, task.instructions, task.task_type,
         task.target_value, task.unit, task.points, task.proof_policy,
         occurrence.status, occurrence.completed_at
  from public.task_occurrences occurrence
  join public.task_definitions task on task.id = occurrence.task_definition_id
  where occurrence.member_id = member_record.id
    and occurrence.challenge_id = target_challenge_id
    and occurrence.local_date = scoring_date
  order by task.ordinal;
end;
$$;

revoke all on function public.list_today_tasks(uuid, date) from public, anon, authenticated;
grant execute on function public.list_today_tasks(uuid, date) to authenticated;

create or replace function public.submit_challenge_day(
  target_challenge_id uuid,
  target_local_date date,
  selected_occurrence_ids uuid[]
)
returns table (completed_count integer, awarded_points integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_record record;
  challenge_record record;
  scoring_date date;
  first_scoring_date date;
  occurrence_id_value uuid;
  result_record record;
  total_completed integer := 0;
  missed_count integer := 0;
  points_before integer := 0;
  points_after integer := 0;
  normalized_selected_ids uuid[] := coalesce(selected_occurrence_ids, array[]::uuid[]);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select member.id, member.joined_at, member.scoring_time_zone
  into member_record
  from public.challenge_members member
  where member.challenge_id = target_challenge_id
    and member.profile_id = auth.uid()
    and member.status = 'active';

  if member_record.id is null then raise exception 'Active membership required'; end if;

  select challenge.status, challenge.starts_on, challenge.ends_on
  into challenge_record
  from public.challenges challenge
  where challenge.id = target_challenge_id;

  if challenge_record.status not in ('registration', 'active') then
    raise exception 'Challenge is not active';
  end if;

  scoring_date := (now() at time zone member_record.scoring_time_zone)::date;
  first_scoring_date := greatest(
    challenge_record.starts_on,
    (member_record.joined_at at time zone member_record.scoring_time_zone)::date
  );

  if scoring_date < first_scoring_date or scoring_date > challenge_record.ends_on then
    raise exception 'Today is outside your challenge scoring window';
  end if;

  perform 1
  from public.task_occurrences occurrence
  where occurrence.challenge_id = target_challenge_id
    and occurrence.member_id = member_record.id
    and occurrence.local_date = scoring_date
  for update;

  if not found then raise exception 'No tasks are scheduled for this day'; end if;

  if cardinality(normalized_selected_ids) <> (
    select count(distinct selected.id)::integer
    from unnest(normalized_selected_ids) selected(id)
  ) then raise exception 'A task can only be selected once'; end if;

  if exists (
    select 1
    from unnest(normalized_selected_ids) selected(id)
    left join public.task_occurrences occurrence
      on occurrence.id = selected.id
     and occurrence.challenge_id = target_challenge_id
     and occurrence.member_id = member_record.id
     and occurrence.local_date = scoring_date
     and occurrence.status = 'pending'
    where occurrence.id is null
  ) then raise exception 'One or more selected tasks are unavailable'; end if;

  if not exists (
    select 1 from public.task_occurrences occurrence
    where occurrence.challenge_id = target_challenge_id
      and occurrence.member_id = member_record.id
      and occurrence.local_date = scoring_date
      and occurrence.status = 'pending'
  ) then raise exception 'This day has already been submitted'; end if;

  select coalesce(sum(ledger.points), 0)::integer into points_before
  from public.score_ledger ledger
  where ledger.challenge_id = target_challenge_id
    and ledger.member_id = member_record.id
    and ledger.effective_date = scoring_date;

  foreach occurrence_id_value in array normalized_selected_ids loop
    select completion.checkin_id, completion.awarded_points
    into result_record
    from public.complete_task(
      occurrence_id_value,
      'day-submit:' || member_record.id::text || ':' || occurrence_id_value::text,
      now(), null, null, null
    ) completion;
    total_completed := total_completed + 1;
  end loop;

  with missed as (
    update public.task_occurrences occurrence
    set status = 'missed'::public.occurrence_status
    where occurrence.challenge_id = target_challenge_id
      and occurrence.member_id = member_record.id
      and occurrence.local_date = scoring_date
      and occurrence.status = 'pending'
      and not (occurrence.id = any(normalized_selected_ids))
    returning occurrence.id, occurrence.challenge_id, occurrence.member_id, occurrence.local_date
  )
  insert into public.score_ledger (
    challenge_id, member_id, occurrence_id, entry_type, points,
    effective_date, idempotency_key, metadata
  )
  select missed.challenge_id, missed.member_id, missed.id,
         'missed_penalty'::public.ledger_entry_type, -3, missed.local_date,
         'missed:' || missed.member_id::text || ':' || missed.id::text,
         jsonb_build_object('points', -3, 'reason', 'day_submitted')
  from missed
  on conflict (idempotency_key) do nothing;

  get diagnostics missed_count = row_count;

  select coalesce(sum(ledger.points), 0)::integer into points_after
  from public.score_ledger ledger
  where ledger.challenge_id = target_challenge_id
    and ledger.member_id = member_record.id
    and ledger.effective_date = scoring_date;

  insert into public.activity_entries (
    challenge_id, actor_profile_id, event_type, visibility, metadata
  ) values (
    target_challenge_id, auth.uid(), 'day_submitted', 'challenge',
    jsonb_build_object(
      'date', scoring_date,
      'completedCount', total_completed,
      'missedCount', missed_count,
      'points', points_after - points_before
    )
  );

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'challenge:' || target_challenge_id::text || ':activity',
    'score.day_submitted',
    target_challenge_id,
    jsonb_build_object(
      'version', 1,
      'challengeId', target_challenge_id,
      'memberId', member_record.id,
      'profileId', auth.uid(),
      'date', scoring_date,
      'completedCount', total_completed,
      'missedCount', missed_count,
      'points', points_after - points_before
    )
  );

  return query select total_completed, points_after - points_before;
end;
$$;

revoke all on function public.submit_challenge_day(uuid, date, uuid[]) from public, anon, authenticated;
grant execute on function public.submit_challenge_day(uuid, date, uuid[]) to authenticated;

create or replace function public.process_shipshape_daily_scoring()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected record;
  inserted_penalties integer := 0;
  group_penalties integer := 0;
begin
  insert into public.task_occurrences (
    challenge_id, member_id, task_definition_id, local_date
  )
  select challenge.id, member.id, task.id,
         (now() at time zone member.scoring_time_zone)::date
  from public.challenges challenge
  join public.challenge_members member
    on member.challenge_id = challenge.id
   and member.status = 'active'
  join public.task_definitions task
    on task.challenge_id = challenge.id
   and task.rules_version = challenge.rules_version
   and task.schedule ->> 'kind' = 'daily'
  where challenge.status in ('registration', 'active')
    and (now() at time zone member.scoring_time_zone)::date between
      greatest(
        challenge.starts_on,
        (member.joined_at at time zone member.scoring_time_zone)::date
      )
      and challenge.ends_on
  on conflict (member_id, task_definition_id, local_date) do nothing;

  for affected in
    select occurrence.challenge_id, occurrence.member_id,
           occurrence.local_date, member.profile_id
    from public.task_occurrences occurrence
    join public.challenges challenge on challenge.id = occurrence.challenge_id
    join public.challenge_members member on member.id = occurrence.member_id
    where occurrence.status = 'pending'
      and member.status = 'active'
      and occurrence.local_date between
        greatest(
          challenge.starts_on,
          (member.joined_at at time zone member.scoring_time_zone)::date
        )
        and challenge.ends_on
      and occurrence.local_date < (now() at time zone member.scoring_time_zone)::date
    group by occurrence.challenge_id, occurrence.member_id,
             occurrence.local_date, member.profile_id
  loop
    with missed as (
      update public.task_occurrences occurrence
      set status = 'missed'::public.occurrence_status
      where occurrence.challenge_id = affected.challenge_id
        and occurrence.member_id = affected.member_id
        and occurrence.local_date = affected.local_date
        and occurrence.status = 'pending'
      returning occurrence.id, occurrence.challenge_id,
                occurrence.member_id, occurrence.local_date
    )
    insert into public.score_ledger (
      challenge_id, member_id, occurrence_id, entry_type, points,
      effective_date, idempotency_key, metadata
    )
    select missed.challenge_id, missed.member_id, missed.id,
           'missed_penalty'::public.ledger_entry_type, -3, missed.local_date,
           'missed:' || missed.member_id::text || ':' || missed.id::text,
           jsonb_build_object('points', -3, 'reason', 'deadline')
    from missed
    on conflict (idempotency_key) do nothing;

    get diagnostics group_penalties = row_count;
    inserted_penalties := inserted_penalties + group_penalties;

    if group_penalties > 0 then
      insert into public.activity_entries (
        challenge_id, actor_profile_id, event_type, visibility, metadata
      ) values (
        affected.challenge_id, affected.profile_id, 'day_submitted', 'challenge',
        jsonb_build_object(
          'date', affected.local_date,
          'completedCount', 0,
          'missedCount', group_penalties,
          'points', group_penalties * -3,
          'closedBy', 'deadline'
        )
      );

      insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
      values (
        'challenge:' || affected.challenge_id::text || ':activity',
        'score.day_closed',
        affected.challenge_id,
        jsonb_build_object(
          'version', 1,
          'challengeId', affected.challenge_id,
          'memberId', affected.member_id,
          'profileId', affected.profile_id,
          'date', affected.local_date,
          'missedCount', group_penalties,
          'points', group_penalties * -3
        )
      );
    end if;
  end loop;

  return inserted_penalties;
end;
$$;

revoke all on function public.process_shipshape_daily_scoring() from public, anon, authenticated;

create or replace function public.get_my_perfect_day_streak(target_challenge_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  member_record record;
  latest_perfect_date date;
  member_today date;
  streak_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select member.id, member.scoring_time_zone
  into member_record
  from public.challenge_members member
  where member.challenge_id = target_challenge_id
    and member.profile_id = auth.uid()
    and member.status in ('active', 'completed');

  if member_record.id is null then raise exception 'Active membership required'; end if;
  member_today := (now() at time zone member_record.scoring_time_zone)::date;

  select max(ledger.effective_date) into latest_perfect_date
  from public.score_ledger ledger
  where ledger.challenge_id = target_challenge_id
    and ledger.member_id = member_record.id
    and ledger.entry_type = 'perfect_day';

  if latest_perfect_date is null or latest_perfect_date < member_today - 1 then return 0; end if;

  with recursive perfect_dates as (
    select distinct ledger.effective_date
    from public.score_ledger ledger
    where ledger.challenge_id = target_challenge_id
      and ledger.member_id = member_record.id
      and ledger.entry_type = 'perfect_day'
  ), consecutive(day, length) as (
    select latest_perfect_date, 1
    union all
    select consecutive.day - 1, consecutive.length + 1
    from consecutive
    where exists (
      select 1 from perfect_dates
      where perfect_dates.effective_date = consecutive.day - 1
    )
  )
  select max(consecutive.length) into streak_count from consecutive;

  return coalesce(streak_count, 0);
end;
$$;

revoke all on function public.get_my_perfect_day_streak(uuid) from public, anon, authenticated;
grant execute on function public.get_my_perfect_day_streak(uuid) to authenticated;

comment on column public.challenge_members.scoring_time_zone is
  'IANA timezone snapshotted when the membership is created; immutable during the challenge.';

comment on function public.process_shipshape_daily_scoring() is
  'Materializes and closes each active member day at midnight in their locked scoring timezone.';
