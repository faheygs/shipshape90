import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  MAX_POINTS_PER_DAY,
  MAX_TRAVEL_DAY_POINTS,
  MIN_REGULAR_DAY_POINTS,
  MIN_TRAVEL_DAY_POINTS,
  MISS_PENALTY_POINTS,
  PERFECT_DAY_BONUS,
} from '@/lib/constants'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns the current local date as YYYY-MM-DD without timezone shifting.
 * Using this instead of date-fns format() which can shift to the next day
 * when local time is ahead of UTC.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Milliseconds until the next **local** midnight (each user's browser uses their own timezone).
 * Use with `setTimeout` to roll "today" at 12:00 AM in their location (e.g. Utah vs California).
 */
export function getMsUntilNextLocalMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  return Math.max(0, next.getTime() - now.getTime())
}

/** Body log / storage may store Supabase public URLs in `notes` or `photo_url` */
export function isPhotoUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false
  const s = value.trim()
  if (/^https?:\/\//i.test(s)) return true
  if (s.includes('supabase.co') && s.includes('storage')) return true
  if (s.includes('/object/public/')) return true
  return false
}

export function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function getTasksCompleted(log: Record<string, boolean>, isTravelDay: boolean): number {
  const tasks = isTravelDay
    ? ['workout1', 'water', 'no_sugar', 'reading', 'diet']
    : ['workout1', 'workout2', 'water', 'steps', 'no_sugar', 'reading', 'diet']
  return tasks.filter(t => log[t]).length
}

/**
 * Points for one calendar day — same formula as each row in `get_my_points()` daily sum (Supabase).
 * Only days with `submitted = true` are included in totals; unchecked tasks here are “in progress.”
 * Regular: +1 per task, +3 if all 7 done, −3 per missed task → range −21…+10.
 * Travel: +1 per task, no perfect bonus, −3 per miss → range −15…+5.
 * Challenge total from RPC also adds streak bonus (+5 per each 7 consecutive perfect submitted days).
 */
export function calculateDayPoints(log: Record<string, boolean>, isTravelDay: boolean): number {
  const tasks = isTravelDay
    ? ['workout1', 'water', 'no_sugar', 'reading', 'diet']
    : ['workout1', 'workout2', 'water', 'steps', 'no_sugar', 'reading', 'diet']

  const completed = tasks.filter(t => log[t]).length
  const missed = tasks.length - completed
  const totalTasks = isTravelDay ? 5 : 7
  const isPerfect = completed === totalTasks && !isTravelDay

  let points = completed
  if (isPerfect) points += PERFECT_DAY_BONUS
  points += missed * MISS_PENALTY_POINTS

  return points
}

export function getDayPointsRange(isTravelDay: boolean): { min: number; max: number } {
  return isTravelDay
    ? { min: MIN_TRAVEL_DAY_POINTS, max: MAX_TRAVEL_DAY_POINTS }
    : { min: MIN_REGULAR_DAY_POINTS, max: MAX_POINTS_PER_DAY }
}
