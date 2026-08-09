begin;

do $$
declare
  host_id constant uuid := 'e0000000-0000-4000-8000-000000000201';
  member_four_id constant uuid := 'e0000000-0000-4000-8000-000000000202';
  competitor_id constant uuid := 'e0000000-0000-4000-8000-000000000203';
  member_three_id constant uuid := 'e0000000-0000-4000-8000-000000000204';
  member_twelve_id constant uuid := 'e0000000-0000-4000-8000-000000000205';
  challenge_four_id constant uuid := 'e1000000-0000-4000-8000-000000000201';
  challenge_three_id constant uuid := 'e1000000-0000-4000-8000-000000000202';
  challenge_twelve_id constant uuid := 'e1000000-0000-4000-8000-000000000203';
  four_start_checkpoint_id constant uuid := 'e2000000-0000-4000-8000-000000000201';
  four_final_checkpoint_id constant uuid := 'e2000000-0000-4000-8000-000000000202';
  three_start_checkpoint_id constant uuid := 'e2000000-0000-4000-8000-000000000203';
  three_final_checkpoint_id constant uuid := 'e2000000-0000-4000-8000-000000000204';
  twelve_start_checkpoint_id constant uuid := 'e2000000-0000-4000-8000-000000000205';
  twelve_final_checkpoint_id constant uuid := 'e2000000-0000-4000-8000-000000000206';
  member_four_membership uuid;
  competitor_membership uuid;
  member_three_membership uuid;
  member_twelve_membership uuid;
  occurrence_ids uuid[];
  selected_ids uuid[];
  completed integer;
  awarded integer;
  delta integer;
  day_total integer;
  grand_total integer;
  streak_entries integer;
  penalty_count integer;
  penalty_total integer;
  local_day date := (now() at time zone 'UTC')::date;
  target_day date;
  offset_value integer;
