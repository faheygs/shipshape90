alter table public.task_catalog
  add column if not exists allowed_units text[] not null default '{}'::text[];

update public.task_catalog
set title = 'Workout 1',
    description = 'Complete any workout that fits the challenge rules.',
    task_type = 'duration',
    default_target_value = 45,
    default_unit = 'minutes',
    allowed_units = array['minutes']::text[]
where owner_id is null and title = 'Complete a workout';

insert into public.task_catalog (
  owner_id,
  category,
  title,
  description,
  task_type,
  default_target_value,
  default_unit,
  allowed_units,
  default_proof_policy,
  safety_note,
  is_public
)
values (
  null,
  'fitness',
  'Workout 2',
  'Complete a second workout of any type that fits the challenge rules.',
  'duration',
  30,
  'minutes',
  array['minutes']::text[],
  'optional',
  'Choose an intensity appropriate for your current ability.',
  true
)
on conflict do nothing;

update public.task_catalog
set title = 'Steps',
    description = 'Reach the number of steps set by the challenge creator.',
    allowed_units = array['steps']::text[]
where owner_id is null and title = 'Daily steps';

update public.task_catalog
set title = 'Read or listen',
    description = 'Read a chosen number of pages or listen to an audiobook for a chosen number of minutes.',
    default_target_value = 10,
    default_unit = 'pages',
    allowed_units = array['pages', 'minutes']::text[]
where owner_id is null and title = 'Read ten pages';

update public.task_catalog
set allowed_units = case
  when default_unit is null then '{}'::text[]
  else array[default_unit]::text[]
end
where cardinality(allowed_units) = 0;

delete from public.task_catalog
where owner_id is null
  and title in (
    'Morning mobility',
    'Strength session',
    'Cardio session',
    'Core work',
    'Morning water',
    'Recovery session',
    'Make your bed',
    'Plan tomorrow'
  );

alter table public.challenges
  alter column category set default 'general';

drop function if exists public.create_challenge_draft(
  text,
  text,
  text,
  public.challenge_visibility,
  text,
  date,
  date,
  uuid[]
);

