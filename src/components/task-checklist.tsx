'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Dumbbell, Droplets, Footprints, BookOpen, Utensils, ShieldOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
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

interface Task {
  id: string
  label: string
  description: string
  points: number
}

interface TaskChecklistProps {
  tasks: Task[]
  logId: string | null
  logDate: string
  userId: string
  initialValues: Record<string, boolean>
  isTravelDay: boolean
  disabled?: boolean
  onUpdate?: (values: Record<string, boolean>) => void
}

function firePerfectDayConfetti() {
  const count = 200
  const defaults = { origin: { y: 0.7 }, zIndex: 9999 }

  confetti({ ...defaults, spread: 26, startVelocity: 55, particleCount: count * 0.25 })
  confetti({ ...defaults, spread: 60, particleCount: count * 0.2 })
  confetti({ ...defaults, spread: 100, decay: 0.91, scalar: 0.8, particleCount: count * 0.35 })
  confetti({ ...defaults, spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2, particleCount: count * 0.1 })
}

export function TaskChecklist({
  tasks,
  logId,
  logDate,
  userId,
  initialValues,
  isTravelDay,
  disabled = false,
  onUpdate,
}: TaskChecklistProps) {
  const [values, setValues] = useState<Record<string, boolean>>(initialValues)
  const [saving, setSaving] = useState<string | null>(null)
  const supabase = createClient()

  const toggleTask = useCallback(async (taskId: string) => {
    if (disabled) return
    const newValue = !values[taskId]
    const newValues = { ...values, [taskId]: newValue }
    setValues(newValues)
    setSaving(taskId)
    onUpdate?.(newValues)

    const allDone = tasks.every(t => newValues[t.id])
    if (allDone && !isTravelDay) {
      setTimeout(firePerfectDayConfetti, 300)
    }

    try {
      if (logId) {
        const { error } = await supabase
          .from('daily_logs')
          .update({ [taskId]: newValue, updated_at: new Date().toISOString() })
          .eq('id', logId)
        if (error) console.error('Update error:', error)
      } else {
        const { data, error } = await supabase
          .from('daily_logs')
          .upsert({
            user_id: userId,
            log_date: logDate,
            is_travel_day: isTravelDay,
            [taskId]: newValue,
          }, { onConflict: 'user_id,log_date' })
          .select()
          .single()

        if (error) console.error('Upsert error:', error)
      }
    } catch (err) {
      console.error('Task save failed:', err)
      setValues(values)
    } finally {
      setSaving(null)
    }
  }, [values, tasks, logId, logDate, userId, isTravelDay, supabase, onUpdate])

  const completedCount = tasks.filter(t => values[t.id]).length
  const totalTasks = tasks.length
  const isPerfect = completedCount === totalTasks && !isTravelDay

  return (
    <div className="space-y-2">
      {tasks.map((task, i) => {
        const Icon = TASK_ICONS[task.id] || Check
        const checked = values[task.id]
        const isSaving = saving === task.id

        return (
          <motion.button
            key={task.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => toggleTask(task.id)}
            disabled={disabled}
            className={cn(
              'w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200',
              disabled ? 'opacity-60 cursor-default' : 'active:scale-[0.98]',
              checked
                ? 'bg-brand-500/15 border border-brand-500/30'
                : 'bg-white/5 border border-white/5 hover:border-white/15'
            )}
          >
            <div className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
              checked
                ? 'bg-brand-500 shadow-lg shadow-brand-500/30'
                : 'bg-white/5'
            )}>
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

            <div className="flex-1 text-left">
              <span className={cn(
                'font-medium text-[15px] block transition-colors',
                checked ? 'text-white' : 'text-white/70'
              )}>
                {task.label}
              </span>
              <span className="text-[12px] text-white/30">{task.description}</span>
            </div>

            <span className={cn(
              'text-xs font-display font-semibold px-2 py-1 rounded-lg',
              checked ? 'text-brand-400 bg-brand-500/10' : 'text-white/20 bg-white/5'
            )}>
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
            <p className="text-white/50 text-sm mt-0.5">All 7 tasks crushed. 10 points banked.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
