begin;

do $$
declare
  host_id constant uuid := 'd0000000-0000-4000-8000-000000000301';
  challenger_id constant uuid := 'd0000000-0000-4000-8000-000000000302';
  journey_challenge_id uuid;
  host_member_id uuid;
  challenger_member_id uuid;
  start_checkpoint_id uuid;
  final_checkpoint_id uuid;
  workout_catalog_id uuid;
  steps_catalog_id uuid;
  creation jsonb;
  occurrence_ids uuid[];
  awarded integer;
  reminder_count integer;
  failed_as_expected boolean;
begin
  insert into auth.users (id, is_sso_user, is_anonymous, created_at, updated_at)
  values
    (host_id, false, false, now(), now()),
    (challenger_id, false, false, now(), now());

  insert into public.profiles (id, display_name, handle, time_zone)
  values
    (host_id, 'Journey Host', 'journey_host', 'America/Denver'),
    (challenger_id, 'Journey Challenger', 'journey_challenger', 'Asia/Kolkata');

  select catalog.id into workout_catalog_id
  from public.task_catalog catalog
  where catalog.owner_id is null and catalog.title = 'Workout 1';
  select catalog.id into steps_catalog_id
  from public.task_catalog catalog
  where catalog.owner_id is null and catalog.title = 'Steps';
  if workout_catalog_id is null or steps_catalog_id is null then
    raise exception 'Required public task catalog entries are missing';
  end if;

  perform set_config('request.jwt.claim.sub', host_id::text, true);
  creation := public.create_challenge(
    'Two User Journey',
    'A complete automated host and challenger lifecycle.',
    'public'::public.challenge_visibility,
    'open',
    current_date,
    current_date + 2,
    'Bragging rights',
    'total_change',
    'percentage',
    jsonb_build_array(
      jsonb_build_object('kind', 'start', 'label', 'Start', 'dayNumber', 1, 'requiresWeight', true, 'requiresBodyFat', true, 'requiresPhoto', true),
      jsonb_build_object('kind', 'final', 'label', 'Final', 'dayNumber', 3, 'requiresWeight', true, 'requiresBodyFat', true, 'requiresPhoto', true)
    ),
    jsonb_build_array(
      jsonb_build_object('catalogTaskId', workout_catalog_id, 'instructions', 'Complete any 45 minute workout.', 'targetValue', 45, 'unit', 'minutes'),
      jsonb_build_object('catalogTaskId', steps_catalog_id, 'instructions', 'Reach 10000 steps.', 'targetValue', 10000, 'unit', 'steps')
    ),
    false,
    false
  );
  journey_challenge_id := (creation ->> 'challengeId')::uuid;

  if creation ->> 'status' <> 'active'
     or coalesce((creation ->> 'creatorParticipating')::boolean, false) is not true then
    raise exception 'A live challenge did not automatically enroll its host: %', creation;
  end if;

  select member.id into host_member_id
  from public.challenge_members member
  where member.challenge_id = journey_challenge_id and member.profile_id = host_id;
  if host_member_id is null or not exists (
    select 1 from public.challenge_members member
    where member.id = host_member_id and member.role = 'owner' and member.status = 'active'
      and member.scoring_time_zone = 'America/Denver'
  ) then raise exception 'Host membership was not activated in the host timezone'; end if;

  if (select count(*) from public.task_definitions task where task.challenge_id = journey_challenge_id) <> 2
     or exists (select 1 from public.task_definitions task where task.challenge_id = journey_challenge_id and task.proof_policy <> 'none') then
    raise exception 'Created tasks were not saved as two honor-system tasks';
  end if;
  if (select count(*) from public.challenge_checkpoints checkpoint
      where checkpoint.challenge_id = journey_challenge_id
        and checkpoint.requires_weight and checkpoint.requires_body_fat and checkpoint.requires_photo) <> 2 then
    raise exception 'Required Start and Final check-ins were not created';
  end if;
  if not exists (
    select 1 from public.winner_rules rules
    where rules.challenge_id = journey_challenge_id
      and rules.weight_bonus_calculation = 'total_change'
      and rules.body_fat_bonus_calculation = 'percentage'
  ) then raise exception 'Both additional-point calculations were not persisted'; end if;

  select checkpoint.id into start_checkpoint_id from public.challenge_checkpoints checkpoint
  where checkpoint.challenge_id = journey_challenge_id and checkpoint.checkpoint_kind = 'start';
  select checkpoint.id into final_checkpoint_id from public.challenge_checkpoints checkpoint
  where checkpoint.challenge_id = journey_challenge_id and checkpoint.checkpoint_kind = 'final';

  reminder_count := public.enqueue_due_checkin_notifications();
  if reminder_count <> 1 or not exists (
    select 1 from public.notifications notification
    where notification.profile_id = host_id
      and notification.notification_type = 'progress.checkpoint_due'
      and notification.challenge_id = journey_challenge_id
  ) then raise exception 'Host did not receive the due Start check-in notification'; end if;
  if public.enqueue_due_checkin_notifications() <> 0 then
    raise exception 'Due check-in notification delivery was not idempotent';
  end if;

  perform public.list_today_tasks(journey_challenge_id, current_date);
  select array_agg(occurrence.id order by task.ordinal) into occurrence_ids
  from public.task_occurrences occurrence
  join public.task_definitions task on task.id = occurrence.task_definition_id
  where occurrence.member_id = host_member_id and occurrence.local_date = current_date;
  failed_as_expected := false;
  begin
    perform public.submit_challenge_day(journey_challenge_id, current_date, occurrence_ids);
  exception when others then
    failed_as_expected := sqlerrm like '%required progress check-in%';
  end;
  if not failed_as_expected then raise exception 'Host tasks were not gated by the Start check-in'; end if;

  perform public.save_challenge_checkin(
    start_checkpoint_id, 220, 30, host_id::text || '/journey/start.jpg', 'Ready'
  );
  select result.awarded_points into awarded
  from public.submit_challenge_day(journey_challenge_id, current_date, occurrence_ids) result;
  if awarded <> 3 then raise exception 'Host perfect day should award 3 points, got %', awarded; end if;

  perform set_config('request.jwt.claim.sub', challenger_id::text, true);
  challenger_member_id := public.join_challenge(journey_challenge_id, null);
  if not exists (
    select 1 from public.challenge_members member
    where member.id = challenger_member_id and member.status = 'active'
      and member.scoring_time_zone = 'Asia/Kolkata'
  ) then raise exception 'Public challenger join was not immediate and timezone-local'; end if;

  reminder_count := public.enqueue_due_checkin_notifications();
  if reminder_count <> 1 or not exists (
    select 1 from public.notifications notification
    where notification.profile_id = challenger_id
      and notification.notification_type = 'progress.checkpoint_due'
      and notification.challenge_id = journey_challenge_id
  ) then raise exception 'Challenger did not receive the due Start check-in notification'; end if;

  perform public.save_challenge_checkin(
    start_checkpoint_id, 200, 25, challenger_id::text || '/journey/start.jpg', null
  );
  perform public.list_today_tasks(journey_challenge_id, (now() at time zone 'Asia/Kolkata')::date);
  select array_agg(occurrence.id order by task.ordinal) into occurrence_ids
  from public.task_occurrences occurrence
  join public.task_definitions task on task.id = occurrence.task_definition_id
  where occurrence.member_id = challenger_member_id
    and occurrence.local_date = (now() at time zone 'Asia/Kolkata')::date;
  select result.awarded_points into awarded
  from public.submit_challenge_day(
    journey_challenge_id, (now() at time zone 'Asia/Kolkata')::date, occurrence_ids[1:1]
  ) result;
  if awarded <> -2 then raise exception 'One of two tasks should award -2 points, got %', awarded; end if;

  if not exists (
    select 1 from public.list_challenge_leaderboard(journey_challenge_id) board
    where board.profile_id = host_id and board.rank = 1 and board.total_score = 3
  ) then raise exception 'Live leaderboard did not show the host leading on task points'; end if;

  -- Fast-forward the transaction fixture so Final check-ins and completed history can be verified now.
  update public.challenges set ends_on = current_date where id = journey_challenge_id;
  reminder_count := public.enqueue_due_checkin_notifications();
  if reminder_count <> 2 then raise exception 'Both Final check-in reminders should be queued, got %', reminder_count; end if;

  perform public.save_challenge_checkin(
    final_checkpoint_id, 185, 20, challenger_id::text || '/journey/final.jpg', 'Finished'
  );
  perform set_config('request.jwt.claim.sub', host_id::text, true);
  perform public.save_challenge_checkin(
    final_checkpoint_id, 215, 29, host_id::text || '/journey/final.jpg', 'Finished'
  );

  if not exists (
    select 1 from public.list_challenge_leaderboard(journey_challenge_id) board
    where board.profile_id = challenger_id and board.rank = 1
      and board.total_points = -2
      and board.weight_bonus_points = 15
      and board.body_fat_bonus_points = 20
      and board.total_score = 33
  ) then raise exception 'Additional points did not move the challenger into first place'; end if;
  if not exists (
    select 1 from public.list_challenge_leaderboard(journey_challenge_id) board
    where board.profile_id = host_id and board.rank = 2
      and board.total_points = 3
      and board.weight_bonus_points = 5
      and board.body_fat_bonus_points = 3.33
      and board.total_score = 11.33
  ) then raise exception 'Host combined score was not calculated correctly'; end if;

  if (select count(*) from public.domain_event_outbox event
      where event.aggregate_id = journey_challenge_id and event.event_type = 'progress.checkpoint_completed') <> 4 then
    raise exception 'All four completed check-ins were not emitted for realtime delivery';
  end if;

  if public.close_owned_challenge(journey_challenge_id, 'end') <> 'complete' then
    raise exception 'Host could not finish the challenge';
  end if;
  if not exists (
    select 1 from public.list_my_challenge_history() history
    where history.challenge_id = journey_challenge_id
      and history.result_status = 'completed'
      and history.total_points = 11.33
      and history.final_rank = 2
      and history.participant_count = 2
  ) then raise exception 'Host completed history did not preserve combined points and final rank'; end if;

  perform set_config('request.jwt.claim.sub', challenger_id::text, true);
  if not exists (
    select 1 from public.list_my_challenge_history() history
    where history.challenge_id = journey_challenge_id
      and history.result_status = 'completed'
      and history.total_points = 33
      and history.final_rank = 1
      and history.participant_count = 2
  ) then raise exception 'Winner history did not preserve combined points and final rank'; end if;
end;
$$;

rollback;
