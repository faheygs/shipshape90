create or replace function public.list_my_challenge_checkpoints(target_challenge_id uuid)
returns table (
  checkpoint_id uuid,
  checkpoint_kind text,
  label text,
  day_number integer,
  scheduled_on date,
  requires_weight boolean,
  requires_body_fat boolean,
  requires_photo boolean,
  body_log_id uuid,
  completed_at timestamptz,
  weight numeric,
  body_fat_percentage numeric,
  photo_path text,
  is_due boolean,
  is_blocking boolean,
  can_complete boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  member_record record;
  challenge_record record;
  scoring_date date;
  first_scoring_date date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select member.id, member.joined_at, member.scoring_time_zone
  into member_record
  from public.challenge_members member
  where member.challenge_id = target_challenge_id
    and member.profile_id = auth.uid()
    and member.status in ('active', 'completed');
  if member_record.id is null then raise exception 'Challenge membership required'; end if;

  select challenge.starts_on, challenge.ends_on, challenge.rules_version
  into challenge_record
  from public.challenges challenge where challenge.id = target_challenge_id;

  scoring_date := (now() at time zone member_record.scoring_time_zone)::date;
  first_scoring_date := greatest(
    challenge_record.starts_on,
    (member_record.joined_at at time zone member_record.scoring_time_zone)::date
  );

  return query
  with scheduled as (
    select checkpoint.*,
      case checkpoint.checkpoint_kind
        when 'start' then first_scoring_date
        when 'final' then challenge_record.ends_on
        else challenge_record.starts_on + (checkpoint.day_number - 1)
      end as due_date
    from public.challenge_checkpoints checkpoint
    where checkpoint.challenge_id = target_challenge_id
      and checkpoint.rules_version = challenge_record.rules_version
  ), eligible as (
    select scheduled.* from scheduled
    where scheduled.checkpoint_kind <> 'milestone' or scheduled.due_date >= first_scoring_date
  ), rows_with_state as (
    select eligible.*, log.id as log_id, log.updated_at as log_completed_at,
      log.weight as log_weight, log.body_fat_percentage as log_body_fat, log.photo_path as log_photo
    from eligible
    left join public.body_logs log
      on log.checkpoint_id = eligible.id and log.profile_id = auth.uid()
  )
  select
    checkpoint_row.id, checkpoint_row.checkpoint_kind, checkpoint_row.label,
    checkpoint_row.day_number, checkpoint_row.due_date,
    checkpoint_row.requires_weight, checkpoint_row.requires_body_fat, checkpoint_row.requires_photo,
    checkpoint_row.log_id, checkpoint_row.log_completed_at, checkpoint_row.log_weight,
    checkpoint_row.log_body_fat, checkpoint_row.log_photo,
    checkpoint_row.due_date <= scoring_date,
    checkpoint_row.due_date <= scoring_date and checkpoint_row.log_id is null,
    checkpoint_row.due_date <= scoring_date
  from rows_with_state checkpoint_row
  order by checkpoint_row.due_date, checkpoint_row.ordinal;
end;
$$;

revoke all on function public.list_my_challenge_checkpoints(uuid) from public, anon, authenticated;
grant execute on function public.list_my_challenge_checkpoints(uuid) to authenticated;
