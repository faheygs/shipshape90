'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  TASKS,
  TRAVEL_TASKS,
  TOTAL_DAYS,
  MAX_TRAVEL_DAYS,
  CHECKIN_DAYS,
  CHALLENGE_START,
  MAX_TOTAL_POINTS,
  BADGE_COLLECTOR_BONUS_POINTS,
} from '@/lib/constants'
import { useChallengeDay, useEffectiveLogDate } from '@/lib/use-challenge-day'
import { useSupabaseRealtimeRefresh } from '@/lib/use-supabase-realtime-refresh'
import { formatDate, calculateDayPoints, getDayPointsRange } from '@/lib/utils'
import { TaskChecklist } from '@/components/task-checklist'
import { ProgressRing } from '@/components/progress-ring'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plane, Ship, Loader2, Lock, Camera, X, Scale, Percent, Star, CheckCircle2, Baby, Anchor,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import confetti from 'canvas-confetti'
import { ChallengeCompleteCelebration } from '@/components/challenge-complete-celebration'
import { BadgeEarnedToast } from '@/components/badge-earned-toast'
import { syncUserBadgesAndDiff, fetchUserBadgeKeys } from '@/lib/sync-user-badges'

const BAILOUT_QUIPS = [
  'Plot twist: you\'re building a tiny human. The gangplank can wait.',
  'Ship\'s log: stowaway detected. New mission unlocked — still proud of you, captain.',
  'You\'ve been granted infinite shore leave. The leaderboard sends a onesie and zero judgment.',
  'Challenge rules said "no excuses," but biology filed an appeal and won. Fair play.',
  'Burpees are optional. Naps are not. That\'s the new meta.',
  'You traded leaderboard glory for a different kind of PR. Respect.',
]

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [todayLog, setTodayLog] = useState<any>(null)
  const [isTravelDay, setIsTravelDay] = useState(false)
  const [streak, setStreak] = useState(0)
  const [myPoints, setMyPoints] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // End Day state
  const [submitting, setSubmitting] = useState(false)
  const [showMilestoneModal, setShowMilestoneModal] = useState(false)
  const [milestoneWeight, setMilestoneWeight] = useState('')
  const [milestoneBf, setMilestoneBf] = useState('')
  const [milestoneFile, setMilestoneFile] = useState<File | null>(null)
  const [milestonePreview, setMilestonePreview] = useState<string | null>(null)
  const [milestoneError, setMilestoneError] = useState('')
  const [showChallengeComplete, setShowChallengeComplete] = useState(false)
  const [badgeToastKeys, setBadgeToastKeys] = useState<string[] | null>(null)
  const [hasDay1Checkin, setHasDay1Checkin] = useState(false)
  const [showInitialCheckinModal, setShowInitialCheckinModal] = useState(false)
  const badgeInitialLoadRef = useRef(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()
  const today = useEffectiveLogDate()
  const challengeDay = useChallengeDay()
  const progress = (challengeDay / TOTAL_DAYS) * 100

  const isMilestoneDay = CHECKIN_DAYS.some(c => c.day === challengeDay && c.day !== 1)
  const currentMilestone = CHECKIN_DAYS.find(c => c.day === challengeDay && c.day !== 1)
  const isSubmitted = todayLog?.submitted === true
  const day1Meta = CHECKIN_DAYS.find(c => c.day === 1)!
  const preChallenge = challengeDay < 1
  const needsInitialCheckin = challengeDay >= 1 && !hasDay1Checkin
  const tasksLocked = isSubmitted || preChallenge || needsInitialCheckin

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUser(user)

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!existingProfile) {
      const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Competitor'
      await supabase.from('profiles').insert({
        id: user.id,
        display_name: displayName,
      })
    }

    const [profileRes, logRes, statsRes, day1Res] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('daily_logs').select('*').eq('user_id', user.id).eq('log_date', today).maybeSingle(),
      supabase.rpc('get_my_points'),
      supabase.from('check_ins').select('id').eq('user_id', user.id).eq('day_number', 1).maybeSingle(),
    ])

    setHasDay1Checkin(!!day1Res.data)
    if (profileRes.data) setProfile(profileRes.data)
    if (logRes.data) {
      setTodayLog(logRes.data)
      setIsTravelDay(!!logRes.data.is_travel_day)
    } else {
      setTodayLog(null)
      setIsTravelDay(false)
    }
    if (statsRes.data && statsRes.data.length > 0) {
      setMyPoints(statsRes.data[0])
    } else {
      setMyPoints(null)
    }

    const { data: streakLogs } = await supabase
      .from('daily_logs')
      .select('log_date, is_travel_day, submitted, workout1, workout2, water, steps, no_sugar, reading, diet')
      .eq('user_id', user.id)
      .order('log_date', { ascending: false })
      .limit(30)

    if (streakLogs && streakLogs.length > 0) {
      let currentStreak = 0
      for (const log of streakLogs) {
        if (log.is_travel_day) {
          if (!log.submitted) break
          const travelPerfect =
            log.workout1 && log.water && log.no_sugar && log.reading && log.diet
          if (!travelPerfect) break
          continue
        }
        if (!log.submitted) break
        const isPerfect = log.workout1 && log.workout2 && log.water &&
                          log.steps && log.no_sugar && log.reading && log.diet
        if (isPerfect) currentStreak++
        else break
      }
      setStreak(currentStreak)
    } else {
      setStreak(0)
    }

    const { newBadgeKeys } = await syncUserBadgesAndDiff(supabase, user.id)
    if (!badgeInitialLoadRef.current && newBadgeKeys.length > 0) {
      setBadgeToastKeys(newBadgeKeys)
    }
    if (badgeInitialLoadRef.current) {
      badgeInitialLoadRef.current = false
    }

    setLoading(false)
  }, [supabase, today])

  useEffect(() => { loadData() }, [loadData])

  useSupabaseRealtimeRefresh(supabase, loadData, ['daily_logs', 'profiles', 'penalty_pot', 'user_badges', 'check_ins'])

  const dismissBadgeToast = useCallback(() => setBadgeToastKeys(null), [])

  const toggleTravelDay = async () => {
    if (!user || isSubmitted || preChallenge || needsInitialCheckin) return
    const newValue = !isTravelDay
    if (newValue && profile && profile.travel_days_used >= MAX_TRAVEL_DAYS) return

    setIsTravelDay(newValue)

    const logData = {
      user_id: user.id,
      log_date: today,
      is_travel_day: newValue,
    }

    await supabase.from('daily_logs').upsert(logData, { onConflict: 'user_id,log_date' })

    if (newValue && profile) {
      await supabase
        .from('profiles')
        .update({ travel_days_used: profile.travel_days_used + 1 })
        .eq('id', user.id)
      setProfile({ ...profile, travel_days_used: profile.travel_days_used + 1 })
    } else if (!newValue && profile) {
      await supabase
        .from('profiles')
        .update({ travel_days_used: Math.max(0, profile.travel_days_used - 1) })
        .eq('id', user.id)
      setProfile({ ...profile, travel_days_used: Math.max(0, profile.travel_days_used - 1) })
    }

    loadData()
  }

  // --- End Day ---
  function handleEndDay() {
    if (preChallenge) return
    if (needsInitialCheckin) {
      setShowInitialCheckinModal(true)
      setMilestoneError('')
      return
    }
    if (isMilestoneDay) {
      setShowMilestoneModal(true)
      setMilestoneError('')
    } else {
      submitDay()
    }
  }

  async function submitDay() {
    if (!user) return
    setSubmitting(true)

    const badgeKeysBefore = await fetchUserBadgeKeys(supabase, user.id)

    const logData = {
      user_id: user.id,
      log_date: today,
      is_travel_day: isTravelDay,
      submitted: true,
    }

    await supabase.from('daily_logs').upsert(logData, { onConflict: 'user_id,log_date' })

    const { newBadgeKeys } = await syncUserBadgesAndDiff(supabase, user.id, {
      beforeKeys: badgeKeysBefore,
    })
    if (newBadgeKeys.length > 0) setBadgeToastKeys(newBadgeKeys)

    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      zIndex: 9999,
      colors: ['#f97316', '#fb923c', '#fdba74'],
    })

    await loadData()
    setSubmitting(false)
  }

  async function submitMilestoneAndDay() {
    if (!user) return

    if (!milestoneWeight.trim()) {
      setMilestoneError('Weight is required for milestone check-in')
      return
    }
    if (!milestoneBf.trim()) {
      setMilestoneError('Body fat % is required for milestone check-in')
      return
    }
    if (!milestoneFile) {
      setMilestoneError('A progress photo is required for milestone check-in')
      return
    }

    setSubmitting(true)
    setMilestoneError('')

    const badgeKeysBefore = await fetchUserBadgeKeys(supabase, user.id)

    // Upload photo
    const ext = milestoneFile.name.split('.').pop()
    const filePath = `${user.id}/day${currentMilestone!.day}-${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('checkin-photos')
      .upload(filePath, milestoneFile, { upsert: true })

    if (uploadError) {
      setMilestoneError(`Photo upload failed: ${uploadError.message}`)
      setSubmitting(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('checkin-photos')
      .getPublicUrl(filePath)
    const photoUrl = urlData.publicUrl

    // Save body stats
    const { error: statsError } = await supabase.from('body_stats').upsert({
      user_id: user.id,
      recorded_date: today,
      weight: parseFloat(milestoneWeight),
      body_fat: parseFloat(milestoneBf),
      notes: photoUrl,
    }, { onConflict: 'user_id,recorded_date' })

    if (statsError) {
      setMilestoneError(`Failed to save stats: ${statsError.message}`)
      setSubmitting(false)
      return
    }

    // Save milestone check-in
    await supabase.from('check_ins').upsert({
      user_id: user.id,
      day_number: currentMilestone!.day,
      photo_url: photoUrl,
      weight: parseFloat(milestoneWeight),
      body_fat: parseFloat(milestoneBf),
      notes: `${currentMilestone!.label}`,
    }, { onConflict: 'user_id,day_number' })

    // Now submit the day
    const logData = {
      user_id: user.id,
      log_date: today,
      is_travel_day: isTravelDay,
      submitted: true,
    }

    await supabase.from('daily_logs').upsert(logData, { onConflict: 'user_id,log_date' })

    const { newBadgeKeys } = await syncUserBadgesAndDiff(supabase, user.id, {
      beforeKeys: badgeKeysBefore,
    })
    if (newBadgeKeys.length > 0) setBadgeToastKeys(newBadgeKeys)

    const finishedDay90 = currentMilestone!.day === 90

    setShowMilestoneModal(false)
    setMilestoneWeight('')
    setMilestoneBf('')
    setMilestoneFile(null)
    setMilestonePreview(null)

    if (finishedDay90) {
      confetti({
        particleCount: 220,
        spread: 100,
        origin: { y: 0.45 },
        zIndex: 10001,
        colors: ['#f97316', '#eab308', '#22c55e', '#38bdf8', '#f472b6'],
        ticks: 300,
      })
      setTimeout(() => {
        confetti({
          particleCount: 120,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.65 },
          zIndex: 10001,
          colors: ['#fbbf24', '#f97316'],
        })
        confetti({
          particleCount: 120,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.65 },
          zIndex: 10001,
          colors: ['#22c55e', '#38bdf8'],
        })
      }, 250)
    } else {
      confetti({
        particleCount: 150,
        spread: 90,
        origin: { y: 0.5 },
        zIndex: 9999,
        colors: ['#f97316', '#eab308', '#22c55e'],
      })
    }

    await loadData()
    setSubmitting(false)

    if (finishedDay90) {
      setShowChallengeComplete(true)
    }
  }

  async function submitInitialCheckin() {
    if (!user) return

    if (!milestoneWeight.trim()) {
      setMilestoneError('Weight is required for your initial check-in')
      return
    }
    if (!milestoneBf.trim()) {
      setMilestoneError('Body fat % is required for your initial check-in')
      return
    }
    if (!milestoneFile) {
      setMilestoneError('A before photo is required for your initial check-in')
      return
    }

    setSubmitting(true)
    setMilestoneError('')

    const badgeKeysBefore = await fetchUserBadgeKeys(supabase, user.id)

    const ext = milestoneFile.name.split('.').pop()
    const filePath = `${user.id}/day1-${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('checkin-photos')
      .upload(filePath, milestoneFile, { upsert: true })

    if (uploadError) {
      setMilestoneError(`Photo upload failed: ${uploadError.message}`)
      setSubmitting(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('checkin-photos')
      .getPublicUrl(filePath)
    const photoUrl = urlData.publicUrl

    const { error: statsError } = await supabase.from('body_stats').upsert({
      user_id: user.id,
      recorded_date: today,
      weight: parseFloat(milestoneWeight),
      body_fat: parseFloat(milestoneBf),
      notes: photoUrl,
    }, { onConflict: 'user_id,recorded_date' })

    if (statsError) {
      setMilestoneError(`Failed to save stats: ${statsError.message}`)
      setSubmitting(false)
      return
    }

    await supabase.from('check_ins').upsert({
      user_id: user.id,
      day_number: 1,
      photo_url: photoUrl,
      weight: parseFloat(milestoneWeight),
      body_fat: parseFloat(milestoneBf),
      notes: `${day1Meta.label}`,
    }, { onConflict: 'user_id,day_number' })

    await supabase.from('profiles').update({ onboarded: true }).eq('id', user.id)

    const { newBadgeKeys } = await syncUserBadgesAndDiff(supabase, user.id, {
      beforeKeys: badgeKeysBefore,
    })
    if (newBadgeKeys.length > 0) setBadgeToastKeys(newBadgeKeys)

    setShowInitialCheckinModal(false)
    setMilestoneWeight('')
    setMilestoneBf('')
    setMilestoneFile(null)
    setMilestonePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''

    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.55 },
      zIndex: 9999,
      colors: ['#f97316', '#eab308', '#22c55e'],
    })

    await loadData()
    setSubmitting(false)
  }

  function handleMilestoneFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMilestoneFile(file)
    setMilestonePreview(URL.createObjectURL(file))
  }

  function clearMilestoneFile() {
    setMilestoneFile(null)
    setMilestonePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // --- Render ---
  const activeTasks = isTravelDay
    ? TASKS.filter(t => (TRAVEL_TASKS as readonly string[]).includes(t.id))
    : [...TASKS]

  const taskValues: Record<string, boolean> = {}
  activeTasks.forEach(t => {
    taskValues[t.id] = todayLog?.[t.id] ?? false
  })

  const todayPoints = calculateDayPoints(taskValues, isTravelDay)
  const dayPointsRange = getDayPointsRange(isTravelDay)

  const bailoutQuip = useMemo(
    () => BAILOUT_QUIPS[Math.floor(Math.random() * BAILOUT_QUIPS.length)],
    []
  )

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    )
  }

  if (profile?.pregnant_bailout) {
    return (
      <div className="min-h-[calc(100dvh-5.5rem)] flex flex-col justify-center pb-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-pink-400/35 bg-gradient-to-br from-pink-500/15 via-fuchsia-500/10 to-purple-900/20 p-5 shadow-lg shadow-pink-500/10"
        >
          <div className="pointer-events-none absolute -right-6 -top-6 text-7xl opacity-[0.12] rotate-12 select-none">
            👶
          </div>
          <div className="relative flex flex-col gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-pink-500/25 ring-1 ring-pink-400/40 mx-auto">
              <Baby className="h-8 w-8 text-pink-200" strokeWidth={2} />
            </div>
            <div className="text-center min-w-0">
              <p className="font-display font-bold text-pink-100 text-base flex items-center justify-center gap-2 flex-wrap">
                <Anchor className="w-4 h-4 text-pink-300/80 shrink-0" />
                Officially off the competitive hook
              </p>
              <p className="mt-4 text-[15px] leading-relaxed text-white/80">
                {bailoutQuip}
              </p>
              <p className="mt-4 text-sm text-pink-200/60 font-medium">
                You&apos;re still allowed to open the app and judge everyone else silently.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="pb-4 space-y-6">
      <BadgeEarnedToast badgeKeys={badgeToastKeys} onDismiss={dismissBadgeToast} />
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-display font-bold">
            Hey, {profile?.display_name || 'Competitor'}
          </h1>
          <p className="text-white/40 text-sm mt-0.5">{formatDate(new Date())}</p>
        </div>
        <ProgressRing
          progress={progress}
          size={64}
          strokeWidth={5}
          label={`${challengeDay}`}
          sublabel={`of ${TOTAL_DAYS}`}
        />
      </motion.div>

      {/* Pre-challenge: no logging until Day 1 */}
      {preChallenge && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card-bright p-4 border-white/15 bg-white/[0.03]"
        >
          <div className="flex items-center gap-2 mb-1">
            <Lock className="w-5 h-5 text-white/50" />
            <span className="font-display font-bold text-white/90">Challenge hasn&apos;t started</span>
          </div>
          <p className="text-sm text-white/55">
            Logging unlocks at midnight (your local time) starting {formatDate(CHALLENGE_START)} — Day 1. You can browse Rules &amp; Profile until then.
          </p>
        </motion.div>
      )}

      {/* Initial check-in required (after Day 1 begins) */}
      {needsInitialCheckin && !isSubmitted && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card-bright p-4 border-brand-500/30 bg-brand-500/5"
        >
          <div className="flex items-center gap-2 mb-1">
            <Anchor className="w-5 h-5 text-brand-400" />
            <span className="font-display font-bold text-brand-200">Initial check-in</span>
          </div>
          <p className="text-sm text-white/60">{day1Meta.label} — {day1Meta.tagline}</p>
          <p className="text-xs text-brand-400/80 mt-1">Enter starting weight, body fat %, and a before photo. Tasks unlock after.</p>
        </motion.div>
      )}

      {/* Milestone Banner */}
      {isMilestoneDay && !isSubmitted && !needsInitialCheckin && currentMilestone && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card-bright p-4 border-yellow-500/30 bg-yellow-500/5"
        >
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-5 h-5 text-yellow-400" fill="currentColor" />
            <span className="font-display font-bold text-yellow-300">Milestone Day!</span>
          </div>
          <p className="text-sm text-white/60">{currentMilestone.label} — {currentMilestone.tagline}</p>
          <p className="text-xs text-yellow-400/70 mt-1">Photo, weight & BF% will be required when you end your day.</p>
        </motion.div>
      )}

      {/* Stats Row — same layout: value · label · snippet (0 shown when empty) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-3 gap-2 sm:gap-3"
      >
        <div className="glass-card p-3 sm:p-3.5 text-center flex flex-col min-h-[9rem] justify-between rounded-xl">
          <div>
            <p className="text-2xl font-display font-bold text-brand-400 tabular-nums leading-none">
              {myPoints?.total_points ?? 0}
            </p>
            {(myPoints?.badge_collector_bonus ?? 0) > 0 && (
              <p className="text-[10px] text-violet-300/90 mt-1 font-medium">
                includes +{myPoints.badge_collector_bonus} all badges
              </p>
            )}
            <p className="text-[11px] text-white/45 mt-2 leading-tight">Challenge total</p>
          </div>
          <p className="text-[9px] text-white/25 leading-snug pt-3 border-t border-white/5">
            Daily + streak bonuses + up to +{BADGE_COLLECTOR_BONUS_POINTS} if you earn every badge · cap {MAX_TOTAL_POINTS}
          </p>
        </div>
        <div className="glass-card p-3 sm:p-3.5 text-center flex flex-col min-h-[9rem] justify-between rounded-xl">
          <div>
            <p className="text-2xl font-display font-bold text-green-400 tabular-nums leading-none">
              {myPoints?.perfect_days ?? 0}
            </p>
            <p className="text-[11px] text-white/45 mt-2 leading-tight">Perfect days</p>
          </div>
          <p className="text-[9px] text-white/25 leading-snug pt-3 border-t border-white/5">
            All 7 tasks + day submitted (counts toward total)
          </p>
        </div>
        <div className="glass-card p-3 sm:p-3.5 text-center flex flex-col min-h-[9rem] justify-between rounded-xl">
          <div>
            <p className="text-2xl font-display font-bold text-orange-400/95 tabular-nums leading-none">
              {streak}
            </p>
            <p className="text-[11px] text-white/45 mt-2 leading-tight">Streak</p>
          </div>
          <p className="text-[9px] text-white/25 leading-snug pt-3 border-t border-white/5">
            Full days only add +1 · perfect travel pauses · missed travel breaks
          </p>
        </div>
      </motion.div>

      {/* Today's score — only this calendar day; unchecked tasks count as −3 each (floor {dayPointsRange.min}) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="glass-card p-4 flex items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <span className="text-sm text-white/50 block">Today&apos;s points</span>
          <span className="text-[10px] text-white/25 block mt-0.5 leading-snug">
            {isSubmitted
              ? (isTravelDay
                ? 'Locked in · travel range −15 to +5'
                : 'Locked in · full day −21…+10')
              : (isTravelDay
                ? 'Not in your total until you end the day · travel −15…+5'
                : 'Not in your total until you end the day · full day −21…+10')}
          </span>
        </div>
        <span
          className={`text-2xl font-display font-bold shrink-0 ${
            todayPoints >= 0 ? 'text-brand-400' : 'text-red-400'
          }`}
        >
          {todayPoints > 0 ? '+' : ''}
          {todayPoints}
        </span>
      </motion.div>

      {/* Travel Day Toggle */}
      {!isSubmitted && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <button
            type="button"
            onClick={toggleTravelDay}
            disabled={preChallenge || needsInitialCheckin}
            className={cn(
              'w-full flex items-center justify-between p-4 rounded-xl transition-all',
              isTravelDay
                ? 'bg-blue-500/15 border border-blue-500/30'
                : 'bg-white/5 border border-white/5',
              (preChallenge || needsInitialCheckin) && 'opacity-45 pointer-events-none cursor-not-allowed',
            )}
          >
            <div className="flex items-center gap-3">
              <Plane className={`w-5 h-5 ${isTravelDay ? 'text-blue-400' : 'text-white/30'}`} />
              <div className="text-left">
                <span className={`text-sm font-medium ${isTravelDay ? 'text-blue-300' : 'text-white/60'}`}>
                  Travel Day Mode
                </span>
                <span className="text-[11px] text-white/30 block">
                  {profile?.travel_days_used ?? 0} of {MAX_TRAVEL_DAYS} used
                </span>
              </div>
            </div>
            <div className={`w-12 h-7 rounded-full transition-all flex items-center px-1
              ${isTravelDay ? 'bg-blue-500' : 'bg-white/10'}`}>
              <motion.div
                className="w-5 h-5 rounded-full bg-white shadow-lg"
                animate={{ x: isTravelDay ? 20 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </div>
          </button>
        </motion.div>
      )}

      {/* Task Checklist */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-display font-semibold">
            {isTravelDay ? 'Travel Tasks' : "Today's Tasks"}
          </h2>
          {isSubmitted ? (
            <div className="flex items-center gap-1.5 text-green-400">
              <Lock className="w-3.5 h-3.5" />
              <span className="text-xs font-display font-semibold">Day Locked In</span>
            </div>
          ) : tasksLocked ? (
            <div className="flex items-center gap-1.5 text-white/40">
              <Lock className="w-3.5 h-3.5" />
              <span className="text-xs font-medium max-w-[10rem] text-right leading-tight">
                {preChallenge ? 'Opens Day 1' : needsInitialCheckin ? 'After initial check-in' : ''}
              </span>
            </div>
          ) : (
            <Ship className="w-4 h-4 text-white/20" />
          )}
        </div>

        <TaskChecklist
          tasks={[...activeTasks]}
          logId={todayLog?.id ?? null}
          logDate={today}
          userId={user?.id}
          initialValues={taskValues}
          isTravelDay={isTravelDay}
          disabled={tasksLocked}
          onUpdate={() => setTimeout(loadData, 500)}
        />
      </motion.div>

      {/* End Day Button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        {isSubmitted ? (
          <div className="flex items-center justify-center gap-2 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <span className="font-display font-semibold text-green-400">Day {challengeDay} Complete</span>
          </div>
        ) : preChallenge ? (
          <button
            type="button"
            disabled
            className="w-full flex items-center justify-center gap-3 py-4 rounded-xl font-display font-bold text-base
              bg-white/5 border border-white/10 text-white/45 cursor-not-allowed"
          >
            <Lock className="w-5 h-5" />
            Challenge starts {formatDate(CHALLENGE_START)}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleEndDay}
            disabled={submitting}
            className={cn(
              'w-full flex items-center justify-center gap-3 py-4 rounded-xl font-display font-bold text-base transition-all',
              'active:scale-[0.98] disabled:opacity-50',
              needsInitialCheckin
                ? 'bg-gradient-to-r from-brand-600 to-cyan-600 text-white shadow-lg shadow-brand-500/25'
                : isMilestoneDay
                  ? 'bg-gradient-to-r from-yellow-500 to-brand-500 text-white shadow-lg shadow-brand-500/30'
                  : 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/20'
            )}
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : needsInitialCheckin ? (
              <Anchor className="w-5 h-5" />
            ) : isMilestoneDay ? (
              <Star className="w-5 h-5" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
            {submitting
              ? 'Submitting...'
              : needsInitialCheckin
                ? 'Initial check-in'
                : isMilestoneDay
                  ? `End Day ${challengeDay} — Milestone Check-in`
                  : `End Day ${challengeDay}`
            }
          </button>
        )}
      </motion.div>

      {/* Milestone Check-in — centered dialog (not bottom sheet) */}
      <AnimatePresence>
        {showMilestoneModal && currentMilestone && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !submitting && setShowMilestoneModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="relative w-full max-w-sm bg-navy-900 rounded-2xl p-4 pt-5 space-y-3 max-h-[min(85dvh,32rem)] overflow-y-auto border border-white/10 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => !submitting && setShowMilestoneModal(false)}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 text-white/60 hover:text-white hover:bg-white/15 transition-colors z-10"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Modal Header */}
              <div className="text-center pr-8">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Star className="w-5 h-5 text-yellow-400" fill="currentColor" />
                  <h2 className="text-lg font-display font-bold leading-tight">{currentMilestone.label}</h2>
                </div>
                <p className="text-xs text-white/50 leading-snug">{currentMilestone.tagline}</p>
                <p className="text-[11px] text-yellow-400/80 mt-1.5 leading-snug">
                  Weight, body fat %, and a progress photo are required to end your day.
                </p>
              </div>

              {/* Photo — compact preview (not full-bleed) */}
              <div>
                {milestonePreview ? (
                  <div className="relative w-28 aspect-[3/4] mx-auto rounded-lg overflow-hidden bg-white/5 mb-2 ring-1 ring-white/10">
                    <img src={milestonePreview} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={clearMilestoneFile}
                      className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center"
                    >
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                ) : null}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleMilestoneFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl transition-all',
                    'border border-dashed text-xs font-medium active:scale-[0.98]',
                    milestonePreview
                      ? 'bg-green-500/10 border-green-500/30 text-green-400'
                      : 'bg-white/5 border-white/15 text-white/40'
                  )}
                >
                  <Camera className="w-4 h-4" />
                  {milestonePreview ? 'Change Photo' : 'Take Progress Photo'}
                </button>
              </div>

              {/* Weight + BF */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white/40 block mb-1 flex items-center gap-1">
                    <Scale className="w-3 h-3" /> Weight (lbs)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={milestoneWeight}
                    onChange={(e) => setMilestoneWeight(e.target.value)}
                    placeholder="185.0"
                    className="w-full px-2.5 py-2 rounded-lg bg-white/5 border border-white/10
                               text-white text-sm placeholder:text-white/20 focus:outline-none
                               focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/25"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 block mb-1 flex items-center gap-1">
                    <Percent className="w-3 h-3" /> Body Fat %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={milestoneBf}
                    onChange={(e) => setMilestoneBf(e.target.value)}
                    placeholder="18.5"
                    className="w-full px-2.5 py-2 rounded-lg bg-white/5 border border-white/10
                               text-white text-sm placeholder:text-white/20 focus:outline-none
                               focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/25"
                  />
                </div>
              </div>

              {/* Error */}
              {milestoneError && (
                <p className="text-red-400 text-sm text-center">{milestoneError}</p>
              )}

              {/* Submit */}
              <button
                type="button"
                onClick={submitMilestoneAndDay}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                           bg-gradient-to-r from-yellow-500 to-brand-500 text-white
                           font-display font-bold text-sm shadow-lg shadow-brand-500/30
                           active:scale-[0.98] disabled:opacity-50 transition-all"
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
                {submitting ? 'Submitting...' : `Lock In Day ${challengeDay}`}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Initial check-in (Day 1 starting stats) — no daily log submit */}
      <AnimatePresence>
        {showInitialCheckinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !submitting && setShowInitialCheckinModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="relative w-full max-w-sm bg-navy-900 rounded-2xl p-4 pt-5 space-y-3 max-h-[min(85dvh,32rem)] overflow-y-auto border border-brand-500/20 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => !submitting && setShowInitialCheckinModal(false)}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 text-white/60 hover:text-white hover:bg-white/15 transition-colors z-10"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="text-center pr-8">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Anchor className="w-5 h-5 text-brand-400" />
                  <h2 className="text-lg font-display font-bold leading-tight">{day1Meta.label}</h2>
                </div>
                <p className="text-xs text-white/50 leading-snug">{day1Meta.tagline}</p>
                <p className="text-[11px] text-brand-400/85 mt-1.5 leading-snug">
                  Weight, body fat %, and a before photo — same as milestone check-ins.
                </p>
              </div>

              <div>
                {milestonePreview ? (
                  <div className="relative w-28 aspect-[3/4] mx-auto rounded-lg overflow-hidden bg-white/5 mb-2 ring-1 ring-white/10">
                    <img src={milestonePreview} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={clearMilestoneFile}
                      className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center"
                    >
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                ) : null}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleMilestoneFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl transition-all',
                    'border border-dashed text-xs font-medium active:scale-[0.98]',
                    milestonePreview
                      ? 'bg-green-500/10 border-green-500/30 text-green-400'
                      : 'bg-white/5 border-white/15 text-white/40'
                  )}
                >
                  <Camera className="w-4 h-4" />
                  {milestonePreview ? 'Change Photo' : 'Take Before Photo'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white/40 block mb-1 flex items-center gap-1">
                    <Scale className="w-3 h-3" /> Weight (lbs)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={milestoneWeight}
                    onChange={(e) => setMilestoneWeight(e.target.value)}
                    placeholder="185.0"
                    className="w-full px-2.5 py-2 rounded-lg bg-white/5 border border-white/10
                               text-white text-sm placeholder:text-white/20 focus:outline-none
                               focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/25"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 block mb-1 flex items-center gap-1">
                    <Percent className="w-3 h-3" /> Body Fat %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={milestoneBf}
                    onChange={(e) => setMilestoneBf(e.target.value)}
                    placeholder="18.5"
                    className="w-full px-2.5 py-2 rounded-lg bg-white/5 border border-white/10
                               text-white text-sm placeholder:text-white/20 focus:outline-none
                               focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/25"
                  />
                </div>
              </div>

              {milestoneError && (
                <p className="text-red-400 text-sm text-center">{milestoneError}</p>
              )}

              <button
                type="button"
                onClick={submitInitialCheckin}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                           bg-gradient-to-r from-brand-600 to-cyan-600 text-white
                           font-display font-bold text-sm shadow-lg shadow-brand-500/25
                           active:scale-[0.98] disabled:opacity-50 transition-all"
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
                {submitting ? 'Submitting...' : 'Submit initial check-in'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ChallengeCompleteCelebration
        open={showChallengeComplete}
        onClose={() => setShowChallengeComplete(false)}
        displayName={profile?.display_name}
      />
    </div>
  )
}
