create or replace function public.is_profile_handle_available(candidate_handle text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_handle text := lower(trim(candidate_handle));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if normalized_handle !~ '^[a-z0-9_]{3,30}$' then
    return false;
  end if;

  return not exists (
    select 1
    from public.profiles
    where handle = normalized_handle
      and id <> auth.uid()
  );
end;
$$;

create or replace function public.save_own_profile(
  profile_display_name text,
  profile_handle text,
  profile_avatar_path text default null,
  profile_time_zone text default 'UTC'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_name text := trim(profile_display_name);
  normalized_handle text := lower(trim(profile_handle));
  normalized_time_zone text := coalesce(nullif(trim(profile_time_zone), ''), 'UTC');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if char_length(normalized_name) < 2 or char_length(normalized_name) > 60 then
    raise exception 'Name must be between 2 and 60 characters';
  end if;

  if normalized_handle !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'Username must be 3-30 characters using letters, numbers, or underscores';
  end if;

  if char_length(normalized_time_zone) > 100 then
    raise exception 'Invalid time zone';
  end if;

  if profile_avatar_path is not null
    and split_part(profile_avatar_path, '/', 1) <> auth.uid()::text then
    raise exception 'Invalid profile photo path';
  end if;

  insert into public.profiles (id, display_name, handle, avatar_path, time_zone)
  values (auth.uid(), normalized_name, normalized_handle, profile_avatar_path, normalized_time_zone)
  on conflict (id) do update
  set display_name = excluded.display_name,
      handle = excluded.handle,
      avatar_path = excluded.avatar_path,
      time_zone = excluded.time_zone,
      updated_at = now();
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'That username is already taken';
end;
$$;

revoke all on function public.is_profile_handle_available(text) from public, anon, authenticated;
revoke all on function public.save_own_profile(text, text, text, text) from public, anon, authenticated;
grant execute on function public.is_profile_handle_available(text) to authenticated;
grant execute on function public.save_own_profile(text, text, text, text) to authenticated;

comment on function public.is_profile_handle_available(text) is
  'Checks handle uniqueness for the authenticated user, including private profiles.';

comment on function public.save_own_profile(text, text, text, text) is
  'Validates and atomically creates or updates the authenticated user profile.';
