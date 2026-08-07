# ShipShape 90 Product Specification

Status: v1 scope locked for implementation

## Product thesis

ShipShape 90 is a gamified challenge platform that turns commitments into a daily scoreboard. People can join public or private challenges, create their own challenge rules, check off scheduled tasks, provide proof when required, compete on leaderboards, and finish under creator-defined winning conditions.

The original Ship Shape 90 fitness challenge is the flagship template, not a hard-coded limitation. Challenges can use different durations, tasks, targets, and themes, while the ShipShape Points system remains universal and non-editable.

## Primary users

- Participants who want structure, accountability, and visible progress.
- Challenge creators who define dates, tasks, stakes, and optional body-progress bonus scoring.
- Challenge moderators who review evidence, disputes, and member behavior.

## Core product loop

1. Discover or receive an invitation to a challenge.
2. Review its commitments, scoring, proof requirements, stakes, and privacy.
3. Join and make a single active challenge commitment.
4. Open Today and complete scheduled tasks.
5. Add measurements, notes, or evidence when required.
6. Receive points, bonuses, streak updates, and penalties from deterministic rules.
7. Compare progress on the leaderboard and activity feed.
8. Complete checkpoints and determine winners at challenge end.

## V1 capabilities

### Identity and account

- Native Sign in with Apple on iPhone, with passwordless email one-time-code fallback.
- Name, username, avatar, automatically detected time zone, notification preferences, and privacy controls.
- Account export and deletion.

### Challenge discovery and membership

- Public, unlisted, and private challenges.
- Search and browse public challenges.
- Invite link or invite code for private challenges.
- Join requests and optional creator approval.
- Owner, moderator, and participant roles.
- Participant caps and registration windows.
- One pending or active challenge membership per profile.
- Permanent same-challenge rejoin prevention after voluntary withdrawal.
- Immediate prize forfeiture when a member withdraws.

### Challenge builder

- Name, description, cover, category, visibility, and community guidelines.
- Start/end date, registration window, time zone, and participant limit.
- Tasks with title, instructions, schedule, target, units, and proof policy. Every task uses the fixed ShipShape point value.
- Daily, selected-weekday, weekly-count, checkpoint, and one-time schedules.
- Boolean, count, quantity, duration, and evidence task types.
- Automatic ShipShape Points: +1 completed task and −3 missed task. Perfect-day and seven-day-streak bonuses scale from the original 3/7 and 5/7 ratios based on the challenge's daily task count.
- Checkpoints for photos, measurements, weigh-ins, or custom submissions.
- Winner rules and deterministic tie-breakers.
- Draft preview before publishing.

### Daily participation

- Today view showing only tasks scheduled for the participant's local day.
- One-tap completion for simple tasks.
- Quantity and duration entry where relevant.
- Photo, screenshot, or text evidence upload.
- Visible current points, projected submit-day points, progress, streak, penalties, and remaining tasks.
- Completion undo within the challenge's configured edit window.
- Clear indication of pending moderator review.
- Calendar history covering every eligible challenge day through today.
- Past-day backfill and correction for completed or missed tasks, with authoritative task-point replacement and automatic forward recalculation of perfect-day and seven-day-streak bonuses.

### Competition and accountability

- Live leaderboard with total points, completion percentage, perfect days, and rank movement.
- Participant profile within a challenge.
- Challenge activity feed for completions, milestones, comments, and reactions.
- Weekly recap and checkpoint summaries.
- Creator announcements and participant reporting/blocking.

### Completion

- Frozen final standings after the configured review window.
- Winner calculation with documented tie-breakers.
- Completion card and shareable result image.
- Challenge archive that retains permitted history.

## Flagship template: Ship Shape 90

The attached reference becomes a prebuilt template with:

- Ninety-day default duration.
- Two workouts, water, steps, no-added-sugar, reading, and diet-plan tasks.
- Ten-point perfect day for the seven-task flagship: seven task points plus a three-point bonus.
- Seven-task flagship streak bonus of five points; other task counts scale proportionally.
- Progress-photo checkpoints.
- Three-point penalty for every missed task; missing all seven tasks produces a −21-point day.
- Weekly leaderboard recap.
- Highest final score as the default winning condition.

Dates, participant count, task targets, financial amounts, challenge copy, and consequences remain editable rather than being fixed to the original four-person cruise challenge.

## Winner condition

The participant with the highest ShipShape Points total wins. Creators cannot replace or edit the core scoring system. They may optionally add weight or body-fat change—calculated as percentage change or total change—as bonus points. Completion percentage and perfect days provide deterministic tie-breakers.

## Safety and platform rules

- The app does not hold prize money or act as escrow in v1.
- Monetary stakes are an informational pledge and settlement ledger only.
- All participants must see and consent to rules and stakes before joining.
- Physical punishments, humiliation, dangerous restrictions, harassment, and illegal stakes are prohibited.
- Health and nutrition challenges include appropriate disclaimers and creator guidance.
- Participants can report a challenge, withdraw at any time with permanent prize forfeiture and same-challenge rejoin prevention, and request data removal.
- Progress photos default to private; sharing requires an explicit per-challenge choice.

## Deliberately deferred

- App-held prize pools or automated cash payouts.
- Apple Health, Health Connect, and wearable integrations.
- AI-generated diet or medical advice.
- Live video coaching.
- Marketplace payouts to professional challenge creators.
- Complex tournament brackets.

## Success metrics

- Challenge join-to-start conversion.
- Participants completing their first scheduled day.
- Day 7, Day 30, and challenge-end retention.
- Daily scheduled-task completion rate.
- Challenges created and successfully started.
- Invite acceptance rate.
- Percentage of challenges reaching a deterministic final result.
