import type { LucideIcon } from 'lucide-react'
import {
  Anchor,
  Award,
  Camera,
  CloudOff,
  Crown,
  Flame,
  Flag,
  HelpCircle,
  Medal,
  PiggyBank,
  Plane,
  Sparkles,
  Star,
  Trophy,
} from 'lucide-react'

export type BadgeId =
  | 'day_one'
  | 'first_perfect_day'
  | 'first_photo'
  | 'milestone_checkin_1'
  | 'milestone_checkin_30'
  | 'milestone_checkin_60'
  | 'milestone_checkin_90'
  | 'challenge_complete'
  | 'streak_7'
  | 'streak_14'
  | 'streak_30'
  | 'hidden_imperfect_day'
  | 'hidden_travel_day'
  | 'hidden_prize_pot'
  | 'hidden_first_place'

export type BadgeDefinition = {
  id: BadgeId
  title: string
  description: string
  icon: LucideIcon
  /** If true, title/description stay secret until earned (profile shows ???). */
  hidden?: boolean
}

/** Display order on Profile (all defined badges shown; locked until earned). */
export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'day_one',
    title: 'Day One',
    description: 'Locked in your first day (End Day submitted).',
    icon: Anchor,
  },
  {
    id: 'first_perfect_day',
    title: 'Flawless',
    description: 'Your first perfect day — all tasks checked (non-travel).',
    icon: Sparkles,
  },
  {
    id: 'first_photo',
    title: 'Proof',
    description: 'Uploaded your first progress photo.',
    icon: Camera,
  },
  {
    id: 'milestone_checkin_1',
    title: 'First check-in',
    description: 'Day 1 — before photo and stats.',
    icon: Star,
  },
  {
    id: 'milestone_checkin_30',
    title: 'Second check-in',
    description: 'Day 30 milestone completed.',
    icon: Medal,
  },
  {
    id: 'milestone_checkin_60',
    title: 'Third check-in',
    description: 'Day 60 milestone completed.',
    icon: Trophy,
  },
  {
    id: 'milestone_checkin_90',
    title: 'Final check-in',
    description: 'Day 90 — after photo and stats.',
    icon: Award,
  },
  {
    id: 'challenge_complete',
    title: 'Harbor Home',
    description: 'Submitted the final day of the 90-day challenge.',
    icon: Flag,
  },
  {
    id: 'streak_7',
    title: 'Week of Steel',
    description: 'Hit a 7-day perfect streak (non-travel days).',
    icon: Flame,
  },
  {
    id: 'streak_14',
    title: 'Fortnight Force',
    description: 'Hit a 14-day perfect streak.',
    icon: Flame,
  },
  {
    id: 'streak_30',
    title: 'Unbroken Month',
    description: 'Hit a 30-day perfect streak.',
    icon: Flame,
  },
  {
    id: 'hidden_imperfect_day',
    title: 'Perfectly Human',
    description: 'Ended a day without a perfect score — and owned it anyway.',
    icon: CloudOff,
    hidden: true,
  },
  {
    id: 'hidden_travel_day',
    title: 'Sky Club',
    description: 'Completed a submitted Travel Day.',
    icon: Plane,
    hidden: true,
  },
  {
    id: 'hidden_prize_pot',
    title: 'Pot Stirrer',
    description: 'Added to the prize pot with a missed-task penalty.',
    icon: PiggyBank,
    hidden: true,
  },
  {
    id: 'hidden_first_place',
    title: 'Top of the Mast',
    description: 'Hit #1 on the leaderboard (earnable from Day 10 onward).',
    icon: Crown,
    hidden: true,
  },
]

export const BADGE_IDS = new Set<BadgeId>(BADGE_DEFINITIONS.map((b) => b.id))

export const PUBLIC_BADGE_DEFINITIONS = BADGE_DEFINITIONS.filter((b) => !b.hidden)
export const HIDDEN_BADGE_DEFINITIONS = BADGE_DEFINITIONS.filter((b) => b.hidden)