create or replace function public.create_challenge_draft(
  challenge_name text,
  challenge_description text,
  challenge_visibility public.challenge_visibility,
  challenge_join_policy text,
  challenge_starts_on date,
  challenge_ends_on date,
  challenge_reward text,
  configured_tasks jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_challenge_id uuid;
  generated_slug text;
  configured_task_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles profile where profile.id = auth.uid()) then
    raise exception 'Complete your profile before creating a challenge';
  end if;
  if char_length(trim(challenge_name)) not between 2 and 80 then
    raise exception 'Challenge name must be 2–80 characters';
  end if;
  if char_length(trim(challenge_description)) > 1000 then
    raise exception 'Challenge description is too long';
  end if;
  if challenge_join_policy not in ('open', 'approval', 'invite_only') then
    raise exception 'Invalid join policy';
  end if;
  if challenge_ends_on < challenge_starts_on then
    raise exception 'End date must be on or after the start date';
  end if;
  if char_length(trim(challenge_reward)) not between 2 and 200 then
    raise exception 'Describe what the winner receives';
  end if;
  if configured_tasks is null or jsonb_typeof(configured_tasks) <> 'array' then
    raise exception 'Challenge tasks must be an array';
  end if;

  configured_task_count := jsonb_array_length(configured_tasks);
  if configured_task_count not between 1 and 20 then
    raise exception 'Choose between 1 and 20 tasks';
  end if;
  if (
    select count(distinct source.item ->> 'catalogTaskId')
    from jsonb_array_elements(configured_tasks) source(item)
  ) <> configured_task_count then
    raise exception 'A task can only be selected once';
  end if;
  if (
    select count(*)
    from jsonb_array_elements(configured_tasks) source(item)
    join public.task_catalog catalog
      on catalog.id = (source.item ->> 'catalogTaskId')::uuid
    where catalog.is_public or catalog.owner_id = auth.uid()
  ) <> configured_task_count then
    raise exception 'One or more selected tasks are unavailable';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(configured_tasks) source(item)
    join public.task_catalog catalog
      on catalog.id = (source.item ->> 'catalogTaskId')::uuid
    where catalog.task_type in ('count', 'quantity', 'duration')
      and (
        coalesce(nullif(source.item ->> 'targetValue', '')::numeric, catalog.default_target_value) is null
        or coalesce(nullif(source.item ->> 'targetValue', '')::numeric, catalog.default_target_value) <= 0
      )
  ) then
    raise exception 'Every measurable task needs a target greater than zero';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(configured_tasks) source(item)
    join public.task_catalog catalog
      on catalog.id = (source.item ->> 'catalogTaskId')::uuid
    where cardinality(catalog.allowed_units) > 0
      and not (
        coalesce(nullif(trim(source.item ->> 'unit'), ''), catalog.default_unit) = any(catalog.allowed_units)
      )
  ) then
    raise exception 'One or more task units are invalid';
  end if;

  generated_slug := trim(both '-' from regexp_replace(lower(trim(challenge_name)), '[^a-z0-9]+', '-', 'g'))
    || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.challenges (
    owner_id,
    slug,
    name,
    description,
    category,
    visibility,
    join_policy,
    status,
    starts_on,
    ends_on,
    time_zone,
    prize_description
  )
  values (
    auth.uid(),
    generated_slug,
    trim(challenge_name),
    trim(challenge_description),
    'general',
    challenge_visibility,
    challenge_join_policy,
    'draft',
    challenge_starts_on,
    challenge_ends_on,
    'UTC',
    trim(challenge_reward)
  )
  returning id into created_challenge_id;

  insert into public.task_definitions (
    challenge_id,
    rules_version,
    ordinal,
    title,
    instructions,
    task_type,
    target_value,
    unit,
    points,
    required,
    proof_policy,
    schedule,
    catalog_task_id
  )
  select
    created_challenge_id,
    1,
    source.ordinality - 1,
    catalog.title,
    coalesce(nullif(trim(source.item ->> 'instructions'), ''), catalog.description),
    catalog.task_type,
    case
      when catalog.task_type in ('count', 'quantity', 'duration')
        then coalesce(nullif(source.item ->> 'targetValue', '')::numeric, catalog.default_target_value)
      else null
    end,
    case
      when catalog.task_type in ('count', 'quantity', 'duration')
        then coalesce(nullif(trim(source.item ->> 'unit'), ''), catalog.default_unit)
      else null
    end,
    1,
    true,
    catalog.default_proof_policy,
    '{"kind":"daily"}'::jsonb,
    catalog.id
  from jsonb_array_elements(configured_tasks) with ordinality source(item, ordinality)
  join public.task_catalog catalog
    on catalog.id = (source.item ->> 'catalogTaskId')::uuid
  order by source.ordinality;

  insert into public.winner_rules (challenge_id, rules_version, primary_metric, tie_breakers)
  values (
    created_challenge_id,
    1,
    'total_points',
    '["completion_percentage","perfect_days"]'::jsonb
  );

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  values (
    'user:' || auth.uid()::text || ':notifications',
    'challenge.draft_created',
    created_challenge_id,
    jsonb_build_object(
      'challengeId', created_challenge_id,
      'name', trim(challenge_name),
      'reward', trim(challenge_reward)
    )
  );

  return created_challenge_id;
end;
$$;

revoke all on function public.create_challenge_draft(
  text,
  text,
  public.challenge_visibility,
  text,
  date,
  date,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.create_challenge_draft(
  text,
  text,
  public.challenge_visibility,
  text,
  date,
  date,
  text,
  jsonb
) to authenticated;

comment on function public.create_challenge_draft(
  text,
  text,
  public.challenge_visibility,
  text,
  date,
  date,
  text,
  jsonb
) is 'Creates a challenge with an explicit winner reward and creator-configured daily task targets.';
