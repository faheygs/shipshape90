create or replace function public.create_challenge(
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
  configured_tasks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_challenge_id uuid;
  published_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  created_challenge_id := public.create_challenge_draft(
    challenge_name,
    challenge_description,
    challenge_visibility,
    challenge_join_policy,
    challenge_starts_on,
    challenge_ends_on,
    challenge_reward,
    challenge_weight_bonus_calculation,
    challenge_body_fat_bonus_calculation,
    configured_checkpoints,
    configured_tasks
  );

  published_status := public.publish_challenge(created_challenge_id);

  return jsonb_build_object(
    'challengeId', created_challenge_id,
    'status', published_status
  );
end;
$$;

revoke all on function public.create_challenge(
  text, text, public.challenge_visibility, text, date, date, text, text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.create_challenge(
  text, text, public.challenge_visibility, text, date, date, text, text, text, jsonb, jsonb
) to authenticated;

-- The lower-level two-step functions are implementation details. Clients must
-- use create_challenge so a failed publish rolls the entire transaction back.
revoke all on function public.create_challenge_draft(
  text, text, public.challenge_visibility, text, date, date, text, text, text, jsonb, jsonb
) from authenticated;
revoke all on function public.publish_challenge(uuid) from authenticated;

-- Drafts were only produced by the retired two-step client flow. They have no
-- product meaning and are safe to remove with their cascade-owned setup rows.
delete from public.challenges where status = 'draft';

comment on function public.create_challenge(
  text, text, public.challenge_visibility, text, date, date, text, text, text, jsonb, jsonb
) is 'Creates and publishes a complete challenge atomically; no draft persists when any step fails.';
