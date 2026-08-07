# ShipShape 90

ShipShape 90 is a cross-platform challenge product for creating structured commitments, completing daily tasks, proving work when required, and competing on deterministic leaderboards.

## Stack

- Mobile: Expo SDK 56, React Native 0.85, Expo Router, React Query.
- Web: Next.js 16 App Router.
- Backend: Supabase Postgres, Auth, Storage, Edge Functions, and RLS.
- Realtime: Ably private channels with a transactional Postgres outbox.
- Shared logic: pure TypeScript domain package for schedules, scoring, streaks, and winners.
- Design: Figma variables and components backed by `packages/tokens/src/tokens.json`.

## Workspace

```text
apps/mobile       iPhone and Android product
apps/web          shipshape90.com marketing and future account/admin UI
packages/api      Runtime-validated API contracts
packages/domain   Pure rules and scoring engine
packages/tokens   Cross-platform design tokens
packages/ui-mobile React Native implementation of the Figma components
supabase          Database migrations and server workflows
docs              Product and architecture decisions
```

## Local setup

1. Install Node 24 and pnpm 11.
2. Copy `.env.example` to `.env.local` and add the Supabase URL and publishable key.
3. Run `pnpm install`.
4. Run `pnpm dev:mobile` for Expo or `pnpm dev:web` for the website.
5. Run `pnpm typecheck && pnpm test` before committing.

The app runs against seeded preview data when Supabase environment variables are absent. Challenge discovery, invite joining, draft creation, avatar upload, Today tasks, community reads, and realtime subscriptions switch to hosted repositories when credentials are present. See `docs/LIVE_SERVICES_SETUP.md` for provisioning.
