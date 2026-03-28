'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Loader2, Plane, Check, X, Star, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay,
  addMonths, subMonths, isAfter, isBefore, differenceInCalendarDays
} from 'date-fns'
import { CHALLENGE_START, CHALLENGE_END, TASKS, TRAVEL_TASKS, CHECKIN_DAYS } from '@/lib/constants'
import { useSupabaseRealtimeRefresh } from '@/lib/use-supabase-realtime-refresh'

const MILESTONE_DATES: string[] = CHECKIN_DAYS.map(c => c.date)

export default function HistoryPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [logs, setLogs] = useState<any[]>([])
  const [selectedLog, setSelectedLog] = useState<any>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dayParticipants, setDayParticipants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const loadLogs = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('daily_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('log_date', { ascending: true })

    if (data) setLogs(data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  useSupabaseRealtimeRefresh(supabase, loadLogs, ['daily_logs'])

  async function selectDay(dateStr: string, log: any) {
    if (selectedDate === dateStr) {
      setSelectedDate(null)
      setSelectedLog(null)
      setDayParticipants([])
      return
    }

    setSelectedDate(dateStr)
    setSelectedLog(log || null)

    const { data } = await supabase.rpc('get_day_participants', { target_date: dateStr })
    if (data) setDayParticipants(data)
  }

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startDayOfWeek = monthStart.getDay()

  function getDayStatus(date: Date) {
    const dateStr = format(date, 'yyyy-MM-dd')
    const log = logs.find(l => l.log_date === dateStr)
    if (!log) return 'none'
    if (log.is_travel_day) return 'travel'

    const allDone = log.workout1 && log.workout2 && log.water &&
                    log.steps && log.no_sugar && log.reading && log.diet
    if (allDone) return 'perfect'

    const someDone = log.workout1 || log.workout2 || log.water ||
                     log.steps || log.no_sugar || log.reading || log.diet
    if (someDone) return 'partial'

    return 'missed'
  }

  function isMilestone(date: Date) {
    return MILESTONE_DATES.includes(format(date, 'yyyy-MM-dd'))
  }

  function getChallengeDay(date: Date) {
    const diff = differenceInCalendarDays(date, CHALLENGE_START)
    return diff + 1
  }

  const STATUS_COLORS: Record<string, string> = {
    perfect: 'bg-green-500 text-white',
    partial: 'bg-yellow-500/80 text-black',
    missed: 'bg-red-500/60 text-white',
    travel: 'bg-blue-500/60 text-white',
    none: 'bg-white/5 text-white/30',
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    )
  }

  return (
    <div className="pb-4 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-display font-bold">History</h1>
        <p className="text-white/40 text-sm mt-0.5">Your journey, day by day.</p>
      </motion.div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[11px] flex-wrap">
        {[
          { color: 'bg-green-500', label: 'Perfect' },
          { color: 'bg-yellow-500', label: 'Partial' },
          { color: 'bg-red-500/60', label: 'Missed' },
          { color: 'bg-blue-500/60', label: 'Travel' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={cn('w-3 h-3 rounded-sm', color)} />
            <span className="text-white/40">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <Star className="w-3 h-3 text-yellow-400" fill="currentColor" />
          <span className="text-white/40">Milestone</span>
        </div>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 -ml-2">
          <ChevronLeft className="w-5 h-5 text-white/50" />
        </button>
        <span className="font-display font-semibold">
          {format(currentMonth, 'MMMM yyyy')}
        </span>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 -mr-2">
          <ChevronRight className="w-5 h-5 text-white/50" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="glass-card p-4">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="text-center text-[11px] text-white/30 font-medium py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {daysInMonth.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const isChallenge = !isBefore(day, CHALLENGE_START) && !isAfter(day, CHALLENGE_END)
            const status = isChallenge ? getDayStatus(day) : 'none'
            const isToday = isSameDay(day, new Date())
            const log = logs.find(l => l.log_date === dateStr)
            const milestone = isMilestone(day)
            const isSelected = selectedDate === dateStr

            return (
              <button
                key={day.toISOString()}
                onClick={() => isChallenge && selectDay(dateStr, log)}
                className={cn(
                  'aspect-square rounded-lg flex items-center justify-center text-xs font-medium transition-all relative',
                  isChallenge ? STATUS_COLORS[status] : 'text-white/10',
                  isToday && 'ring-2 ring-brand-400 ring-offset-1 ring-offset-navy-950',
                  isSelected && 'ring-2 ring-white ring-offset-1 ring-offset-navy-950',
                  isChallenge && 'active:scale-90 cursor-pointer'
                )}
              >
                {day.getDate()}
                {milestone && (
                  <Star className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 text-yellow-400" fill="currentColor" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected Day Detail */}
      <AnimatePresence>
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 overflow-hidden"
          >
            {/* Your tasks for that day */}
            {selectedLog && (
              <div className="glass-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-semibold">
                    {format(new Date(selectedDate + 'T12:00:00'), 'EEEE, MMM d')}
                    {isMilestone(new Date(selectedDate + 'T12:00:00')) && (
                      <span className="text-yellow-400 text-xs ml-2">Milestone</span>
                    )}
                  </h3>
                  {selectedLog.is_travel_day && (
                    <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded-lg flex items-center gap-1">
                      <Plane className="w-3 h-3" /> Travel
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {(selectedLog.is_travel_day
                    ? TASKS.filter(t => (TRAVEL_TASKS as readonly string[]).includes(t.id))
                    : TASKS
                  ).map(task => {
                    const done = selectedLog[task.id]
                    return (
                      <div key={task.id} className="flex items-center gap-3 text-sm">
                        {done ? (
                          <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                        ) : (
                          <X className="w-4 h-4 text-red-400/60 flex-shrink-0" />
                        )}
                        <span className={done ? 'text-white/80' : 'text-white/30 line-through'}>
                          {task.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Who logged that day */}
            {dayParticipants.length > 0 && (
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-white/40" />
                  <h3 className="font-display font-semibold text-sm">Who Logged</h3>
                </div>
                <div className="space-y-2">
                  {dayParticipants.map((p: any) => (
                    <div key={p.user_id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-display font-bold text-white',
                          p.avatar_emoji?.startsWith('bg-') ? p.avatar_emoji : 'bg-brand-500'
                        )}>
                          {p.display_name?.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <span className="text-sm text-white/70">{p.display_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.is_travel_day && (
                          <Plane className="w-3 h-3 text-blue-400" />
                        )}
                        {p.has_logged ? (
                          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Logged</span>
                        ) : (
                          <span className="text-xs bg-white/5 text-white/20 px-2 py-0.5 rounded-full">No log</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!selectedLog && (
              <div className="glass-card p-4 text-center">
                <p className="text-white/30 text-sm">No tasks logged for this day.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
