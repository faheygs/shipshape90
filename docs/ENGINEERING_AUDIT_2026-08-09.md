# Engineering Audit — 2026-08-09

## Outcome

The app is structurally ready for the next device-test cycle. This pass reduced duplicate ownership, made realtime cache updates explicit, split high-risk feature files, removed dead V1 community code, and expanded automated regression coverage without changing the native dependency surface.

## Changes made

- Centralized Ably lifecycle ownership in `RealtimeBridge`; removed screen- and tab-level duplicate subscriptions.
- Added bounded event-ID deduplication and event-type-specific query invalidation.
- Split the challenge creator into a small route coordinator, five step views, a pure validation/payload model, a builder hook, and a publishing hook.
- Split challenge data access into discovery, participation, creation, and shared types.
- Split authentication data access into session/OTP, OAuth, profiles, and shared types.
- Extracted the body-log form and photo selection into a reusable modal component.
- Replaced the obsolete global community repository with challenge-specific activity data access.
- Added mobile tests for realtime deduplication/invalidation and challenge-creation validation.

## Realtime audit

1. A database mutation commits authoritative state and a durable outbox row in the same transaction.
2. The database trigger requests the relay immediately after commit.
3. The relay publishes the stable outbox event ID to an authorized private Ably channel and acknowledges delivery.
4. The root mobile bridge deduplicates the event and invalidates only the affected TanStack Query read models.
5. TanStack Query refetches authoritative state; Ably payloads never become a second source of truth.
6. The scheduled relay remains a recovery mechanism for rows not delivered immediately.

This gives users immediate updates while preserving replay safety and database authority. Ably capability is refreshed after membership-changing user notifications so newly eligible challenge channels can attach without restarting the app.

## Verification evidence

- `pnpm typecheck`: pass.
- `pnpm lint`: pass.
- `pnpm test`: 22/22 tests pass.
- Production web build: pass.
- Expo dependency compatibility: pass.
- Expo Doctor: 20/20 checks pass.
- Supabase migration parity: 52 local / 52 remote, all matched.
- Linked database lint: no security/RLS findings; three low-risk unused PL/pgSQL symbols.
- Repository secret scan: no committed application secrets found; local environment files remain ignored.

## Dependency audit decision

The production dependency audit reports two high advisories for `image-size@1.2.1` and one moderate advisory for `uuid@7.0.3`. All three arrive through Expo/React Native build tooling (`metro` and `xcode`), not application runtime paths. The patched releases require major-version overrides outside the versions declared by the current Expo-compatible toolchain. We did not force those overrides because Metro calls the older `image-size` API directly and an unsupported override could break asset bundling. Recheck after the next Expo SDK/React Native toolchain patch and keep build inputs limited to trusted repository assets.

## Remaining recommended work

- Add Maestro coverage for email/OAuth onboarding, queue-to-active transition, required Start check-in, daily submission, history correction, and leave/forfeit.
- Add Supabase policy tests for every user role and private-media path.
- Clean the three PL/pgSQL unused-symbol warnings in a dedicated migration after confirming function signature compatibility.
- Re-run the dependency audit with each Expo SDK patch and remove this exception when upstream Metro/Xcode dependencies are patched.
