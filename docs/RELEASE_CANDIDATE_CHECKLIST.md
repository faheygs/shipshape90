# ShipShape 90 release candidate checklist

This is the gate for every TestFlight or production build. A release is ready only when every required item below is complete.

## 1. Release environment

- [ ] Supabase production URL and publishable key are configured in EAS.
- [ ] Ably API credentials and the outbox relay secret remain server-side only.
- [ ] `EXPO_PUBLIC_SENTRY_DSN` is configured for crash reporting.
- [ ] `SENTRY_ORG`, `SENTRY_PROJECT`, and secret `SENTRY_AUTH_TOKEN` are configured in EAS so production stack traces are readable.
- [ ] `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_HOST` are configured for product analytics.
- [ ] No password, service-role key, Ably API key, or relay secret is present in an `EXPO_PUBLIC_` variable.
- [ ] Production builds use the `production` EAS Update channel; TestFlight candidates use `preview` until promoted.

## 2. Privacy boundaries

Analytics and diagnostics may contain:

- Sanitized screen names
- Anonymous device and app version information
- The signed-in profile ID
- App lifecycle events and technical error details

They must never contain:

- Email, display name, username, or notification content
- Weight, body-fat percentage, progress notes, or task text
- Profile or progress photos
- Challenge invite codes, raw challenge IDs, authentication tokens, or request bodies
- Session recordings, screenshots, or view-hierarchy captures

## 3. App Store Connect privacy answers

Review these against the production build before submission:

- Contact info: email address is used for account authentication.
- User content: profile photos, progress photos, challenge content, and private notes are user-provided content.
- Health and fitness: weight, body-fat percentage, workouts, and fitness activity are used for app functionality.
- Identifiers: the internal profile ID is used for app functionality, analytics, and diagnostics.
- Usage data: product interaction and app lifecycle events are used for analytics.
- Diagnostics: crash and performance information is used for app functionality and analytics.
- Progress photos, body measurements, and private notes are not used for advertising or tracking across other companies' apps and websites.

## 4. Required public pages

- [ ] `https://shipshape90.com/privacy` loads and accurately describes account, fitness, photo, notification, analytics, and crash data.
- [ ] `https://shipshape90.com/terms` loads and explains the honor system, prizes, forfeiture, challenge participation, and acceptable conduct.
- [ ] `https://shipshape90.com/support` loads with a working support contact and account-deletion instructions.
- [ ] The privacy policy URL is entered in App Store Connect.
- [ ] The support URL is entered in App Store Connect.

## 5. TestFlight acceptance run

- [ ] Fresh install: email code sign-in, profile creation, and permissions work.
- [ ] Returning install: the session restores without showing onboarding.
- [ ] Public challenge: save, queue, join, submit day, history edit, leave, and forfeiture behavior work.
- [ ] Private challenge: locked listing, invite code, request approval, and host controls work.
- [ ] Host lifecycle: creating a future challenge queues the host without breaking the one-active-challenge rule.
- [ ] Check-ins: start gate, weight/body fat, camera/library, crop/zoom, milestones, and final check-in work.
- [ ] Points: task count, missed-task deductions, perfect-day bonus, streak bonus, rankings, and final body bonuses agree across screens.
- [ ] Realtime: a second device sees points, activity, membership, and notifications immediately.
- [ ] Offline: the offline banner appears, duplicate writes do not occur, and queries refresh after reconnecting.
- [ ] Notifications: permission, device registration, unread badge, open-to-destination, swipe clear, and clear all work.
- [ ] Accessibility: VoiceOver can reach and describe tabs, challenge cards, task cards, forms, modals, photos, and primary buttons.
- [ ] Keyboard: text and number keyboards never cover the active field or primary action, and exactly one Done control is shown.
- [ ] Appearance: light and dark app icons, launch screen, small-device layouts, and Dynamic Type at larger sizes are checked.
- [ ] Account deletion removes the account and returns to sign-in.

## 6. App Review notes

Provide Apple with:

- A review account that does not expose a real user's fitness or photo data.
- Clear instructions for joining the review challenge and completing the required first check-in.
- An explanation that challenge tasks use the honor system and no proof is required.
- An explanation that optional prizes are defined by challenge hosts and ShipShape 90 does not currently process prize payments.
- A note that camera and photo-library access occur only after the reviewer explicitly chooses to add a profile or progress photo.

## 7. Release command sequence

1. Run type checking, linting, domain tests, and Supabase lifecycle tests.
2. Build the iOS preview candidate and complete the acceptance run above.
3. Fix only verified release blockers and produce a new preview build when native code changes.
4. Promote the verified update/build to production and submit it through App Store Connect.
5. Monitor crash-free sessions, sign-in success, check-in completion, submit-day success, and notification delivery after release.
