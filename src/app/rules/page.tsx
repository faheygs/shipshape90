'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Dumbbell, Droplets, Footprints, BookOpen, Utensils, ShieldOff, Plane, Trophy, AlertTriangle, Baby, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MAX_TOTAL_POINTS,
  MAX_DAILY_POINTS_TOTAL,
  STREAK_BONUS_DAYS,
  STREAK_BONUS_POINTS,
  BASE_PRIZE_POOL_DOLLARS,
  BADGE_COLLECTOR_BONUS_POINTS,
} from '@/lib/constants'

interface RuleSection {
  title: string
  icon: React.ElementType
  content: React.ReactNode
}

function Collapsible({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <Icon className="w-5 h-5 text-brand-400 flex-shrink-0" />
        <span className="font-display font-semibold text-[15px] flex-1">{title}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-5 h-5 text-white/30" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 text-sm text-white/60 leading-relaxed space-y-2">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function RulesPage() {
  return (
    <div className="pb-4 space-y-4">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-display font-bold">The Rules</h1>
        <p className="text-white/40 text-sm mt-0.5">ShipShape90 — March 30 to June 27, 2026</p>
      </motion.div>

      {/* Overview Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass-card-bright p-5 text-center"
      >
        <p className="text-lg font-display font-bold text-gradient">90 Days. 4 Competitors. 1 Winner.</p>
        <p className="text-white/40 text-sm mt-2">
          You&apos;re not getting on that cruise soft. Four go in — one walks off the gangplank with everyone&apos;s money.
        </p>
      </motion.div>

      <div className="space-y-3">
        <Collapsible title="Daily Tasks (7 Total)" icon={Dumbbell}>
          <div className="space-y-3">
            <div className="flex items-start gap-2"><Dumbbell className="w-4 h-4 mt-0.5 text-brand-400 flex-shrink-0" /><div><strong className="text-white/80">Two Workouts</strong> — Two separate workouts per day. Strength, cardio, HIIT. Min 20 mins each. No doubling up on walks.</div></div>
            <div className="flex items-start gap-2"><Droplets className="w-4 h-4 mt-0.5 text-blue-400 flex-shrink-0" /><div><strong className="text-white/80">One Gallon of Water</strong> — 128 oz plain water daily. Not sparkling, not flavored. Coffee doesn&apos;t count.</div></div>
            <div className="flex items-start gap-2"><Footprints className="w-4 h-4 mt-0.5 text-green-400 flex-shrink-0" /><div><strong className="text-white/80">5,000 Steps</strong> — Tracked on phone or watch. Screenshot required nightly.</div></div>
            <div className="flex items-start gap-2"><ShieldOff className="w-4 h-4 mt-0.5 text-red-400 flex-shrink-0" /><div><strong className="text-white/80">Zero Added Sugar</strong> — Whole fruit is fine. Candy, soda, sauces, flavored yogurt — all out. Athletic exemption for 10+ mile runs.</div></div>
            <div className="flex items-start gap-2"><BookOpen className="w-4 h-4 mt-0.5 text-purple-400 flex-shrink-0" /><div><strong className="text-white/80">10 Pages / 15 Min Audio</strong> — Any book. Fiction, biography, thriller. Tell the group what you read.</div></div>
            <div className="flex items-start gap-2"><Utensils className="w-4 h-4 mt-0.5 text-yellow-400 flex-shrink-0" /><div><strong className="text-white/80">Follow Your Diet Plan</strong> — Your chosen template, locked in for 90 days. Post one meal photo per day.</div></div>
          </div>
        </Collapsible>

        <Collapsible title="Scoring System" icon={Trophy}>
          <p>
            You must <strong className="text-white/80">end your day</strong> (submit) for that day to count. Tasks checked but not submitted before your local midnight earn{' '}
            <strong className="text-red-400/90">nothing</strong> — no points, no streak, no perfect day.
          </p>
          <p>Each task completed earns <strong className="text-brand-400">+1 point</strong> (7 tasks = 7 points).</p>
          <p>Complete all 7 tasks for a <strong className="text-green-400">Perfect Day Bonus: +3 points</strong> (10 total).</p>
          <p>Miss any task: <strong className="text-red-400">-3 points</strong> per missed task AND <strong className="text-red-400">$1 into the prize pot</strong>.</p>
          <p>
            Daily scores alone cap at <strong className="text-white/80">{MAX_DAILY_POINTS_TOTAL} points</strong> (90 × 10).
            With streak bonuses — and <strong className="text-white/80">+{BADGE_COLLECTOR_BONUS_POINTS} extra</strong> if you earn{' '}
            <strong className="text-white/80">every badge</strong> by the end — total can reach{' '}
            <strong className="text-white/80">up to {MAX_TOTAL_POINTS}</strong>.
          </p>
        </Collapsible>

        <Collapsible title="Streak Bonuses" icon={Flame}>
          <p>Perfect days for streak math must be <strong className="text-white/80">submitted</strong> — same as points.</p>
          <p>
            On <strong className="text-white/80">non-travel</strong> days only: every <strong className="text-brand-400">{STREAK_BONUS_DAYS} consecutive calendar perfect days</strong> earns{' '}
            <strong className="text-yellow-400">+{STREAK_BONUS_POINTS} bonus points</strong> (e.g. 14 in a row → +10 from streaks; 13 → +5).
          </p>
          <p>If you miss a day, that run ends — start a new run and after another {STREAK_BONUS_DAYS} perfect days you earn another +{STREAK_BONUS_POINTS}.</p>
          <p>
            <strong className="text-white/80">Travel:</strong> a full submitted perfect day adds +1 to this streak. A submitted <em>perfect</em> travel day (all 5 travel tasks) <strong className="text-white/80">does not add</strong> — your streak <strong className="text-white/80">stays the same</strong> until your next full day. Miss any travel task or don&apos;t submit → <strong className="text-red-400/90">streak breaks</strong>.
          </p>
          <p>Streak bonus points (+7-day blocks) still only use <strong className="text-white/80">non-travel</strong> perfect days.</p>
          <p>Streaks are addictive. Chase them. They win leaderboards.</p>
        </Collapsible>

        <Collapsible title="Travel Mode (13 Days)" icon={Plane}>
          <p>13 travel days for the full challenge. Must be declared BEFORE the trip.</p>
          <p className="mt-2"><strong className="text-white/80">On travel days:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>One workout instead of two (min 20 min)</li>
            <li>Gallon of water — still required</li>
            <li>Zero sugar — still on</li>
            <li>Diet plan — best effort, no junk food</li>
            <li>Reading — still required</li>
            <li>Steps — waived</li>
          </ul>
          <p className="mt-2">No Perfect Day bonus on travel days. Undeclared travel days are scored as regular days.</p>
          <p className="mt-2 text-white/50 text-[13px]">
            Streak: complete all travel tasks + submit to avoid breaking; it won&apos;t add to the streak counter until your next full perfect day.
          </p>
        </Collapsible>

        <Collapsible title="Consequences & Stakes" icon={AlertTriangle}>
          <p><strong className="text-white/80">Miss any task:</strong> $1 per missed task into the prize pot. -3 points per miss.</p>
          <p><strong className="text-white/80">3 failed days in a row:</strong> The other three write a public roast about you.</p>
          <p><strong className="text-white/80">Last place at Day 30:</strong> Cold plunge or physical challenge decided by group vote.</p>
          <p><strong className="text-white/80">Last place at Day 60:</strong> Another cold plunge or challenge. Different from Day 30.</p>
          <p><strong className="text-white/80">Last place at Day 90:</strong> The Loser Shirt. Winner picks it. Worn for the entire first day at sea on the cruise.</p>
        </Collapsible>

        <Collapsible title="Prize Pot" icon={Trophy}>
          <p>Winner takes ALL on Day 90:</p>
          <p className="text-lg font-display font-bold text-gradient mt-1">${BASE_PRIZE_POOL_DOLLARS} guaranteed + all penalty dollars</p>
          <p className="mt-2">$50 Venmo from each of the other 3 competitors ($150 min) plus every $1 penalty that accumulated. Stay perfect and get paid.</p>
        </Collapsible>

        <Collapsible title="Pregnancy Bailout" icon={Baby}>
          <p>If someone becomes pregnant during the challenge, they may bail out at no cost.</p>
          <p className="mt-1"><strong className="text-yellow-400">However:</strong> They forfeit all ability to gain any future reward, including winning the prize pot. This is an exit — not a pause.</p>
        </Collapsible>
      </div>
    </div>
  )
}
