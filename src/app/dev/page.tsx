'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Camera,
  CheckCircle2,
  HelpCircle,
  Plane,
  Presentation,
  Scale,
  Sparkles,
  Star,
  X,
  Percent,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import confetti from 'canvas-confetti'
import { cn } from '@/lib/utils'
import { TASKS, TRAVEL_TASKS, CHECKIN_DAYS, MAX_TRAVEL_DAYS } from '@/lib/constants'
import { DemoTaskChecklist } from '@/components/demo-task-checklist'
import { TrendChart } from '@/components/trend-chart'

const MILESTONE_SAMPLE = CHECKIN_DAYS.find(d => d.day === 30)!

/** Sample weight entries — dips and bumps like a real cut */
const DEMO_WEIGHT_TREND = [
  { date: '2026-04-02', value: 192.4 },
  { date: '2026-04-06', value: 191.0 },
  { date: '2026-04-10', value: 191.8 },
  { date: '2026-04-14', value: 189.2 },
  { date: '2026-04-18', value: 190.0 },
  { date: '2026-04-22', value: 187.5 },
  { date: '2026-04-26', value: 186.0 },
]

/** Body fat % — not a straight line */
const DEMO_BF_TREND = [
  { date: '2026-04-02', value: 21.8 },
  { date: '2026-04-06', value: 21.2 },
  { date: '2026-04-10', value: 21.5 },
  { date: '2026-04-14', value: 20.6 },
  { date: '2026-04-18', value: 20.9 },
  { date: '2026-04-22', value: 20.1 },
  { date: '2026-04-26', value: 19.4 },
]

