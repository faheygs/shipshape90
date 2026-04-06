'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plane,
  Check,
  X,
  Star,
  Users,
  Lock,
  CheckCircle2,
  Pencil,
} from 'lucide-react'
import { cn, calculateDayPoints, getDayPointsRange, getLocalDateString } from '@/lib/utils'
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  isSameDay,
  addMonths,
  subMonths,
  isAfter,
  isBefore,
  differenceInCalendarDays,
} from 'date-fns'
import {
  CHALLENGE_START,
  CHALLENGE_END,
  TASKS,
  TRAVEL_TASKS,
  CHECKIN_DAYS,
  MAX_TRAVEL_DAYS,
  formatDayLabel,
} from '@/lib/constants'
import { useSupabaseRealtimeRefresh } from '@/lib/use-supabase-realtime-refresh'
import { TaskChecklist } from '@/components/task-checklist'
import { syncTravelDaysUsedFromLogs } from '@/lib/sync-travel-days-used'
import { syncPenaltyPotFromLogs } from '@/lib/sync-penalty-pot'
import { syncUserBadgesAndDiff } from '@/lib/sync-user-badges'

const MILESTONE_DATES: string[] = CHECKIN_DAYS.map((c) => c.date)

function challengeYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const CHALLENGE_START_YMD = challengeYmd(CHALLENGE_START)
const CHALLENGE_END_YMD = challengeYmd(CHALLENGE_END)

/** Past challenge days up to local today — honor-system retroactive edits (no future dates). */
function isEditableChallengeDate(dateStr: string): boolean {
  if (dateStr < CHALLENGE_START_YMD || dateStr > CHALLENGE_END_YMD) return false
  const today = getLocalDateString()
  if (dateStr > today) return false
  return true
}

