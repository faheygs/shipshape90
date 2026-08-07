create or replace function public.delete_my_notification(target_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.notifications notification
  where notification.id = target_notification_id
    and notification.profile_id = auth.uid();

  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

create or replace function public.clear_my_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.notifications notification
  where notification.profile_id = auth.uid();

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_my_notification(uuid) from public, anon, authenticated;
revoke all on function public.clear_my_notifications() from public, anon, authenticated;
grant execute on function public.delete_my_notification(uuid) to authenticated;
grant execute on function public.clear_my_notifications() to authenticated;

comment on function public.delete_my_notification(uuid) is
  'Permanently removes one notification owned by the authenticated member.';
comment on function public.clear_my_notifications() is
  'Permanently removes every notification owned by the authenticated member.';
