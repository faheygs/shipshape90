drop function if exists public.list_challenges();
create function public.list_challenges()
returns table (
  id uuid, slug text, name text, description text, category text,
  visibility public.challenge_visibility, join_policy text, challenge_status text,
  starts_on date, ends_on date, participant_count bigint, membership_status text,
  cover_path text, prize_description text, scoring_method text,
  bonus_metric text, bonus_calculation text,
  weight_bonus_calculation text, body_fat_bonus_calculation text,
  is_saved boolean, is_queued boolean, queue_status text, is_owner boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select challenge.id, challenge.slug, challenge.name, challenge.description, challenge.category,
    challenge.visibility, challenge.join_policy, challenge.status::text,
    challenge.starts_on, challenge.ends_on,
    count(member.id) filter (where member.status in ('pending', 'active', 'completed')),
    coalesce(max(mine.status::text), 'none'), challenge.cover_path, challenge.prize_description,
    'total_points'::text, coalesce(rules.bonus_metric, 'none'), rules.bonus_calculation,
    rules.weight_bonus_calculation, rules.body_fat_bonus_calculation,
    bool_or(saved.profile_id is not null), bool_or(my_queue.status in ('queued', 'blocked')),
    max(my_queue.status), challenge.owner_id = auth.uid()
  from public.challenges challenge
  left join public.challenge_members member on member.challenge_id = challenge.id
  left join public.challenge_members mine on mine.challenge_id = challenge.id and mine.profile_id = auth.uid()
  left join public.winner_rules rules on rules.challenge_id = challenge.id and rules.rules_version = challenge.rules_version
  left join public.challenge_saves saved on saved.challenge_id = challenge.id and saved.profile_id = auth.uid()
  left join public.challenge_join_queue my_queue on my_queue.challenge_id = challenge.id and my_queue.profile_id = auth.uid()
  where challenge.status <> 'draft'
    and (challenge.visibility = 'public' or challenge.owner_id = auth.uid() or mine.id is not null)
  group by challenge.id, rules.bonus_metric, rules.bonus_calculation,
    rules.weight_bonus_calculation, rules.body_fat_bonus_calculation
  order by case when max(mine.status::text) = 'active' then 0 else 1 end,
    challenge.starts_on, challenge.created_at desc;
$$;

revoke all on function public.list_challenges() from public, anon, authenticated;
grant execute on function public.list_challenges() to anon, authenticated;

comment on function public.list_challenges() is
  'Lists published challenges only. Drafts remain private implementation records and never appear in discovery.';
