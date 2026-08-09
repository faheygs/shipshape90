# Implementation Status

Last audited: 2026-08-09

## Implemented

- Expo Router iPhone app with Home as the default tab, challenge discovery/queueing, creation, notifications, profile, host controls, challenge history, and active challenge views.
- Passwordless six-digit email authentication, Sign in with Apple, Google sign-in, minimal profile setup, avatar upload, and persisted Supabase sessions.
- Public and private challenges, invite/approval behavior, automatic host participation, one-active/one-queued challenge rules, auto-start, irreversible withdrawal, and prize forfeiture.
- Five-step challenge creator with date selection, dynamic task configuration, required Start/Final check-ins, optional checkpoint presets, and optional weight/body-fat finish scoring.
- Participant-local challenge days, task-count-scaled ShipShape scoring, editable past-day history, streak recalculation, live ranks, and final results.
- Private progress logs, required check-in gating, progress photos, zoomable gallery, two-photo comparison, and weight/body-fat trends.
- In-app and push notifications, unread state, swipe-to-clear, clear-all, and notification preferences.
- Supabase Postgres/Auth/Storage/Edge Functions/RLS with an append-only score ledger and transactional realtime outbox.
- Immediate Ably private-channel delivery through a single root mobile bridge with event deduplication and targeted TanStack Query invalidation.
- PostHog analytics, Sentry error monitoring/source-map configuration, Expo EAS Build/Submit/Update, Vercel web delivery, and GitHub Actions CI.
- Shared mobile design tokens/components and feature-focused repositories, hooks, models, and views. Hand-written production files are kept near 200 lines; generated database types are intentionally excluded.

## Verification

- Workspace TypeScript, mobile lint, 22 unit tests, and the optimized Next.js production build pass.
- Expo SDK dependency compatibility passes, and Expo Doctor reports 20/20 checks.
- All 52 local Supabase migrations match the linked project.
- Linked database linting reports no security or RLS errors; only three non-functional PL/pgSQL unused-variable/parameter warnings remain.

## Deferred beyond V1

- General community/social posting and moderation.
- Task proof or moderator evidence review; daily completion is honor-system task submission.
- Paid subscriptions and billing.
- Android store release after the iPhone testing/release path is stable.
- Broader device automation coverage (Maestro) and web end-to-end coverage (Playwright).
