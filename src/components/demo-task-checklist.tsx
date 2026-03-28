'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Dumbbell, Droplets, Footprints, BookOpen, Utensils, ShieldOff, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import confetti from 'canvas-confetti'

const TASK_ICONS: Record<string, React.ElementType> = {
  workout1: Dumbbell,
  workout2: Dumbbell,
  water: Droplets,
  steps: Footprints,
  no_sugar: ShieldOff,
  reading: BookOpen,
  diet: Utensils,
}

export type DemoTask = { id: string; label: string; description: string; points: number }

function firePerfectDayConfetti() {
  const count = 200
  const defaults = { origin: { y: 0.7 }, zIndex: 9999 }
  confetti({ ...defaults, spread: 26, startVelocity: 55, particleCount: count * 0.25 })
  confetti({ ...defaults, spread: 60, particleCount: count * 0.2 })
  confetti({ ...defaults, spread: 100, decay: 0.91, scalar: 0.8, particleCount: count * 0.35 })
  confetti({ ...defaults, spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2, particleCount: count * 0.1 })
}

interface DemoTaskChecklistProps {
  tasks: DemoTask[]
  isTravelDay: boolean
  initialValues?: Record<string, boolean>
  /** After "End Day" — tasks frozen like the real app */
  locked?: boolean
}

/** Local-only checklist for `/dev` demo — no network, no Supabase. */
export function DemoTaskChecklist({
  tasks,
  isTravelDay,
  initialValues = {},
  locked = false,
}: DemoTaskChecklistProps) {
  const [values, setValues] = useState<Record<string, boolean>>(() => {
    const v: Record<string, boolean> = {}
    tasks.forEach(t => {
      v[t.id] = initialValues[t.id] ?? false
    })
    return v
  })

  const toggleTask = useCallback(
    (taskId: string) => {
      if (locked) return
      const newValue = !values[taskId]
      const newValues = { ...values, [taskId]: newValue }
      setValues(newValues)
      const allDone = tasks.every(t => newValues[t.id])
      if (allDone && !isTravelDay) {
        setTimeout(firePerfectDayConfetti, 300)
      }
    },
    [values, tasks, isTravelDay, locked],
  )

  const completedCount = tasks.filter(t => values[t.id]).length
  const totalTasks = tasks.length
  const isPerfect = completedCount === totalTasks && !isTravelDay

  return (
    <div className={cn('space-y-2', locked && 'opacity-95')}>
      {locked && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/25 text-green-300 text-xs font-medium">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          Day locked in — tasks can&apos;t be changed until tomorrow.
        </div>
      )}
      {tasks.map((task, i) => {
        const Icon = TASK_ICONS[task.id] || Check
        const checked = values[task.id]

        return (
          <motion.button
            key={task.id}
            type="button"
            disabled={locked}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => toggleTask(task.id)}
            className={cn(
              'w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200 text-left',
              locked ? 'cursor-default opacity-90 pointer-events-none' : 'active:scale-[0.98]',
              checked
                ? 'bg-brand-500/15 border border-brand-500/30'
                : 'bg-white/5 border border-white/5 hover:border-white/15',
            )}
          >
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
                checked ? 'bg-brand-500 shadow-lg shadow-brand-500/30' : 'bg-white/5',
              )}
            >
              <AnimatePresence mode="wait">
                {checked ? (
                  <motion.div
                    key="check"
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <Check className="w-5 h-5 text-white" strokeWidth={3} />
                  </motion.div>
                ) : (
                  <motion.div key="icon" initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
                    <Icon className="w-5 h-5 text-white/30" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex-1 text-left min-w-0">
              <span
                className={cn(
                  'font-medium text-[15px] block transition-colors truncate',
                  checked ? 'text-white' : 'text-white/70',
                )}
              >
                {task.label}
              </span>
              <span className="text-[12px] text-white/30">{task.description}</span>
            </div>

            <span
              className={cn(
                'text-xs font-display font-semibold px-2 py-1 rounded-lg shrink-0',
                checked ? 'text-brand-400 bg-brand-500/10' : 'text-white/20 bg-white/5',
              )}
            >
              +{task.points}
            </span>
          </motion.button>
        )
      })}

      <AnimatePresence>
        {isPerfect && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="mt-4 p-4 rounded-xl bg-gradient-to-r from-brand-600/20 to-yellow-500/20 border border-brand-500/30 text-center"
          >
            <p className="text-lg font-display font-bold text-gradient">PERFECT DAY +3</p>
            <p className="text-white/50 text-sm mt-0.5">All 7 tasks done — bonus matches the real app.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
