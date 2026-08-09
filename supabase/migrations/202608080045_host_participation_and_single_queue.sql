-- A queue is a real future commitment, not a bookmark. Keep the earliest
-- upcoming commitment if legacy data contains more than one open queue.
with ranked_queues as (
  select queue.profile_id, queue.challenge_id,
    row_number() over (
      partition by queue.profile_id
      order by challenge.starts_on, queue.queued_at, queue.challenge_id
    ) as position
  from public.challenge_join_queue queue
  join public.challenges challenge on challenge.id = queue.challenge_id
  where queue.status in ('queued', 'blocked')
)
delete from public.challenge_join_queue queue
using ranked_queues ranked
where queue.profile_id = ranked.profile_id
  and queue.challenge_id = ranked.challenge_id
  and ranked.position > 1;

create unique index if not exists one_open_challenge_queue_per_profile_idx
  on public.challenge_join_queue (profile_id)
  where status in ('queued', 'blocked');

create or replace function public.replace_challenge_queue(
  target_challenge_id uuid,
  allow_switch_at_start boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  delete from public.challenge_join_queue queue
  where queue.profile_id = auth.uid()
    and queue.challenge_id <> target_challenge_id
    and queue.status in ('queued', 'blocked');

  return public.set_challenge_queued(
    target_challenge_id,
    true,
    allow_switch_at_start
  );
end;
$$;

revoke all on function public.replace_challenge_queue(uuid, boolean) from public, anon, authenticated;
grant execute on function public.replace_challenge_queue(uuid, boolean) to authenticated;

drop function if exists public.create_challenge(
  text, text, public.challenge_visibility, text, date, date, text, text, text, jsonb, jsonb
);

create function public.create_challenge(
  challenge_name text,
  challenge_description text,
  challenge_visibility public.challenge_visibility,
  challenge_join_policy text,
  challenge_starts_on date,
  challenge_ends_on date,
  challenge_reward text,
  challenge_weight_bonus_calculation text,
  challenge_body_fat_bonus_calculation text,
  configured_checkpoints jsonb,
  configured_tasks jsonb,
  creator_allow_switch boolean default false,
  replace_existing_queue boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_challenge_id uuid;
  published_status text;
  creator_participating boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  created_challenge_id := public.create_challenge_draft(
    challenge_name, challenge_description, challenge_visibility, challenge_join_policy,
    challenge_starts_on, challenge_ends_on, challenge_reward,
    challenge_weight_bonus_calculation, challenge_body_fat_bonus_calculation,
    configured_checkpoints, configured_tasks
  );

  published_status := public.publish_challenge(created_challenge_id);

  select exists (
    select 1 from public.challenge_members member
    where member.challenge_id = created_challenge_id
      and member.profile_id = auth.uid()
      and member.status = 'active'
  ) into creator_participating;

  if published_status = 'active' and not creator_participating then
    if not creator_allow_switch then
      raise exception 'Creating this challenge requires confirmation to leave your current challenge';
    end if;
    perform public.switch_challenge(created_challenge_id, null);
    creator_participating := true;
  elsif published_status = 'registration' then
    if replace_existing_queue then
      perform public.replace_challenge_queue(created_challenge_id, creator_allow_switch);
    else
      perform public.set_challenge_queued(created_challenge_id, true, creator_allow_switch);
    end if;
  end if;

  return jsonb_build_object(
    'challengeId', created_challenge_id,
    'status', published_status,
    'creatorParticipating', creator_participating,
    'creatorQueued', published_status = 'registration'
  );
end;
$$;

revoke all on function public.create_challenge(
  text, text, public.challenge_visibility, text, date, date, text, text, text,
  jsonb, jsonb, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.create_challenge(
  text, text, public.challenge_visibility, text, date, date, text, text, text,
  jsonb, jsonb, boolean, boolean
) to authenticated;

comment on index public.one_open_challenge_queue_per_profile_idx is
  'A profile may reserve exactly one future challenge at a time.';
comment on function public.create_challenge(
  text, text, public.challenge_visibility, text, date, date, text, text, text,
  jsonb, jsonb, boolean, boolean
) is 'Atomically publishes a challenge and enrolls or queues its creator as a participant.';
