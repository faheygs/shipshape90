revoke all on function public.record_challenge_measurement(uuid, numeric, date)
from public, anon, authenticated;

revoke all on table public.challenge_measurements from public, anon, authenticated;

comment on table public.challenge_measurements is
  'Legacy replacement-scoring data retained for migration safety; new body progress uses body_logs.';

alter table public.winner_rules
  drop constraint if exists winner_rules_primary_metric_check;

alter table public.winner_rules
  add constraint winner_rules_primary_metric_check check (
    primary_metric in (
      'total_points',
      'completion_percentage',
      'perfect_days',
      'target_reached_at',
      'team_total',
      'team_average'
    )
  );

revoke all on function public.create_challenge_draft(
  text, text, public.challenge_visibility, text, date, date, text, text, jsonb
) from public, anon, authenticated;

revoke all on function public.create_challenge_draft(
  text, text, public.challenge_visibility, text, date, date, text, jsonb
) from public, anon, authenticated;

comment on column public.winner_rules.bonus_metric is
  'Optional body-progress metric added to the always-on ShipShape Score.';

comment on column public.winner_rules.bonus_calculation is
  'Determines whether body-progress bonus points use percentage or total change.';
