# Implementation Status

## Complete in this foundation

- Warm Ember/Gold cross-platform token source with semantic success and danger colors.
- Figma foundations plus validated Button, Task Check, Progress Ring, Challenge Card, and Leaderboard Row component sets.
- Expo Router mobile shell with Home, Challenges, Create, Community, and Profile tabs.
- Active challenge hub containing Today, leaderboard, progress, activity, and editable challenge History.
- Native Sign in with Apple, passwordless email fallback, six-digit verification, minimal profile setup, persisted Supabase sessions, and a credential-free local preview path.
- Full-card Today mission interaction with immediate projected points, −3 missed-task penalties, task-count-scaled perfect-day/streak bonuses, and authoritative day submission.
- Calendar-based day history with past-day task correction, ledger replacement, forward streak recalculation, immediate rank updates, and permanent withdrawal disclosure.
- Next.js marketing site for `shipshape90.com`, responsive from mobile through desktop.
- Pure TypeScript schedule, scoring, streak, penalty, and winner-ordering logic with tests.
- Runtime-validated API command/result contracts.
- Supabase core schema, RLS, private evidence bucket, live points leaderboard, atomic day finalization, and deadline-driven missed-task ledger entries.
- Exclusive-membership domain rules, database uniqueness, irreversible withdrawal, and prize-forfeiture enforcement.
- Atomic challenge discovery, invite resolution, joining, leaving, and draft-creation RPCs.
- Data-driven task catalog, private/public challenge creation, and invite-code entry flows.
- Hosted avatar upload path plus native iPhone photo-library selection.
- Live Today-task materialization and atomic check-off mutations with offline preview data.
- Community activity read models and Ably private-channel client/relay foundations.
- CI workflow for typechecking, tests, and the production web build.

## Next implementation slices

1. Provision the hosted Supabase project, apply migrations, deploy Edge Functions, and generate database types.
2. Finish creator scoring, rules preview, invites, publishing, and moderation controls.
3. Add proof capture/upload, moderator review, and an explicit undo-window policy.
4. Replace remaining leaderboard/activity preview cards with their hosted read models.
5. Add push notifications, final standings, and result sharing.
6. Add Maestro, Playwright, RLS database tests, analytics, crash reporting, and monitoring.

The Figma Today-screen assembly is queued after the current Figma MCP seat quota resets. Its required component and token inventory is already complete.
