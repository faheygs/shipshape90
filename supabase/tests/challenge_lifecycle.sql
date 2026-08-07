begin;

do $$
declare
  host_id constant uuid := 'f0000000-0000-4000-8000-000000000101';
  member_a_id constant uuid := 'f0000000-0000-4000-8000-000000000102';
  member_b_id constant uuid := 'f0000000-0000-4000-8000-000000000103';
  public_now_id constant uuid := 'f1000000-0000-4000-8000-000000000101';
  public_switch_id constant uuid := 'f1000000-0000-4000-8000-000000000102';
  private_now_id constant uuid := 'f1000000-0000-4000-8000-000000000103';
  public_future_id constant uuid := 'f1000000-0000-4000-8000-000000000104';
  joined_member_id uuid;
  private_member_id uuid;
  invite_code text;
  processed integer;
  local_day date;
  failed_as_expected boolean;
begin
  insert into auth.users (id, is_sso_user, is_anonymous, created_at, updated_at)
  values
    (host_id, false, false, now(), now()),
    (member_a_id, false, false, now(), now()),
    (member_b_id, false, false, now(), now());

  insert into public.profiles (id, display_name, handle, time_zone)
  values
    (host_id, 'Lifecycle Host', 'lifecycle_host', 'America/Denver'),
    (member_a_id, 'Lifecycle Member A', 'lifecycle_member_a', 'Asia/Kolkata'),
    (member_b_id, 'Lifecycle Member B', 'lifecycle_member_b', 'America/Denver');

  insert into public.challenges (
    id, owner_id, slug, name, description, visibility, status,
    starts_on, ends_on, time_zone
  ) values
    (public_now_id, host_id, 'lifecycle-public-now', 'Public Now', '', 'public', 'active', current_date - 1, current_date + 30, 'America/Denver'),
    (public_switch_id, host_id, 'lifecycle-public-switch', 'Public Switch', '', 'public', 'active', current_date - 1, current_date + 30, 'America/Denver'),
    (private_now_id, host_id, 'lifecycle-private-now', 'Private Now', '', 'private', 'active', current_date - 1, current_date + 30, 'America/Denver'),
    (public_future_id, host_id, 'lifecycle-public-future', 'Public Future', '', 'public', 'registration', current_date + 5, current_date + 35, 'America/Denver');

  insert into public.task_definitions (
    challenge_id, rules_version, ordinal, title, instructions,
    task_type, points, required, proof_policy, schedule
  ) values (
    public_now_id, 1, 0, 'Lifecycle task', '', 'boolean', 1,
    true, 'none', '{"kind":"daily"}'::jsonb
  );

  -- A future challenge cannot be joined directly, even if a client bypasses UI.
  perform set_config('request.jwt.claim.sub', member_a_id::text, true);
  failed_as_expected := false;
  begin
    perform public.join_challenge(public_future_id, null);
  exception when others then
    failed_as_expected := sqlerrm like 'This challenge has not started%';
  end;
  if not failed_as_expected then raise exception 'Future direct join was not rejected'; end if;

  -- Public access is immediate and starts on the member local date without backfill.
  joined_member_id := public.join_challenge(public_now_id, null);
  if not exists (
    select 1 from public.challenge_members member
    where member.id = joined_member_id and member.status = 'active'
      and member.scoring_time_zone = 'Asia/Kolkata'
  ) then raise exception 'Public join did not activate with member timezone'; end if;

  perform public.list_today_tasks(public_now_id, current_date);
  local_day := (now() at time zone 'Asia/Kolkata')::date;
  if not exists (
    select 1 from public.task_occurrences occurrence
    where occurrence.member_id = joined_member_id
      and occurrence.local_date = local_day
  ) then raise exception 'Late join did not create the member current local day'; end if;
  if exists (
    select 1 from public.task_occurrences occurrence
    where occurrence.member_id = joined_member_id
      and occurrence.local_date < local_day
  ) then raise exception 'Late join incorrectly backfilled prior days'; end if;

  -- One open membership blocks a second normal join.
  failed_as_expected := false;
  begin
    perform public.join_challenge(public_switch_id, null);
  exception when others then
    failed_as_expected := sqlerrm like 'Finish or leave%';
  end;
  if not failed_as_expected then raise exception 'Second active challenge was not rejected'; end if;

  -- Explicit switching is atomic, forfeits the old challenge, and cannot be reversed.
  perform public.switch_challenge(public_switch_id, null);
  if not exists (
    select 1 from public.challenge_members member
    where member.challenge_id = public_now_id and member.profile_id = member_a_id
      and member.status = 'left' and not member.prize_eligible
      and member.forfeiture_reason = 'switched_challenge'
  ) then raise exception 'Switch did not forfeit the previous challenge'; end if;
  failed_as_expected := false;
  begin
    perform public.join_challenge(public_now_id, null);
  exception when others then
    failed_as_expected := sqlerrm like 'You withdrew%';
  end;
  if not failed_as_expected then raise exception 'Forfeited challenge allowed rejoin'; end if;

  -- Future switching is rejected and must leave the existing membership untouched.
  failed_as_expected := false;
  begin
    perform public.switch_challenge(public_future_id, null);
  exception when others then
    failed_as_expected := sqlerrm like 'This challenge has not started%';
  end;
  if not failed_as_expected then raise exception 'Future switch was not rejected'; end if;
  if not exists (
    select 1 from public.challenge_members member
    where member.challenge_id = public_switch_id and member.profile_id = member_a_id
      and member.status = 'active' and member.prize_eligible
  ) then raise exception 'Rejected future switch did not roll back the forfeiture'; end if;

  -- Private access requires its permanent code and remains pending until host approval.
  perform set_config('request.jwt.claim.sub', member_b_id::text, true);
  failed_as_expected := false;
  begin
    perform public.join_challenge(private_now_id, null);
  exception when others then
    failed_as_expected := sqlerrm like 'A valid invite code%';
  end;
  if not failed_as_expected then raise exception 'Private challenge joined without code'; end if;

  select invite.code into invite_code
  from public.challenge_invites invite
  where invite.challenge_id = private_now_id and invite.revoked_at is null
  order by invite.created_at
  limit 1;
  private_member_id := public.join_challenge(private_now_id, invite_code);
  if not exists (
    select 1 from public.challenge_members member
    where member.id = private_member_id and member.status = 'pending'
  ) then raise exception 'Private join did not create a pending request'; end if;

  perform set_config('request.jwt.claim.sub', host_id::text, true);
  perform public.review_challenge_join_request(private_now_id, private_member_id, true);
  if not exists (
    select 1 from public.challenge_members member
    where member.id = private_member_id and member.status = 'active'
      and member.prize_eligible
  ) then raise exception 'Host approval did not activate private member'; end if;

  -- Queueing with an active challenge requires explicit auto-switch consent.
  perform set_config('request.jwt.claim.sub', member_a_id::text, true);
  failed_as_expected := false;
  begin
    perform public.set_challenge_queued(public_future_id, true, false);
  exception when others then
    failed_as_expected := sqlerrm like 'Confirm that this queue%';
  end;
  if not failed_as_expected then raise exception 'Queue accepted without switch consent'; end if;
  perform public.set_challenge_queued(public_future_id, true, true);

  -- Move the fixture start date to today and process the same production queue worker.
  update public.challenges set starts_on = current_date where id = public_future_id;
  perform public.process_challenge_lifecycle();
  processed := public.process_due_challenge_queues();
  if processed < 1 then raise exception 'Due queue did not process'; end if;
  if not exists (
    select 1 from public.challenges challenge
    where challenge.id = public_future_id and challenge.status = 'active'
  ) then raise exception 'Started challenge did not transition to active'; end if;
  if not exists (
    select 1 from public.challenge_join_queue queue
    where queue.profile_id = member_a_id and queue.challenge_id = public_future_id
      and queue.status = 'joined'
  ) then raise exception 'Queue did not reach joined state'; end if;
  if not exists (
    select 1 from public.challenge_members member
    where member.profile_id = member_a_id and member.challenge_id = public_future_id
      and member.status = 'active'
  ) then raise exception 'Queue did not activate target membership'; end if;
  if not exists (
    select 1 from public.challenge_members member
    where member.profile_id = member_a_id and member.challenge_id = public_switch_id
      and member.status = 'left' and not member.prize_eligible
      and member.forfeiture_reason = 'queued_challenge_started'
  ) then raise exception 'Queue switch did not forfeit previous membership'; end if;

  -- Ending an active challenge freezes membership into completed history.
  perform set_config('request.jwt.claim.sub', host_id::text, true);
  perform public.close_owned_challenge(private_now_id, 'end');
  if not exists (
    select 1 from public.challenge_members member
    where member.id = private_member_id and member.status = 'completed'
  ) then raise exception 'Ending challenge did not complete active member'; end if;

  perform set_config('request.jwt.claim.sub', member_b_id::text, true);
  if not exists (
    select 1 from public.list_my_challenge_history() history
    where history.challenge_id = private_now_id
  ) then raise exception 'Completed challenge did not appear in member history'; end if;
end;
$$;

rollback;