begin
  -- Dynamic platform formulas retain the original 7-task +3/+5 ratios.
  if public.shipshape_perfect_day_bonus(0) <> 0 then raise exception 'Zero-task perfect bonus must be zero'; end if;
  if public.shipshape_perfect_day_bonus(3) <> 1 then raise exception '3-task perfect bonus must be 1'; end if;
  if public.shipshape_perfect_day_bonus(4) <> 2 then raise exception '4-task perfect bonus must be 2'; end if;
  if public.shipshape_perfect_day_bonus(7) <> 3 then raise exception '7-task perfect bonus must be 3'; end if;
  if public.shipshape_perfect_day_bonus(12) <> 5 then raise exception '12-task perfect bonus must be 5'; end if;
  if public.shipshape_seven_day_streak_bonus(3) <> 2 then raise exception '3-task streak bonus must be 2'; end if;
  if public.shipshape_seven_day_streak_bonus(4) <> 3 then raise exception '4-task streak bonus must be 3'; end if;
  if public.shipshape_seven_day_streak_bonus(7) <> 5 then raise exception '7-task streak bonus must be 5'; end if;
  if public.shipshape_seven_day_streak_bonus(12) <> 9 then raise exception '12-task streak bonus must be 9'; end if;

  insert into auth.users (id, is_sso_user, is_anonymous, created_at, updated_at)
  values
    (host_id, false, false, now(), now()),
    (member_four_id, false, false, now(), now()),
    (competitor_id, false, false, now(), now()),
    (member_three_id, false, false, now(), now()),
    (member_twelve_id, false, false, now(), now());

  insert into public.profiles (id, display_name, handle, time_zone)
  values
    (host_id, 'Scoring Host', 'scoring_host', 'UTC'),
    (member_four_id, 'Four Task Member', 'scoring_four', 'UTC'),
    (competitor_id, 'Four Task Competitor', 'scoring_competitor', 'UTC'),
    (member_three_id, 'Three Task Member', 'scoring_three', 'UTC'),
    (member_twelve_id, 'Twelve Task Member', 'scoring_twelve', 'UTC');

  insert into public.challenges (
    id, owner_id, slug, name, description, visibility, status,
    starts_on, ends_on, time_zone
  ) values
    (challenge_four_id, host_id, 'scoring-four-tasks', 'Four Tasks', '', 'public', 'active', local_day - 10, local_day + 10, 'UTC'),
    (challenge_three_id, host_id, 'scoring-three-tasks', 'Three Tasks', '', 'public', 'active', local_day - 10, local_day, 'UTC'),
    (challenge_twelve_id, host_id, 'scoring-twelve-tasks', 'Twelve Tasks', '', 'public', 'active', local_day - 10, local_day, 'UTC');

  insert into public.task_definitions (
    challenge_id, rules_version, ordinal, title, instructions,
    task_type, points, required, proof_policy, schedule
  )
  select challenge_four_id, 1, task_number, 'Four task ' || (task_number + 1), '',
         'boolean', 1, true, 'none', '{"kind":"daily"}'::jsonb
  from generate_series(0, 3) task_number;

  insert into public.task_definitions (
    challenge_id, rules_version, ordinal, title, instructions,
    task_type, points, required, proof_policy, schedule
  )
  select challenge_three_id, 1, task_number, 'Three task ' || (task_number + 1), '',
         'boolean', 1, true, 'none', '{"kind":"daily"}'::jsonb
  from generate_series(0, 2) task_number;

  insert into public.task_definitions (
    challenge_id, rules_version, ordinal, title, instructions,
    task_type, points, required, proof_policy, schedule
  )
  select challenge_twelve_id, 1, task_number, 'Twelve task ' || (task_number + 1), '',
         'boolean', 1, true, 'none', '{"kind":"daily"}'::jsonb
  from generate_series(0, 11) task_number;

  insert into public.winner_rules (
    challenge_id, rules_version, primary_metric, bonus_metric, bonus_calculation,
    weight_bonus_calculation, body_fat_bonus_calculation
  ) values
    (challenge_four_id, 1, 'total_points', 'none', null, null, null),
    (challenge_three_id, 1, 'total_points', 'weight', 'percentage', 'percentage', null),
    (challenge_twelve_id, 1, 'total_points', 'weight', 'total_change', 'total_change', 'total_change');

  insert into public.challenge_checkpoints (
    id, challenge_id, rules_version, ordinal, checkpoint_kind, label, day_number,
    requires_weight, requires_body_fat, requires_photo
  ) values
    (four_start_checkpoint_id, challenge_four_id, 1, 0, 'start', 'Start', 1, true, true, true),
    (four_final_checkpoint_id, challenge_four_id, 1, 1, 'final', 'Final', 21, true, true, true),
    (three_start_checkpoint_id, challenge_three_id, 1, 0, 'start', 'Start', 1, true, true, true),
    (three_final_checkpoint_id, challenge_three_id, 1, 1, 'final', 'Final', 11, true, true, true),
    (twelve_start_checkpoint_id, challenge_twelve_id, 1, 0, 'start', 'Start', 1, true, true, true),
    (twelve_final_checkpoint_id, challenge_twelve_id, 1, 1, 'final', 'Final', 11, true, true, true);

  perform set_config('request.jwt.claim.sub', member_four_id::text, true);
  member_four_membership := public.join_challenge(challenge_four_id, null);
  update public.challenge_members
  set joined_at = ((local_day - 6)::timestamp + interval '12 hours') at time zone 'UTC'
  where id = member_four_membership;

  perform public.list_today_tasks(challenge_four_id, local_day);
  select array_agg(occurrence.id order by task.ordinal)
  into occurrence_ids
  from public.task_occurrences occurrence
  join public.task_definitions task on task.id = occurrence.task_definition_id
  where occurrence.member_id = member_four_membership
    and occurrence.local_date = local_day;
  selected_ids := occurrence_ids[1:2];

  begin
    perform public.submit_challenge_day(challenge_four_id, local_day, selected_ids);
    raise exception 'Submitting tasks before the required Start check-in should fail';
  exception when others then
    if sqlerrm not like '%required progress check-in%' then raise; end if;
  end;

  perform public.save_challenge_checkin(
    four_start_checkpoint_id, 200, 25,
    member_four_id::text || '/scoring/start.jpg', null
  );

  begin
    perform public.save_challenge_checkin(
      four_final_checkpoint_id, 190, 20,
      member_four_id::text || '/scoring/final.jpg', null
    );
    raise exception 'A future Final check-in should not be accepted';
  exception when others then
    if sqlerrm not like '%not open yet%' then raise; end if;
  end;

  select result.completed_count, result.awarded_points
  into completed, awarded
  from public.submit_challenge_day(challenge_four_id, local_day, selected_ids) result;
  if completed <> 2 or awarded <> -4 then
    raise exception 'Two of four tasks must score -4, got completed %, points %', completed, awarded;
  end if;

  select result.completed_count, result.score_delta, result.day_points
  into completed, delta, day_total
  from public.amend_challenge_day(challenge_four_id, local_day, occurrence_ids) result;
  if completed <> 4 or delta <> 10 or day_total <> 6 then
    raise exception 'Amending four tasks to perfect must produce 4 complete, +10 delta, 6 day points; got %, %, %', completed, delta, day_total;
  end if;

  select result.score_delta, result.day_points
  into delta, day_total
  from public.amend_challenge_day(challenge_four_id, local_day, occurrence_ids[1:3]) result;
  if delta <> -6 or day_total <> 0 then
    raise exception 'Three of four tasks must remove perfect bonus and score 0; got delta %, day %', delta, day_total;
  end if;

  select result.score_delta, result.day_points
  into delta, day_total
  from public.amend_challenge_day(challenge_four_id, local_day, occurrence_ids) result;
  if delta <> 6 or day_total <> 6 then
    raise exception 'Restoring a four-task perfect day must add 6; got delta %, day %', delta, day_total;
  end if;

  -- Backfill six legitimate membership days, producing seven consecutive perfect days.
  for offset_value in reverse 6..1 loop
    target_day := local_day - offset_value;
    insert into public.task_occurrences (
      challenge_id, member_id, task_definition_id, local_date
    )
    select challenge_four_id, member_four_membership, task.id, target_day
    from public.task_definitions task
    where task.challenge_id = challenge_four_id
    on conflict (member_id, task_definition_id, local_date) do nothing;

    select array_agg(occurrence.id order by task.ordinal)
    into occurrence_ids
    from public.task_occurrences occurrence
    join public.task_definitions task on task.id = occurrence.task_definition_id
    where occurrence.member_id = member_four_membership
      and occurrence.local_date = target_day;

    perform public.amend_challenge_day(challenge_four_id, target_day, occurrence_ids);
  end loop;

  select coalesce(sum(ledger.points), 0)::integer,
         count(*) filter (where ledger.entry_type = 'streak_bonus')::integer
  into grand_total, streak_entries
  from public.score_ledger ledger
  where ledger.challenge_id = challenge_four_id
    and ledger.member_id = member_four_membership;
  if grand_total <> 45 or streak_entries <> 1 then
    raise exception 'Seven 4-task perfect days must total 45 with one streak bonus; got %, % streak entries', grand_total, streak_entries;
  end if;

  -- Breaking the middle day removes that perfect day and the downstream streak.
  target_day := local_day - 3;
  select array_agg(occurrence.id order by task.ordinal)
  into occurrence_ids
  from public.task_occurrences occurrence
  join public.task_definitions task on task.id = occurrence.task_definition_id
  where occurrence.member_id = member_four_membership
    and occurrence.local_date = target_day;
  perform public.amend_challenge_day(challenge_four_id, target_day, occurrence_ids[1:3]);

  select coalesce(sum(ledger.points), 0)::integer,
         count(*) filter (where ledger.entry_type = 'streak_bonus')::integer
  into grand_total, streak_entries
  from public.score_ledger ledger
  where ledger.challenge_id = challenge_four_id
    and ledger.member_id = member_four_membership;
  if grand_total <> 36 or streak_entries <> 0 then
    raise exception 'Broken 7-day streak must total 36 with no streak bonus; got %, % streak entries', grand_total, streak_entries;
  end if;

  perform public.amend_challenge_day(challenge_four_id, target_day, occurrence_ids);
  select coalesce(sum(ledger.points), 0)::integer,
         count(*) filter (where ledger.entry_type = 'streak_bonus')::integer
  into grand_total, streak_entries
  from public.score_ledger ledger
  where ledger.challenge_id = challenge_four_id
    and ledger.member_id = member_four_membership;
  if grand_total <> 45 or streak_entries <> 1 then
    raise exception 'Restored streak must return to 45 with one bonus; got %, % streak entries', grand_total, streak_entries;
  end if;

  -- A competitor score is isolated and leaderboard totals update immediately.
  perform set_config('request.jwt.claim.sub', competitor_id::text, true);
  competitor_membership := public.join_challenge(challenge_four_id, null);
  perform public.save_challenge_checkin(
    four_start_checkpoint_id, 210, 28,
    competitor_id::text || '/scoring/start.jpg', null
  );
  perform public.list_today_tasks(challenge_four_id, local_day);
  select array_agg(occurrence.id order by task.ordinal)
  into occurrence_ids
  from public.task_occurrences occurrence
  join public.task_definitions task on task.id = occurrence.task_definition_id
  where occurrence.member_id = competitor_membership
    and occurrence.local_date = local_day;
  perform public.submit_challenge_day(challenge_four_id, local_day, occurrence_ids[1:3]);

  if not exists (
    select 1 from public.list_challenge_leaderboard(challenge_four_id) board
    where board.profile_id = member_four_id and board.rank = 1 and board.total_points = 45
  ) then raise exception 'Leaderboard did not show the authoritative 45-point leader'; end if;
  if not exists (
    select 1 from public.list_challenge_leaderboard(challenge_four_id) board
    where board.profile_id = competitor_id and board.rank = 2 and board.total_points = 0
  ) then raise exception 'Leaderboard did not isolate the competitor 0-point total'; end if;

  -- Three-task perfect day: 3 base + 1 dynamic perfect bonus = 4.
  perform set_config('request.jwt.claim.sub', member_three_id::text, true);
  member_three_membership := public.join_challenge(challenge_three_id, null);
  update public.challenge_members
  set joined_at = ((local_day - 1)::timestamp + interval '12 hours') at time zone 'UTC'
  where id = member_three_membership;
  perform public.save_challenge_checkin(
    three_start_checkpoint_id, 200, 30,
    member_three_id::text || '/scoring/start.jpg', null
  );
  perform public.save_challenge_checkin(
    three_final_checkpoint_id, 190, 27,
    member_three_id::text || '/scoring/final.jpg', null
  );
  perform public.list_today_tasks(challenge_three_id, local_day);
  select array_agg(occurrence.id order by task.ordinal)
  into occurrence_ids
  from public.task_occurrences occurrence
  join public.task_definitions task on task.id = occurrence.task_definition_id
  where occurrence.member_id = member_three_membership
    and occurrence.local_date = local_day;
  select result.completed_count, result.awarded_points
  into completed, awarded
  from public.submit_challenge_day(challenge_three_id, local_day, occurrence_ids) result;
  if completed <> 3 or awarded <> 4 then
    raise exception 'Three-task perfect day must score 4, got completed %, points %', completed, awarded;
  end if;

  if not exists (
    select 1 from public.list_challenge_leaderboard(challenge_three_id) board
    where board.profile_id = member_three_id
      and board.total_points = 4
      and board.bonus_metric = 'weight'
      and board.bonus_calculation = 'percentage'
      and board.baseline_value = 200
      and board.latest_value = 190
      and board.bonus_points = 5
      and board.total_score = 9
  ) then raise exception 'Weight percentage bonus did not add 5 to the 4-point ShipShape score'; end if;

  -- Automatic deadline closure applies -3 once per missed task and is idempotent.
  target_day := local_day - 1;
  insert into public.task_occurrences (
    challenge_id, member_id, task_definition_id, local_date
  )
  select challenge_three_id, member_three_membership, task.id, target_day
  from public.task_definitions task
  where task.challenge_id = challenge_three_id;
  perform public.process_shipshape_daily_scoring();
  perform public.process_shipshape_daily_scoring();
  select count(*)::integer, coalesce(sum(ledger.points), 0)::integer
  into penalty_count, penalty_total
  from public.score_ledger ledger
  where ledger.challenge_id = challenge_three_id
    and ledger.member_id = member_three_membership
    and ledger.effective_date = target_day
    and ledger.entry_type = 'missed_penalty';
  if penalty_count <> 3 or penalty_total <> -9 then
    raise exception 'Three missed tasks must close once at -9; got count %, points %', penalty_count, penalty_total;
  end if;

  -- Twelve-task perfect day: 12 base + 5 dynamic perfect bonus = 17.
  perform set_config('request.jwt.claim.sub', member_twelve_id::text, true);
  member_twelve_membership := public.join_challenge(challenge_twelve_id, null);
  perform public.save_challenge_checkin(
    twelve_start_checkpoint_id, 220, 30,
    member_twelve_id::text || '/scoring/start.jpg', null
  );
  perform public.save_challenge_checkin(
    twelve_final_checkpoint_id, 210, 27.5,
    member_twelve_id::text || '/scoring/final.jpg', null
  );
  perform public.list_today_tasks(challenge_twelve_id, local_day);
  select array_agg(occurrence.id order by task.ordinal)
  into occurrence_ids
  from public.task_occurrences occurrence
  join public.task_definitions task on task.id = occurrence.task_definition_id
  where occurrence.member_id = member_twelve_membership
    and occurrence.local_date = local_day;
  select result.completed_count, result.awarded_points
  into completed, awarded
  from public.submit_challenge_day(challenge_twelve_id, local_day, occurrence_ids) result;
  if completed <> 12 or awarded <> 17 then
    raise exception 'Twelve-task perfect day must score 17, got completed %, points %', completed, awarded;
  end if;

  if not exists (
    select 1 from public.list_challenge_leaderboard(challenge_twelve_id) board
    where board.profile_id = member_twelve_id
      and board.total_points = 17
      and board.weight_bonus_calculation = 'total_change'
      and board.body_fat_bonus_calculation = 'total_change'
      and board.weight_baseline = 220
      and board.weight_final = 210
      and board.body_fat_baseline = 30
      and board.body_fat_final = 27.5
      and board.weight_bonus_points = 10
      and board.body_fat_bonus_points = 2.5
      and board.bonus_points = 12.5
      and board.total_score = 29.5
  ) then raise exception 'Dual end-of-challenge bonuses did not add 12.5 to the 17-point ShipShape score'; end if;
end;
$$;

rollback;