export default function DemoPage() {
  const [showCheckinModal, setShowCheckinModal] = useState(false)
  const [checkinStep, setCheckinStep] = useState<'form' | 'done'>('form')
  const [travelOn, setTravelOn] = useState(false)
  const [demoDayEnded, setDemoDayEnded] = useState(false)
  const [demoTasksKey, setDemoTasksKey] = useState(0)
  const [trendTab, setTrendTab] = useState<'weight' | 'bf'>('weight')

  const travelTasks = TASKS.filter(t => (TRAVEL_TASKS as readonly string[]).includes(t.id))
  const regularTasks = [...TASKS]

  function fireEndDayConfetti() {
    confetti({
      particleCount: 70,
      spread: 65,
      origin: { y: 0.65 },
      zIndex: 9999,
      colors: ['#f97316', '#22c55e', '#fbbf24'],
    })
  }

  return (
    <div className="min-h-[calc(100dvh-0px)] pb-10 px-4 max-w-lg mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="pt-4 pb-6"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Presentation className="w-6 h-6 text-cyan-400 shrink-0" />
          <h1 className="text-xl font-display font-bold">Demo</h1>
        </div>
        <p className="text-sm text-white/50 mt-2 leading-relaxed">
          Walkthrough only — <span className="text-amber-200/90 font-medium">nothing saves</span>.
        </p>
      </motion.div>

      <section className="mb-10">
        <h2 className="text-base font-display font-semibold mb-3">1 · Milestone check-in</h2>
        <div className="glass-card p-4 space-y-3">
          <p className="text-sm text-white/65 leading-relaxed">
            On days 1, 30, 60, and 90, ending your day asks for weight, body fat %, and a progress photo.
          </p>
          <button
            type="button"
            onClick={() => {
              setCheckinStep('form')
              setShowCheckinModal(true)
            }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-display font-bold text-sm
              bg-gradient-to-r from-yellow-500 to-brand-500 text-white shadow-lg shadow-brand-500/25
              active:scale-[0.98] transition-all"
          >
            <Star className="w-5 h-5" fill="currentColor" />
            Open sample form
          </button>
          <p className="text-[11px] text-white/35 flex items-start gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Sample modal only.
          </p>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-base font-display font-semibold mb-3">2 · Tasks &amp; End Day</h2>
        <div className="glass-card p-4 space-y-4">
          <p className="text-sm text-white/65 leading-relaxed">
            Checking boxes <strong className="text-white/85">records progress for the moment</strong> — but your day
            doesn&apos;t count for points until you tap <strong className="text-white/85">End Day</strong> on Home. That
            locks the day (same as submitting).
          </p>

          <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs text-white/45 block">Today&apos;s points (demo)</span>
              <span className="text-lg font-display font-bold text-brand-400">+4</span>
              <span className="text-[10px] text-white/30 block mt-0.5">Not final until you end the day</span>
            </div>
          </div>

          <div>
            <p className="text-xs text-white/40 mb-2 font-medium">Check tasks, then end the day below</p>
            <DemoTaskChecklist
              key={demoTasksKey}
              tasks={regularTasks}
              isTravelDay={false}
              locked={demoDayEnded}
            />
          </div>

          {!demoDayEnded ? (
            <button
              type="button"
              onClick={() => {
                setDemoDayEnded(true)
                fireEndDayConfetti()
              }}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-display font-bold text-base
                bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/20
                active:scale-[0.98] transition-all"
            >
              <CheckCircle2 className="w-5 h-5" />
              End Day 12 (demo)
            </button>
          ) : (
            <div className="rounded-xl bg-green-500/10 border border-green-500/25 px-4 py-3 text-center">
              <p className="text-sm font-display font-semibold text-green-400">Day 12 complete</p>
              <p className="text-[11px] text-white/45 mt-1">On the real Home screen, this is when today locks in.</p>
            </div>
          )}

          {demoDayEnded && (
            <button
              type="button"
              onClick={() => {
                setDemoDayEnded(false)
                setDemoTasksKey(k => k + 1)
              }}
              className="w-full py-2.5 text-xs text-white/40 hover:text-white/60 transition-colors"
            >
              Reset this section
            </button>
          )}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-base font-display font-semibold mb-3">3 · Trends (Body Log)</h2>
        <div className="glass-card p-4 space-y-4">
          <p className="text-sm text-white/65 leading-relaxed">
            On <strong className="text-white/85">Body Log</strong>, charts plot weight and body fat over time. Lines go
            up and down — that&apos;s normal (water, stress, a big meal). You&apos;re looking at the trend, not one point.
          </p>

          <div className="flex rounded-lg bg-white/5 p-0.5 border border-white/10">
            <button
              type="button"
              onClick={() => setTrendTab('weight')}
              className={cn(
                'flex-1 py-2 text-xs font-display font-semibold rounded-md transition-colors',
                trendTab === 'weight' ? 'bg-brand-500/25 text-brand-200' : 'text-white/45',
              )}
            >
              Weight
            </button>
            <button
              type="button"
              onClick={() => setTrendTab('bf')}
              className={cn(
                'flex-1 py-2 text-xs font-display font-semibold rounded-md transition-colors',
                trendTab === 'bf' ? 'bg-green-500/20 text-green-300' : 'text-white/45',
              )}
            >
              Body fat %
            </button>
          </div>

          {trendTab === 'weight' ? (
            <TrendChart data={DEMO_WEIGHT_TREND} unit="lbs" color="#f97316" decimals={1} />
          ) : (
            <TrendChart data={DEMO_BF_TREND} unit="%" color="#4ade80" decimals={1} />
          )}

          <div className="flex flex-col gap-2 text-[11px] text-white/45">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-3.5 h-3.5 text-green-400 shrink-0" />
              <span>Overall weight trending down in this sample — with a small bump mid-month.</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400/90 shrink-0" />
              <span>Body fat % can tick up briefly; switch tabs to compare.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-base font-display font-semibold mb-3">4 · Travel mode</h2>
        <div className="glass-card p-4 space-y-4">
          <p className="text-sm text-white/65 leading-relaxed">
            Travel days use five tasks instead of seven and a different points range. You get {MAX_TRAVEL_DAYS} for the
            whole challenge.
          </p>
          <button
            type="button"
            onClick={() => setTravelOn(!travelOn)}
            className={cn(
              'w-full flex items-center justify-between p-4 rounded-xl transition-all',
              travelOn ? 'bg-blue-500/15 border border-blue-500/30' : 'bg-white/5 border border-white/5',
            )}
          >
            <div className="flex items-center gap-3 text-left">
              <Plane className={cn('w-5 h-5', travelOn ? 'text-blue-400' : 'text-white/30')} />
              <div>
                <span className={cn('text-sm font-medium block', travelOn ? 'text-blue-300' : 'text-white/60')}>
                  Travel Day
                </span>
                <span className="text-[11px] text-white/30">Toggle to compare task lists</span>
              </div>
            </div>
            <div
              className={cn(
                'w-12 h-7 rounded-full transition-all flex items-center px-1 shrink-0',
                travelOn ? 'bg-blue-500' : 'bg-white/10',
              )}
            >
              <motion.div
                className="w-5 h-5 rounded-full bg-white shadow-lg"
                animate={{ x: travelOn ? 20 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </div>
          </button>
          <div>
            <p className="text-xs text-white/40 mb-2">{travelOn ? '5 travel tasks' : '7 full-day tasks'}</p>
            <DemoTaskChecklist tasks={travelOn ? travelTasks : regularTasks} isTravelDay={travelOn} />
          </div>
          <p className="text-[12px] text-white/40 flex items-start gap-1.5">
            <Sparkles className="w-4 h-4 text-blue-400/80 shrink-0 mt-0.5" />
            No perfect-day +3 on travel; scoring is in Rules.
          </p>
        </div>
      </section>

      <AnimatePresence>
        {showCheckinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => {
              setShowCheckinModal(false)
              setCheckinStep('form')
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="relative w-full max-w-sm bg-navy-900 rounded-2xl p-4 pt-5 space-y-3 max-h-[min(85dvh,32rem)] overflow-y-auto border border-yellow-500/25 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  setShowCheckinModal(false)
                  setCheckinStep('form')
                }}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 text-white/60 hover:text-white hover:bg-white/15 transition-colors z-10"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              {checkinStep === 'form' ? (
                <>
                  <div className="text-center pr-8">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Star className="w-5 h-5 text-yellow-400" fill="currentColor" />
                      <h2 className="text-lg font-display font-bold leading-tight">{MILESTONE_SAMPLE.label}</h2>
                    </div>
                    <p className="text-xs text-white/50">{MILESTONE_SAMPLE.tagline}</p>
                    <p className="text-[11px] text-yellow-400/80 mt-2">Sample only.</p>
                  </div>
                  <div className="rounded-xl border border-dashed border-white/15 bg-white/5 py-8 flex flex-col items-center gap-2">
                    <Camera className="w-8 h-8 text-white/25" />
                    <span className="text-xs text-white/35">Photo</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-white/40 block mb-1 flex items-center gap-1">
                        <Scale className="w-3 h-3" /> Weight
                      </label>
                      <div className="px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 text-white/40 text-sm">
                        182.0
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-white/40 block mb-1 flex items-center gap-1">
                        <Percent className="w-3 h-3" /> Body fat %
                      </label>
                      <div className="px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 text-white/40 text-sm">
                        19.0
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCheckinStep('done')}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                      bg-gradient-to-r from-yellow-500 to-brand-500 text-white font-display font-bold text-sm
                      shadow-lg shadow-brand-500/30 active:scale-[0.98] transition-all"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Simulate submit
                  </button>
                </>
              ) : (
                <div className="text-center py-6 space-y-3">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20">
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                  </div>
                  <p className="font-display font-bold text-white/95">Saved (demo)</p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCheckinModal(false)
                      setCheckinStep('form')
                    }}
                    className="mt-2 px-5 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/15"
                  >
                    Close
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
