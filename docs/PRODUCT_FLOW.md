# ShipShape 90 Product Flow

Status: approved product direction

## Product structure

ShipShape 90 remains a complete app before, during, and after a challenge. Joining a challenge adds an active-challenge destination; it does not replace the rest of the app.

Primary navigation:

1. Home
2. Challenges
3. Create
4. Community
5. Profile

Home and Challenges both surface the member's active challenge. Opening it lands on today's missions, with leaderboard, activity, participants, and rules inside the challenge hub.

## Onboarding

1. Continue with Apple on iPhone, or enter an email address for a one-time code.
2. Enter a six-digit one-time code.
3. Add name, username, and profile photo.
4. Continue into challenge discovery or accept the invite that opened the app.

Time zone and device settings are detected automatically. The app does not ask for fitness goals, demographics, travel status, pregnancy status, or a general health questionnaire during onboarding.

## Membership commitment

- A profile can have only one pending or active challenge membership at a time.
- Members may browse challenges, create drafts, and use Community while competing.
- Members cannot join another challenge until the current membership is completed or withdrawn.
- A member may voluntarily withdraw at any time.
- Withdrawal immediately and permanently forfeits prize eligibility for that challenge.
- A withdrawn member can never rejoin the same challenge.
- Withdrawal history remains visible as `Withdrawn`.
- After withdrawal, the member may join a different challenge.
- Completion also opens the member's slot for another challenge.

These rules are enforced in the database, not only in the interface.

## Daily participation

The active challenge opens to Today:

- Current challenge day and remaining time
- Scheduled tasks
- One-tap completion where applicable
- Numeric, duration, or evidence entry where required
- Current points, projected submit-day points, and daily progress
- Current streak and rank
- Realtime leaderboard and activity updates

The server owns deadlines, completion validity, scoring, and final standings. The mobile interface may update optimistically but reconciles against server state.

## Challenge creation

1. Basics: name, cover, description, and category
2. Access: public, private, or approval required
3. Schedule: dates, time zone, deadline, and registration window
4. Tasks: select from the library or add custom tasks
5. Competition: review the fixed ShipShape Points rules, evidence policy, and optional body-progress bonus
6. Review: participant-facing rules and prize eligibility
7. Publish and share by link, code, or QR

Challenges are data-driven for dates, tasks, targets, access, and stakes. Scoring is always +1 per completed task and −3 per missed task. Perfect-day and seven-day-streak bonuses scale proportionally with the number of daily missions; seven tasks remains +3 and +5.

## Task library

The catalog includes curated and creator-owned tasks across fitness, nutrition, hydration, recovery, mindset, habits, outdoor, and team categories. A task can define its type, target, unit, schedule, proof policy, instructions, and safety note. Every selected daily task is worth one ShipShape point when completed and costs three when missed.

There are no special-purpose pregnancy, travel-day, or injury bailout fields. A creator expresses permitted schedules and rules directly in the published challenge definition.

## Community

V1 community is participation-focused:

- Challenge activity
- Public completion celebrations
- Comments and cheers
- Creator announcements
- Profiles and following
- Challenge invitations
- Reporting, blocking, and moderation

Direct messaging is deferred until the core challenge loop and moderation operations are mature.
