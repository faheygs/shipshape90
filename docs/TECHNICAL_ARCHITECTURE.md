# ShipShape 90 Technical Architecture

## Repository layout

The product will use a TypeScript monorepo:

```text
apps/
  mobile/       Expo React Native application
  web/          Next.js marketing, account, and admin application
packages/
  api/          Typed API contracts and query helpers
  config/       Shared linting and TypeScript configuration
  domain/       Challenge rules and scoring engine
  tokens/       Figma-aligned design tokens and generated outputs
  ui-mobile/    Mobile design-system components
  ui-web/       Web design-system components
supabase/
  migrations/   Database schema and RLS policies
  functions/    Privileged server workflows
docs/           Product, data, design, and operational documentation
```

## Application stack

- Mobile: Expo, React Native, Expo Router, TypeScript.
- Web/admin: Next.js App Router, React, TypeScript.
- Data synchronization: TanStack Query.
- Forms and validation: React Hook Form and Zod.
- Local client state: small Zustand stores only for transient UI state.
- Backend: Supabase Postgres, Auth, Storage, Edge Functions, Row-Level Security, and server functions.
- Realtime delivery: Ably private channels behind a provider adapter; Postgres remains authoritative.
- Mobile subscriptions: RevenueCat when paid plans are introduced.
- Web billing: Stripe when paid plans are introduced.
- Product analytics: PostHog with a documented event taxonomy.
- Error monitoring: Sentry with source maps and release tracking.
- Mobile delivery: Expo EAS Build, Submit, and Updates.
- Web delivery: Vercel.
- CI: GitHub Actions.

## Domain boundaries

- Identity: accounts, profiles, consent, preferences, blocks.
- Catalog: templates, public discovery, categories, search.
- Challenge: lifecycle, membership, invitations, roles, announcements.
- Rules: task catalog, task schedules, checkpoints, scoring, and tie-breakers.
- Participation: exclusive membership, daily task instances, check-ins, evidence, reviews, and withdrawal.
- Competition: points ledger, streaks, leaderboard snapshots, final results.
- Social: activity entries, comments, reactions, moderation reports.
- Notifications: in-app, push, and transactional email preferences.

## Core persistence model

- `profiles`
- `challenge_templates`
- `challenges`
- `challenge_members`
- `challenge_invites`
- `task_definitions`
- `task_schedules`
- `task_catalog`
- `checkpoints`
- `task_occurrences`
- `checkins`
- `evidence_assets`
- `evidence_reviews`
- `score_ledger`
- `streaks`
- `leaderboard_snapshots`
- `winner_rules`
- `challenge_results`
- `stake_ledger_entries`
- `activity_entries`
- `comments`
- `reactions`
- `notifications`
- `moderation_reports`

## Important implementation rules

- Scoring is ledger-based and append-only. Totals are projections, never the source of truth.
- Published challenge rules are versioned and immutable after start unless participants consent to a new version.
- Task occurrences are materialized from schedules in the challenge time zone and rendered in each member's local time.
- Idempotency keys protect check-ins, scoring events, notifications, and scheduled jobs.
- Row-Level Security isolates private challenges, memberships, evidence, and photos.
- A partial unique index permits only one pending or active membership per profile.
- Membership lifecycle triggers make prize forfeiture irreversible and prevent same-challenge rejoining after withdrawal.
- Durable domain events are written to a transactional outbox before realtime fan-out.
- Evidence uses signed URLs; storage buckets are private by default.
- Administrative operations run through privileged server functions, never a service key in clients.
- The rules engine is a pure TypeScript package shared by server tests and client previews.
- Leaderboards are rebuilt from the score ledger and periodically snapshotted for fast reads.

## Quality gates

- Unit tests for schedule generation, points, bonuses, modifiers, winner rules, and tie-breakers.
- Property tests for ledger invariants and scoring idempotency.
- Database tests for every RLS policy.
- Component tests for design-system states and accessibility labels.
- Maestro coverage for account creation, joining, daily completion, and challenge creation.
- Playwright coverage for marketing, account, and admin flows.
- Type checking, linting, tests, and migration validation required in CI.
