drop policy if exists "visible challenges are readable" on public.challenges;
create policy "published challenges are readable"
on public.challenges for select
using (
  status <> 'draft'
  and (
    visibility in ('public', 'unlisted')
    or owner_id = auth.uid()
    or public.is_challenge_member(id)
  )
);

do $$
declare
  legacy_function record;
begin
  for legacy_function in
    select procedure.oid::regprocedure as signature
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in ('create_challenge_draft', 'publish_challenge')
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      legacy_function.signature
    );
  end loop;
end;
$$;

comment on policy "published challenges are readable" on public.challenges is
  'Only complete, published challenge records may cross the Data API boundary.';
