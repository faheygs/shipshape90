/** Local calendar dates — avoid `new Date('YYYY-MM-DD')` (UTC) which shifts the day in US timezones. */
export const CHALLENGE_START = new Date(2026, 2, 30)
export const CHALLENGE_END = new Date(2026, 5, 27)
export const TOTAL_DAYS = 90
export const MAX_TRAVEL_DAYS = 13
export const MAX_POINTS_PER_DAY = 10
export const STREAK_BONUS_DAYS = 7
export const STREAK_BONUS_POINTS = 5
/** Sum of daily scores if every day were +10 (no streak bonuses). */
export const MAX_DAILY_POINTS_TOTAL = TOTAL_DAYS * MAX_POINTS_PER_DAY
/** Theoretical max streak bonus: one unbroken perfect run for the whole challenge. */
export const MAX_STREAK_BONUS_POINTS = Math.floor(TOTAL_DAYS / STREAK_BONUS_DAYS) * STREAK_BONUS_POINTS
/** Awarded in DB when user earns every badge (see `badge_collector_bonus_points`). */
export const BADGE_COLLECTOR_BONUS_POINTS = 10
/** Upper bound for total challenge points (daily + streak bonuses + full-badge bonus). */
export const MAX_TOTAL_POINTS =
  MAX_DAILY_POINTS_TOTAL + MAX_STREAK_BONUS_POINTS + BADGE_COLLECTOR_BONUS_POINTS
export const PERFECT_DAY_BONUS = 3
/** Per missed task (same magnitude as rules / Supabase `get_my_points`) */
export const MISS_PENALTY_POINTS = -3

/** Regular day: 7 misses × −3 = −21 (no tasks checked). */
export const MIN_REGULAR_DAY_POINTS = 7 * MISS_PENALTY_POINTS
/** Travel day: 5 misses × −3 = −15 */
export const MIN_TRAVEL_DAY_POINTS = 5 * MISS_PENALTY_POINTS
/** Travel day: 5 tasks done, no perfect bonus */
export const MAX_TRAVEL_DAY_POINTS = 5
export const MISS_PENALTY_DOLLARS = 1
/** Base pool from $50 × 3 other competitors; penalties add on top. */
export const BASE_PRIZE_POOL_DOLLARS = 150
/**
 * How often to refetch leaderboard RPC (others’ `daily_logs` aren’t visible via Realtime due to RLS).
 * Lower = snappier; slightly more API calls. 4 competitors ≈ low cost.
 */
export const LEADERBOARD_POLL_INTERVAL_MS = 2000

export const TASKS = [
  { id: 'workout1', label: 'Workout #1', description: 'Minimum 20 minutes', icon: 'Dumbbell', points: 1 },
  { id: 'workout2', label: 'Workout #2', description: 'Minimum 20 minutes', icon: 'Dumbbell', points: 1 },
  { id: 'water', label: 'Gallon of Water', description: '128 oz plain water', icon: 'Droplets', points: 1 },
  { id: 'steps', label: '5,000 Steps', description: 'Screenshot required', icon: 'Footprints', points: 1 },
  { id: 'no_sugar', label: 'Zero Added Sugar', description: 'Whole fruit OK', icon: 'CandyOff', points: 1 },
  { id: 'reading', label: '10 Pages / 15 Min', description: 'Any book or audiobook', icon: 'BookOpen', points: 1 },
  { id: 'diet', label: 'Diet Plan Followed', description: 'Post a meal photo', icon: 'Utensils', points: 1 },
] as const

export const TRAVEL_TASKS = ['workout1', 'water', 'no_sugar', 'reading', 'diet'] as const

export const CHECKIN_DAYS = [
  { day: 1, date: '2026-03-30', label: 'Day 1 — Before', tagline: 'The "before." Own it.' },
  { day: 30, date: '2026-04-28', label: 'Day 30 — First Check-in', tagline: 'The doubt starts dying here.' },
  { day: 60, date: '2026-05-28', label: 'Day 60 — Halfway', tagline: 'You should feel completely different.' },
  { day: 90, date: '2026-06-27', label: 'Day 90 — After', tagline: 'Same pose as Day 1. Side by side.' },
] as const

/** Dev/testing: when set in localStorage, `getChallengeDay()` for calendar-today returns this instead. */
export const SIM_CHALLENGE_DAY_STORAGE_KEY = 'shipshape90_sim_challenge_day'

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Challenge day index (1–90) for a calendar date string `YYYY-MM-DD` (photo / log dates). Not affected by sim. */
export function getChallengeDayNumberForDateString(dateStr: string): number {
  const start = new Date(CHALLENGE_START)
  start.setHours(0, 0, 0, 0)
  const d = new Date(`${dateStr}T12:00:00`)
  d.setHours(0, 0, 0, 0)
  const diff = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, Math.min(diff + 1, TOTAL_DAYS))
}

export function formatDayLabel(dayNum: number): string {
  return `Day ${dayNum}`
}

/** Calendar `YYYY-MM-DD` for challenge day 1…TOTAL_DAYS (matches CHECKIN_DAYS). */
export function getDateStringForChallengeDay(dayNum: number): string {
  const n = Math.max(1, Math.min(dayNum, TOTAL_DAYS))
  const d = new Date(CHALLENGE_START)
  d.setDate(d.getDate() + n - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Calendar challenge day (ignores dev sim). Use for SSR / first paint to match hydration. */
export function getChallengeDayCalendarOnly(date: Date = new Date()): number {
  const start = new Date(CHALLENGE_START)
  start.setHours(0, 0, 0, 0)
  const current = new Date(date)
  current.setHours(0, 0, 0, 0)
  const diff = Math.floor((current.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, Math.min(diff + 1, TOTAL_DAYS))
}

export function getChallengeDay(date: Date = new Date()): number {
  if (typeof window !== 'undefined') {
    const raw = window.localStorage.getItem(SIM_CHALLENGE_DAY_STORAGE_KEY)
    if (raw !== null && raw !== '' && sameCalendarDay(date, new Date())) {
      const n = parseInt(raw, 10)
      if (!Number.isNaN(n)) return Math.max(0, Math.min(n, TOTAL_DAYS))
    }
  }
  return getChallengeDayCalendarOnly(date)
}

/** Badges (and client-side sync) only apply once the challenge has begun (Day 1+). Honors dev sim. */
export function isChallengeActiveForBadges(date: Date = new Date()): boolean {
  return getChallengeDay(date) >= 1
}
