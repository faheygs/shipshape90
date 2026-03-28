-- ================================================
-- ShipShape90: FULL DATA RESET (DESTRUCTIVE)
-- Removes: all public rows (incl. user_badges via CASCADE) + all Auth users (sign-in accounts).
-- Preferred: from shipshape90 folder run `npm run reset-db` (clears storage + all Auth users; CASCADE wipes app data).
-- Or manual: `npm run clear-storage`, then run this script in SQL Editor.
-- Storage: SQL cannot DELETE storage.objects (Supabase blocks it). Or: Dashboard → Storage → checkin-photos → Delete.
-- IRREVERSIBLE.
-- ================================================

BEGIN;

-- 1) App tables (FKs: everything hangs off profiles → CASCADE clears dependents)
TRUNCATE TABLE public.profiles CASCADE;

-- 2) Auth: clear sessions/tokens first, then identities, then users
DELETE FROM auth.sessions;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.identities;
DELETE FROM auth.users;

COMMIT;

-- If a line errors with “relation does not exist”, delete that line and run again
-- from the top (or run only the remaining statements in a new query).
