begin;

do $$
declare
  host_id constant uuid := 'f0000000-0000-4000-8000-000000000101';
  member_a_id constant uuid := 'f0000000-0000-4000-8000-000000000102';
  member_b_id constant uuid := 'f0000000-0000-4000-8000-000000000103';
  member_c_id constant uuid := 'f0000000-0000-4000-8000-000000000104';
  member_d_id constant uuid := 'f0000000-0000-4000-8000-000000000105';
  public_now_id constant uuid := 'f1000000-0000-4000-8000-000000000101';
  public_switch_id constant uuid := 'f1000000-0000-4000-8000-000000000102';
  private_now_id constant uuid := 'f1000000-0000-4000-8000-000000000103';
  public_future_id constant uuid := 'f1000000-0000-4000-8000-000000000104';
  private_future_id constant uuid := 'f1000000-0000-4000-8000-000000000105';
  joined_member_id uuid;
  private_member_id uuid;
  private_code_member_id uuid;
  access_request_id uuid;
  invite_code text;
  future_invite_code text;
  processed integer;
  local_day date;
  failed_as_expected boolean;
begin
  insert into auth.users (id, is_sso_user, is_anonymous, created_at, updated_at)
  values
    (host_id, false, false, now(), now()),
    (member_a_id, false, false, now(), now()),
    (member_b_id, false, false, now(), now()),
    (member_c_id, false, false, now(), now()),
    (member_d_id, false, false, now(), now());

  insert into public.profiles (id, display_name, handle, time_zone)
  values
    (host_id, 'Lifecycle Host', 'lifecycle_host', 'America/Denver'),
    (member_a_id, 'Lifecycle Member A', 'lifecycle_member_a', 'Asia/Kolkata'),
    (member_b_id, 'Lifecycle Member B', 'lifecycle_member_b', 'America/Denver'),
    (member_c_id, 'Lifecycle Member C', 'lifecycle_member_c', 'America/New_York'),
    (member_d_id, 'Lifecycle Member D', 'lifecycle_member_d', 'America/Denver');

  insert into public.challenges (
    id, owner_id, slug, name, description, visibility, status,
    starts_on, ends_on, time_zone
  ) values
    (public_now_id, host_id, 'lifecycle-public-now', 'Public Now', '', 'public', 'active', current_date - 1, current_date + 30, 'America/Denver'),
    (public_switch_id, host_id, 'lifecycle-public-switch', 'Public Switch', '', 'public', 'active', current_date - 1, current_date + 30, 'America/Denver'),
    (private_now_id, host_id, 'lifecycle-private-now', 'Private Now', '', 'private', 'active', current_date - 1, current_date + 30, 'America/Denver'),
    (public_future_id, host_id, 'lifecycle-public-future', 'Public Future', '', 'public', 'registration', current_date + 5, current_date + 35, 'America/Denver'),
    (private_future_id, host_id, 'lifecycle-private-future', 'Private Future', '', 'private', 'registration', current_date + 6, current_date + 36, 'America/Denver');

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

  -- A private request is access-only: it never consumes the active membership slot.
  perform set_config('request.jwt.claim.sub', member_b_id::text, true);
  failed_as_expected := false;
  begin
    perform public.join_challenge(private_now_id, null);
  exception when others then
    failed_as_expected := sqlerrm like 'A valid invite code%';
  end;
  if not failed_as_expected then raise exception 'Private challenge joined without code'; end if;

  if public.request_private_challenge_join(private_now_id, null) <> 'requested' then
    raise exception 'Private access request was not created';
  end if;
  if exists (select 1 from public.challenge_members member
    where member.profile_id = member_b_id and member.challenge_id = private_now_id) then
    raise exception 'Access request incorrectly consumed a membership slot';
  end if;
  select request.id into access_request_id from public.challenge_access_requests request
  where request.profile_id = member_b_id and request.challenge_id = private_now_id;
  if not exists (select 1 from public.notifications notification
    where notification.profile_id = host_id and notification.notification_type = 'challenge.join_requested'
      and notification.action_path = '/manage-challenge/' || private_now_id::text || '?section=requests') then
    raise exception 'Host did not receive the actionable private request notification';
  end if;

  perform set_config('request.jwt.claim.sub', host_id::text, true);
  perform public.review_challenge_join_request(private_now_id, access_request_id, true);
  if not exists (
    select 1 from public.challenge_access_requests request
    where request.id = access_request_id and request.status = 'approved'
  ) then raise exception 'Host approval did not unlock private access'; end if;
  if not exists (select 1 from public.notifications notification
    where notification.profile_id = member_b_id and notification.notification_type = 'challenge.request_approved'
      and notification.action_path = '/challenge-detail/' || private_now_id::text) then
    raise exception 'Applicant did not receive the actionable approval notification';
  end if;

  -- Approving a conflict-free private request for a future challenge places the
  -- applicant directly into its start queue.
  perform set_config('request.jwt.claim.sub', member_d_id::text, true);
  if public.request_private_challenge_join(private_future_id, null) <> 'requested' then
    raise exception 'Future private access request was not created';
  end if;
  select request.id into access_request_id from public.challenge_access_requests request
  where request.profile_id = member_d_id and request.challenge_id = private_future_id;
  perform set_config('request.jwt.claim.sub', host_id::text, true);
  perform public.review_challenge_join_request(private_future_id, access_request_id, true);
  if not exists (
    select 1 from public.challenge_join_queue queue
    where queue.profile_id = member_d_id and queue.challenge_id = private_future_id
      and queue.status = 'queued' and not queue.allow_auto_switch
  ) then raise exception 'Approved future private applicant was not queued for start'; end if;

  perform set_config('request.jwt.claim.sub', member_b_id::text, true);
  private_member_id := public.join_challenge(private_now_id, null);
  if not exists (
    select 1 from public.challenge_members member
    where member.id = private_member_id and member.status = 'active'
      and member.prize_eligible
  ) then raise exception 'Approved private access did not join immediately'; end if;

  -- A valid code bypasses approval, while a future code unlocks queue access.
  select invite.code into invite_code from public.challenge_invites invite
  where invite.challenge_id = private_now_id and invite.revoked_at is null
  order by invite.created_at limit 1;
  perform set_config('request.jwt.claim.sub', member_c_id::text, true);
  private_code_member_id := public.join_challenge(private_now_id, invite_code);
  if not exists (select 1 from public.challenge_members member
    where member.id = private_code_member_id and member.status = 'active') then
    raise exception 'Private code did not grant immediate active access';
  end if;

  select invite.code into future_invite_code from public.challenge_invites invite
  where invite.challenge_id = private_future_id and invite.revoked_at is null
  order by invite.created_at limit 1;
  if public.request_private_challenge_join(private_future_id, future_invite_code) <> 'approved' then
    raise exception 'Future private code did not unlock access';
  end if;
  perform public.set_challenge_queued(private_future_id, true, true);
  update public.challenges set starts_on = current_date where id = private_future_id;
  perform public.process_challenge_lifecycle();
  processed := public.process_due_challenge_queues();
  if processed < 1 then raise exception 'Approved private queue did not process'; end if;
  if not exists (select 1 from public.challenge_members member
    where member.profile_id = member_c_id and member.challenge_id = private_future_id
      and member.status = 'active' and member.scoring_time_zone = 'America/New_York') then
    raise exception 'Private queue did not preserve the member local timezone';
  end if;
  if not exists (select 1 from public.challenge_access_requests request
    where request.profile_id = member_c_id and request.challenge_id = private_future_id
      and request.status = 'joined') then
    raise exception 'Private queue did not close the access request';
  end if;

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

  -- A decline is final unless the host later shares the valid private code.
  if public.request_private_challenge_join(private_now_id, null) <> 'requested' then
    raise exception 'Second private access request was not created';
  end if;
  select request.id into access_request_id from public.challenge_access_requests request
  where request.profile_id = member_a_id and request.challenge_id = private_now_id;
  perform set_config('request.jwt.claim.sub', host_id::text, true);
  perform public.review_challenge_join_request(private_now_id, access_request_id, false);
  perform set_config('request.jwt.claim.sub', member_a_id::text, true);
  failed_as_expected := false;
  begin
    perform public.request_private_challenge_join(private_now_id, null);
  exception when others then
    failed_as_expected := sqlerrm like 'The host declined%';
  end;
  if not failed_as_expected then raise exception 'Declined request could be resubmitted without a code'; end if;
  if public.request_private_challenge_join(private_now_id, invite_code) <> 'approved' then
    raise exception 'Valid code did not override the declined request';
  end if;

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