export function HistoryPageClient() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [logs, setLogs] = useState<any[]>([])
  const [selectedLog, setSelectedLog] = useState<any>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dayParticipants, setDayParticipants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionUser, setSessionUser] = useState<{ id: string } | null>(null)
  const [profile, setProfile] = useState<{ travel_days_used: number } | null>(null)
  const [locking, setLocking] = useState(false)
  const [pastError, setPastError] = useState('')
  const [editDayOpen, setEditDayOpen] = useState(false)
  const [checkInsRows, setCheckInsRows] = useState<{ day_number: number; weight: number | null }[]>([])
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const openedDateQueryRef = useRef(false)

  const loadLogs = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    setSessionUser({ id: user.id })

    const [logsRes, profileRes, checkInsRes] = await Promise.all([
      supabase.from('daily_logs').select('*').eq('user_id', user.id).order('log_date', { ascending: true }),
      supabase.from('profiles').select('travel_days_used').eq('id', user.id).single(),
      supabase.from('check_ins').select('day_number, weight').eq('user_id', user.id),
    ])

    if (logsRes.data) setLogs(logsRes.data)
    setCheckInsRows(checkInsRes.data ?? [])
    if (profileRes.data) setProfile(profileRes.data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  /** Deep link from Home &quot;Edit day&quot; — select calendar day (log row syncs when `logs` loads). */
  useEffect(() => {
    if (loading || !sessionUser) return
    const raw = searchParams.get('date')
    if (!raw) {
      openedDateQueryRef.current = false
      return
    }
    if (openedDateQueryRef.current) return
    const dateStr = raw.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return
    if (!isEditableChallengeDate(dateStr)) return

    openedDateQueryRef.current = true
    setPastError('')
    setSelectedDate(dateStr)
    setEditDayOpen(true)
    setCurrentMonth(new Date(`${dateStr}T12:00:00`))

    void (async () => {
      const { data } = await supabase.rpc('get_day_participants', { target_date: dateStr })
      if (data) setDayParticipants(data)
      router.replace('/history', { scroll: false })
    })()
  }, [loading, sessionUser, searchParams, supabase, router])

  useEffect(() => {
    if (!selectedDate) return
    const log =
      logs.find((l) => {
        const d = typeof l.log_date === 'string' ? l.log_date.slice(0, 10) : String(l.log_date ?? '').slice(0, 10)
        return d === selectedDate
      }) ?? null
    setSelectedLog(log)
  }, [logs, selectedDate])

  useEffect(() => {
    if (!selectedDate) setEditDayOpen(false)
  }, [selectedDate])

  useSupabaseRealtimeRefresh(supabase, loadLogs, ['daily_logs', 'profiles', 'check_ins'])

  const refreshSelectedLog = useCallback(async () => {
    if (!sessionUser || !selectedDate) return
    const { data } = await supabase
      .from('daily_logs')
      .select('*')
      .eq('user_id', sessionUser.id)
      .eq('log_date', selectedDate)
      .maybeSingle()
    setSelectedLog(data)
    await loadLogs()
    if (data?.submitted) {
      await syncUserBadgesAndDiff(supabase, sessionUser.id)
    }
  }, [supabase, sessionUser, selectedDate, loadLogs])

  async function selectDay(dateStr: string, log: any) {
    setPastError('')
    if (selectedDate === dateStr) {
      setSelectedDate(null)
      setSelectedLog(null)
      setDayParticipants([])
      setEditDayOpen(false)
      return
    }

    setSelectedDate(dateStr)
    setSelectedLog(log || null)
    setEditDayOpen(false)

    const { data } = await supabase.rpc('get_day_participants', { target_date: dateStr })
    if (data) setDayParticipants(data)
  }

  /** Full penalty-pot rebuild + refresh; closes dialog. DB triggers already update per edit; this finalizes UI/badges. */
  async function saveLockedDayChanges() {
    if (!sessionUser || !selectedDate) return
    setLocking(true)
    setPastError('')
    try {
      await syncPenaltyPotFromLogs(supabase)
      await refreshSelectedLog()
      setEditDayOpen(false)
    } catch (e: any) {
      setPastError(e?.message ?? 'Could not save')
    } finally {
      setLocking(false)
    }
  }

  const editable = selectedDate ? isEditableChallengeDate(selectedDate) : false

  function getChallengeDayForSelectedDate(date: Date) {
    const diff = differenceInCalendarDays(date, CHALLENGE_START)
    return diff + 1
  }

  const selectedChallengeDay =
    selectedDate &&
    !isBefore(new Date(selectedDate + 'T12:00:00'), CHALLENGE_START) &&
    !isAfter(new Date(selectedDate + 'T12:00:00'), CHALLENGE_END)
      ? getChallengeDayForSelectedDate(new Date(selectedDate + 'T12:00:00'))
      : null

  function hasValidCheckinForDay(dayNum: number) {
    const row = checkInsRows.find((c) => c.day_number === dayNum)
    return row != null && row.weight != null && !Number.isNaN(Number(row.weight))
  }

  const needsCheckinForSelectedDay =
    selectedChallengeDay != null &&
    selectedChallengeDay >= 1 &&
    CHECKIN_DAYS.some((c) => c.day === selectedChallengeDay) &&
    !hasValidCheckinForDay(selectedChallengeDay)

  const activeTasks = useMemo(() => {
    const travel = selectedLog?.is_travel_day ?? false
    return travel ? TASKS.filter((t) => (TRAVEL_TASKS as readonly string[]).includes(t.id)) : [...TASKS]
  }, [selectedLog?.is_travel_day])

  const taskValues: Record<string, boolean> = useMemo(() => {
    const v: Record<string, boolean> = {}
    activeTasks.forEach((t) => {
      v[t.id] = selectedLog?.[t.id] ?? false
    })
    return v
  }, [selectedLog, activeTasks])

  const isTravelDay = selectedLog?.is_travel_day ?? false
  const todayPoints = calculateDayPoints(taskValues, isTravelDay)
  const dayPointsRange = getDayPointsRange(isTravelDay)

  async function togglePastTravel() {
    if (!sessionUser || !selectedDate || !editable) return
    if (needsCheckinForSelectedDay) {
      setPastError('Add your milestone check-in (weight) on Body Log before editing tasks for this day.')
      return
    }
    setPastError('')
    const log = logs.find((l) => l.log_date === selectedDate)
    const next = !log?.is_travel_day
    if (next) {
      const others = logs.filter((l) => l.is_travel_day && l.log_date !== selectedDate).length
      if (!log?.is_travel_day && others >= MAX_TRAVEL_DAYS) {
        setPastError(`Travel mode is limited to ${MAX_TRAVEL_DAYS} days. Turn off travel on another day first.`)
        return
      }
    }

    if (log) {
      const { error } = await supabase.from('daily_logs').update({ is_travel_day: next }).eq('id', log.id)
      if (error) {
        setPastError(error.message)
        return
      }
    } else {
      const { error } = await supabase.from('daily_logs').insert({
        user_id: sessionUser.id,
        log_date: selectedDate,
        is_travel_day: next,
      })
      if (error) {
        setPastError(error.message)
        return
      }
    }

    await syncTravelDaysUsedFromLogs(supabase, sessionUser.id)
    const { data: prof } = await supabase.from('profiles').select('travel_days_used').eq('id', sessionUser.id).single()
    if (prof) setProfile(prof)
    await refreshSelectedLog()
  }

  async function lockInSelectedDay() {
    if (!sessionUser || !selectedDate) return
    if (needsCheckinForSelectedDay) {
      setPastError('Add your milestone check-in (weight) on Body Log before locking this day.')
      return
    }
    setLocking(true)
    setPastError('')
    try {
      const { data: existing } = await supabase
        .from('daily_logs')
        .select('id')
        .eq('user_id', sessionUser.id)
        .eq('log_date', selectedDate)
        .maybeSingle()

      if (existing) {
        const { error } = await supabase.from('daily_logs').update({ submitted: true }).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('daily_logs').insert({
          user_id: sessionUser.id,
          log_date: selectedDate,
          is_travel_day: false,
          submitted: true,
        })
        if (error) throw error
      }

      await syncTravelDaysUsedFromLogs(supabase, sessionUser.id)
      await syncPenaltyPotFromLogs(supabase)
      const { data: prof } = await supabase.from('profiles').select('travel_days_used').eq('id', sessionUser.id).single()
      if (prof) setProfile(prof)
      await refreshSelectedLog()
      setEditDayOpen(false)
    } catch (e: any) {
      setPastError(e?.message ?? 'Could not lock in day')
    } finally {
      setLocking(false)
    }
  }

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startDayOfWeek = monthStart.getDay()

  function getDayStatus(date: Date) {
    const dateStr = format(date, 'yyyy-MM-dd')
    const log = logs.find((l) => l.log_date === dateStr)
    if (!log) return 'none'
    if (log.is_travel_day) return 'travel'

    const allDone =
      log.workout1 &&
      log.workout2 &&
      log.water &&
      log.steps &&
      log.no_sugar &&
      log.reading &&
      log.diet
    if (allDone) return 'perfect'

    const someDone =
      log.workout1 ||
      log.workout2 ||
      log.water ||
      log.steps ||
      log.no_sugar ||
      log.reading ||
      log.diet
    if (someDone) return 'partial'

    return 'missed'
  }

  function isMilestone(date: Date) {
    return MILESTONE_DATES.includes(format(date, 'yyyy-MM-dd'))
  }

  function getChallengeDay(date: Date) {
    return getChallengeDayForSelectedDate(date)
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
        <p className="text-[11px] text-white/30 mt-2 leading-relaxed max-w-md">
          Missed logging offline? Select a past day and correct tasks — totals, streaks, and penalties recalculate from
          your logs (honor system).
        </p>
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
        <button type="button" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 -ml-2">
          <ChevronLeft className="w-5 h-5 text-white/50" />
        </button>
        <span className="font-display font-semibold">{format(currentMonth, 'MMMM yyyy')}</span>
        <button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 -mr-2">
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
            const log = logs.find((l) => l.log_date === dateStr)
            const milestone = isMilestone(day)
            const isSelected = selectedDate === dateStr

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => isChallenge && selectDay(dateStr, log)}
                className={cn(
                  'aspect-square rounded-lg flex items-center justify-center text-xs font-medium transition-all relative',
                  isChallenge ? STATUS_COLORS[status] : 'text-white/10',
                  isToday && 'ring-2 ring-brand-400 ring-offset-1 ring-offset-navy-950',
                  isSelected && 'ring-2 ring-white ring-offset-1 ring-offset-navy-950',
                  isChallenge && 'active:scale-90 cursor-pointer',
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
        {selectedDate && sessionUser && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 overflow-hidden"
          >
            <div className="glass-card p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-display font-semibold">
                  {format(new Date(selectedDate + 'T12:00:00'), 'EEEE, MMM d')}
                  {selectedChallengeDay != null && selectedChallengeDay >= 1 && (
                    <span className="text-white/40 text-xs font-normal ml-2">· {formatDayLabel(selectedChallengeDay)}</span>
                  )}
                  {isMilestone(new Date(selectedDate + 'T12:00:00')) && (
                    <span className="text-yellow-400 text-xs ml-2">Milestone</span>
                  )}
                </h3>
                {selectedLog?.submitted && (
                  <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-lg flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Locked in
                  </span>
                )}
              </div>

              {!editable && (
                <p className="text-[11px] text-white/35">Future dates can&apos;t be edited. Use the home screen for today.</p>
              )}
            </div>

            {editable && (
              <button
                type="button"
                onClick={() => setEditDayOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-display font-semibold text-sm
                  bg-gradient-to-r from-brand-600/90 to-cyan-700/80 text-white border border-white/10 shadow-lg shadow-brand-900/40
                  hover:from-brand-500 hover:to-cyan-600 active:scale-[0.99] transition-all"
              >
                <Pencil className="w-4 h-4" />
                Edit day
              </button>
            )}

            {editable && !selectedLog && (
              <p className="text-[11px] text-center text-white/35 px-2">
                No log for this day yet — tap <strong className="text-white/50">Edit day</strong> to add tasks.
              </p>
            )}

            {/* Read-only summary when not using editor (non-editable) */}
            {!editable && selectedLog && (
              <div className="glass-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-semibold text-sm text-white/50">Snapshot</h3>
                  {selectedLog.is_travel_day && (
                    <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded-lg flex items-center gap-1">
                      <Plane className="w-3 h-3" /> Travel
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  {(selectedLog.is_travel_day
                    ? TASKS.filter((t) => (TRAVEL_TASKS as readonly string[]).includes(t.id))
                    : TASKS
                  ).map((task) => {
                    const done = selectedLog[task.id]
                    return (
                      <div key={task.id} className="flex items-center gap-3 text-sm">
                        {done ? (
                          <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                        ) : (
                          <X className="w-4 h-4 text-red-400/60 flex-shrink-0" />
                        )}
                        <span className={done ? 'text-white/80' : 'text-white/30 line-through'}>{task.label}</span>
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
                        <div
                          className={cn(
                            'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-display font-bold text-white',
                            p.avatar_emoji?.startsWith('bg-') ? p.avatar_emoji : 'bg-brand-500',
                          )}
                        >
                          {p.display_name
                            ?.split(' ')
                            .map((w: string) => w[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)}
                        </div>
                        <span className="text-sm text-white/70">{p.display_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.is_travel_day && <Plane className="w-3 h-3 text-blue-400" />}
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

            {!editable && selectedDate && !selectedLog && (
              <div className="glass-card p-4 text-center">
                <p className="text-white/35 text-sm">No log for this day yet.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editDayOpen && selectedDate && sessionUser && editable && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !locking && setEditDayOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="relative w-full max-w-md max-h-[min(90dvh,40rem)] overflow-y-auto bg-navy-900 rounded-2xl p-4 pt-5 space-y-4 border border-brand-500/25 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => !locking && setEditDayOpen(false)}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 text-white/60 hover:text-white hover:bg-white/15 transition-colors z-10"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="pr-8">
                <h2 className="font-display font-bold text-lg text-white">
                  {format(new Date(selectedDate + 'T12:00:00'), 'EEEE, MMM d')}
                  {selectedChallengeDay != null && selectedChallengeDay >= 1 && (
                    <span className="text-white/40 text-sm font-normal ml-2">
                      · {formatDayLabel(selectedChallengeDay)}
                    </span>
                  )}
                </h2>
                {selectedLog?.submitted && (
                  <span className="inline-flex mt-2 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-lg items-center gap-1">
                    <Lock className="w-3 h-3" /> Locked in
                  </span>
                )}
              </div>

              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                <strong className="text-amber-100">Honor system:</strong> update tasks for this calendar day if you
                couldn&apos;t log on the day itself. Tap <strong className="text-amber-100">Save</strong> when you&apos;re
                done — totals, streaks, and prize-pot penalties update automatically (including removing pot entries when
                the day has no missed tasks).
              </p>

              {needsCheckinForSelectedDay && (
                <div className="rounded-xl border border-yellow-400/40 bg-yellow-500/10 p-3 space-y-2">
                  <p className="text-sm text-white/85 font-medium">Milestone check-in required first</p>
                  <p className="text-[11px] text-white/55 leading-snug">
                    Log weight for {formatDayLabel(selectedChallengeDay!)} on Body Log (photo optional). Then you can
                    edit tasks for this day.
                  </p>
                  <Link
                    href="/checkins"
                    className="inline-flex items-center justify-center w-full py-2.5 rounded-lg font-display font-semibold text-sm bg-gradient-to-r from-yellow-500 to-brand-500 text-white"
                  >
                    Open Body Log
                  </Link>
                </div>
              )}

              <button
                type="button"
                onClick={togglePastTravel}
                disabled={locking || needsCheckinForSelectedDay}
                className={cn(
                  'w-full flex items-center justify-between p-4 rounded-xl transition-all text-left',
                  isTravelDay ? 'bg-blue-500/15 border border-blue-500/30' : 'bg-white/5 border border-white/5',
                  needsCheckinForSelectedDay && 'opacity-45 pointer-events-none',
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Plane className={cn('w-5 h-5 shrink-0', isTravelDay ? 'text-blue-400' : 'text-white/30')} />
                  <div>
                    <span className={cn('text-sm font-medium block', isTravelDay ? 'text-blue-300' : 'text-white/60')}>
                      Travel day mode
                    </span>
                    <span className="text-[11px] text-white/30">
                      {profile?.travel_days_used ?? 0} of {MAX_TRAVEL_DAYS} used · tap to toggle
                    </span>
                  </div>
                </div>
                <div
                  className={cn(
                    'w-12 h-7 rounded-full transition-all flex items-center px-1 shrink-0',
                    isTravelDay ? 'bg-blue-500' : 'bg-white/10',
                  )}
                >
                  <motion.div
                    className="w-5 h-5 rounded-full bg-white shadow-lg"
                    animate={{ x: isTravelDay ? 20 : 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </div>
              </button>

              <div className="flex items-center justify-between text-sm">
                <span className="text-white/45">Day points (preview)</span>
                <span className={cn('font-display font-bold', todayPoints >= 0 ? 'text-brand-400' : 'text-red-400')}>
                  {todayPoints > 0 ? '+' : ''}
                  {todayPoints}{' '}
                  <span className="text-[10px] text-white/30 font-normal">
                    ({dayPointsRange.min}…{dayPointsRange.max}
                    {isTravelDay ? ' · travel' : ' · full day'})
                  </span>
                </span>
              </div>

              {pastError && <p className="text-red-400 text-sm">{pastError}</p>}

              <TaskChecklist
                key={`modal-${selectedDate}-${selectedLog?.is_travel_day}-${selectedLog?.id ?? 'new'}`}
                tasks={[...activeTasks]}
                logId={selectedLog?.id ?? null}
                logDate={selectedDate}
                userId={sessionUser.id}
                initialValues={taskValues}
                isTravelDay={isTravelDay}
                disabled={locking || needsCheckinForSelectedDay}
                submitted={false}
                onUpdate={() => {
                  void refreshSelectedLog()
                }}
              />

              {!selectedLog?.submitted ? (
                <button
                  type="button"
                  onClick={() => void lockInSelectedDay()}
                  disabled={locking || needsCheckinForSelectedDay}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-display font-semibold text-sm
                    bg-gradient-to-r from-brand-600 to-cyan-600 text-white shadow-lg shadow-brand-500/25
                    hover:opacity-95 transition-all disabled:opacity-50"
                >
                  {locking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {locking ? 'Saving…' : 'Save & lock day'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void saveLockedDayChanges()}
                  disabled={locking}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-display font-semibold text-sm
                    bg-gradient-to-r from-brand-600 to-cyan-600 text-white shadow-lg shadow-brand-500/25
                    active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  {locking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {locking ? 'Saving…' : 'Save'}
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
