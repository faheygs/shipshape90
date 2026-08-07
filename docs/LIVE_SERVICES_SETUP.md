# Live Services Setup

The app runs with local preview data when credentials are absent. These steps switch it to hosted data without putting server secrets in the mobile bundle.

## Supabase

1. Create a free Supabase project and link this workspace with `supabase link --project-ref <project-ref>`.
2. Copy the project URL and publishable key into `.env.local` as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Apply the migrations with `supabase db push`.
4. In the email OTP template, include the token variable so the six-digit in-app verification screen receives a code.
5. Deploy `ably-token` and `relay-realtime-outbox` from `supabase/functions`.

ShipShape90 does not use phone OTP. Phone authentication is intentionally excluded because Supabase requires an external SMS delivery provider.

## Sign in with Apple

1. Enable Sign in with Apple for the `com.shipshape90.app` App ID in the Apple Developer portal.
2. Enable Apple under Supabase Authentication providers and add `com.shipshape90.app` as an accepted native client ID.
3. Build with the Apple-sign-in capability enabled. The native flow sends Apple’s identity token directly to Supabase and does not require SMS or a rotating web OAuth secret.

## Ably

1. Create an Ably app on the free tier and copy its API key.
2. Generate a long random relay secret.
3. Store both only as Supabase secrets:

```powershell
supabase secrets set ABLY_API_KEY=<key> OUTBOX_RELAY_SECRET=<secret>
```

4. Store the project URL and relay secret in Supabase Vault as `shipshape_project_url` and `shipshape_outbox_relay_secret`.
5. The `domain_event_outbox` insert trigger uses asynchronous `pg_net` to invoke `relay-realtime-outbox` immediately after the transaction commits. The one-minute `pg_cron` job is only a recovery sweep for failed or interrupted deliveries; it is not the primary delivery path. Each Ably message uses the outbox event ID as its idempotency key, and the relay acknowledges delivery through a lease-checked database function. The relay endpoint skips Supabase's JWT gateway because it performs its own constant-value secret check.
6. Mobile clients receive short-lived, user-bound, challenge-scoped token requests from `ably-token` and never receive the Ably API key.

Both functions use the current `@supabase/server` request context, asymmetric-key-compatible authentication, and the platform-provided `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS`. They do not depend on the deprecated legacy anonymous or service-role key variables.

## Verification

Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`, then start the mobile app with `pnpm dev:mobile`.
