create or replace function public.create_challenge_draft(
  challenge_name text,
  challenge_description text,
  challenge_category text,
  challenge_visibility public.challenge_visibility,
  challenge_join_policy text,
  challenge_starts_on date,
  challenge_ends_on date,
  selected_catalog_task_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_challenge_id uuid;
  generated_slug text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid()) then raise exception 'Complete your profile before creating a challenge'; end if;
  if char_length(trim(challenge_name)) not between 2 and 80 then raise exception 'Challenge name must be 2–80 characters'; end if;
  if challenge_category not in ('fitness','nutrition','hydration','recovery','mindset','habits','outdoor','team') then raise exception 'Invalid challenge category'; end if;
  if challenge_join_policy not in ('open','approval','invite_only') then raise exception 'Invalid join policy'; end if;
  if challenge_ends_on < challenge_starts_on then raise exception 'End date must be on or after the start date'; end if;
  if coalesce(cardinality(selected_catalog_task_ids), 0) not between 1 and 20 then raise exception 'Choose between 1 and 20 tasks'; end if;
  if (select count(*) from public.task_catalog tc where tc.id = any(selected_catalog_task_ids) and (tc.is_public or tc.owner_id = auth.uid())) <> cardinality(selected_catalog_task_ids) then raise exception 'One or more selected tasks are unavailable'; end if;

  generated_slug := trim(both '-' from regexp_replace(lower(trim(challenge_name)), '[^a-z0-9]+', '-', 'g')) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.challenges (owner_id, slug, name, description, category, visibility, join_policy, status, starts_on, ends_on, time_zone)
  values (auth.uid(), generated_slug, trim(challenge_name), trim(challenge_description), challenge_category, challenge_visibility, challenge_join_policy, 'draft', challenge_starts_on, challenge_ends_on, 'UTC')
  returning id into created_challenge_id;

  insert into public.task_definitions (challenge_id, rules_version, ordinal, title, instructions, task_type, target_value, unit, points, required, proof_policy, schedule, catalog_task_id)
  select created_challenge_id, 1, source.ordinality - 1, tc.title, tc.description, tc.task_type, tc.default_target_value, tc.default_unit, 1, true, tc.default_proof_policy, '{"kind":"daily"}'::jsonb, tc.id
  from unnest(selected_catalog_task_ids) with ordinality as source(task_id, ordinality)
  join public.task_catalog tc on tc.id = source.task_id
  order by source.ordinality;

  insert into public.winner_rules (challenge_id, rules_version, primary_metric, tie_breakers)
  values (created_challenge_id, 1, 'total_points', '["completion_percentage","perfect_days"]'::jsonb);

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values ('user:' || auth.uid()::text || ':notifications', 'challenge.draft_created', created_challenge_id, jsonb_build_object('challengeId', created_challenge_id, 'name', trim(challenge_name)));

  return created_challenge_id;
end;
$$;

revoke all on function public.create_challenge_draft(text, text, text, public.challenge_visibility, text, date, date, uuid[]) from public;
grant execute on function public.create_challenge_draft(text, text, text, public.challenge_visibility, text, date, date, uuid[]) to authenticated;
