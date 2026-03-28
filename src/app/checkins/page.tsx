'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Camera, Scale, Loader2, X, ChevronDown, ChevronUp,
  Star, TrendingDown, TrendingUp, Minus, Pencil, Lock,
} from 'lucide-react'
import { TrendChart } from '@/components/trend-chart'
import { cn, formatDate, getLocalDateString, isPhotoUrl } from '@/lib/utils'
import {
  CHECKIN_DAYS,
  CHALLENGE_START,
  formatDayLabel,
  getChallengeDayNumberForDateString,
  getChallengeDayCalendarOnly,
} from '@/lib/constants'
import { useChallengeDay, useEffectiveLogDate } from '@/lib/use-challenge-day'
import { useSupabaseRealtimeRefresh } from '@/lib/use-supabase-realtime-refresh'
import { ChallengeCompleteCelebration } from '@/components/challenge-complete-celebration'
import confetti from 'canvas-confetti'

export default function CheckInsPage() {
  const [user, setUser] = useState<any>(null)
  const [checkIns, setCheckIns] = useState<any[]>([])
  const [bodyStats, setBodyStats] = useState<any[]>([])
  const [todayStat, setTodayStat] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [trendTab, setTrendTab] = useState<'weight' | 'bf'>('weight')
  const [editing, setEditing] = useState(false)
  const [showChallengeComplete, setShowChallengeComplete] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const challengeDay = useChallengeDay()
  const today = useEffectiveLogDate()
  /** Real calendar challenge day — dev sim must not mark future milestones as "reached" here */
  const calendarChallengeDay = getChallengeDayCalendarOnly()

  const isMilestoneDay = CHECKIN_DAYS.some(c => c.day === challengeDay)
  const currentMilestone = CHECKIN_DAYS.find(c => c.day === challengeDay)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUser(user)

    const [checkInsRes, statsRes] = await Promise.all([
      supabase.from('check_ins').select('*').eq('user_id', user.id).order('day_number'),
      supabase.from('body_stats').select('*').eq('user_id', user.id).order('recorded_date', { ascending: true }).order('created_at', { ascending: true }),
    ])

    if (checkInsRes.data) setCheckIns(checkInsRes.data)
    if (statsRes.data) {
      const sorted = [...statsRes.data].sort((a, b) => {
        const dateCompare = a.recorded_date.localeCompare(b.recorded_date)
        if (dateCompare !== 0) return dateCompare
        return (a.created_at || '').localeCompare(b.created_at || '')
      })
      setBodyStats(sorted)

      const todayEntry = sorted.find(s => s.recorded_date === today)
      setTodayStat(todayEntry || null)

      if (todayEntry) {
        setWeight(todayEntry.weight?.toString() || '')
        setBodyFat(todayEntry.body_fat?.toString() || '')
        setNotes(todayEntry.notes && !isPhotoUrl(todayEntry.notes) ? todayEntry.notes : '')
      }
    }
    setLoading(false)
  }, [supabase, today])

  useEffect(() => {
    loadData()
  }, [loadData])

  useSupabaseRealtimeRefresh(supabase, loadData, ['check_ins', 'body_stats'])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  function clearFile() {
    setSelectedFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadPhoto(): Promise<string | null> {
    if (!selectedFile || !user) return null
    setUploading(true)

    const ext = selectedFile.name.split('.').pop()
    const filePath = `${user.id}/${today}-${Date.now()}.${ext}`

    const { error } = await supabase.storage
      .from('checkin-photos')
      .upload(filePath, selectedFile, { upsert: true })

    setUploading(false)

    if (error) {
      console.error('Upload error:', error)
      setError(`Photo upload failed: ${error.message}`)
      return null
    }

    const { data: urlData } = supabase.storage
      .from('checkin-photos')
      .getPublicUrl(filePath)

    return urlData.publicUrl
  }

  async function saveEntry() {
    if (!user) return
    if (challengeDay < 1) return
    if (!weight && !bodyFat && !selectedFile && !notes) {
      setError('Enter at least one value')
      return
    }
    setSaving(true)
    setError('')

    let photoUrl: string | null = null
    if (selectedFile) {
      photoUrl = await uploadPhoto()
      if (!photoUrl && selectedFile) {
        setSaving(false)
        return
      }
    }

    // Build the upsert payload — always include all fields
    const payload: any = {
      user_id: user.id,
      recorded_date: today,
      weight: weight ? parseFloat(weight) : (todayStat?.weight || null),
      body_fat: bodyFat ? parseFloat(bodyFat) : (todayStat?.body_fat || null),
    }

    // For notes: prefer photo URL if we just uploaded, otherwise keep existing or use new notes
    if (photoUrl) {
      payload.notes = photoUrl
    } else if (notes) {
      payload.notes = notes
    } else if (todayStat?.notes) {
      payload.notes = todayStat.notes
    } else {
      payload.notes = null
    }

    const { error: statsError } = await supabase.from('body_stats').upsert(
      payload,
      { onConflict: 'user_id,recorded_date' }
    )

    if (statsError) {
      console.error('Body stats error:', statsError)
      setError(`Failed to save: ${statsError.message}`)
      setSaving(false)
      return
    }

    // If it's a milestone day, also save to check_ins
    if (isMilestoneDay && currentMilestone) {
      const checkinPayload: any = {
        user_id: user.id,
        day_number: currentMilestone.day,
        weight: payload.weight,
        body_fat: payload.body_fat,
        notes: currentMilestone.label,
      }
      if (photoUrl) checkinPayload.photo_url = photoUrl

      const existing = checkIns.find(c => c.day_number === currentMilestone.day)
      if (existing) {
        await supabase.from('check_ins').update(checkinPayload).eq('id', existing.id)
      } else {
        await supabase.from('check_ins').insert(checkinPayload)
      }
    }

    clearFile()
    setEditing(false)
    setSaving(false)
    await loadData()

    if (isMilestoneDay && currentMilestone?.day === 90) {
      confetti({
        particleCount: 180,
        spread: 95,
        origin: { y: 0.5 },
        zIndex: 10001,
        colors: ['#f97316', '#eab308', '#22c55e', '#38bdf8'],
      })
      setShowChallengeComplete(true)
    }
  }

  function startEditing() {
    if (challengeDay < 1) return
    if (todayStat) {
      setWeight(todayStat.weight?.toString() || '')
      setBodyFat(todayStat.body_fat?.toString() || '')
      setNotes(todayStat.notes && !isPhotoUrl(todayStat.notes) ? todayStat.notes : '')
    }
    setEditing(true)
  }

  // Deduplicate: keep only the latest entry per date
  const dedupedStats = bodyStats.reduce<any[]>((acc, stat) => {
    const existing = acc.findIndex(s => s.recorded_date === stat.recorded_date)
    if (existing >= 0) {
      acc[existing] = stat
    } else {
      acc.push(stat)
    }
    return acc
  }, [])

  const galleryPhotos = useMemo(() => {
    const fromCheckins = checkIns
      .filter(c => c.photo_url && isPhotoUrl(c.photo_url))
      .map(c => ({
        url: String(c.photo_url).trim(),
        label: formatDayLabel(c.day_number),
        isMilestone: true as const,
      }))
    const fromBody = dedupedStats
      .filter(s => isPhotoUrl(s.notes))
      .map(s => ({
        url: String(s.notes).trim(),
        label: formatDayLabel(getChallengeDayNumberForDateString(s.recorded_date)),
        isMilestone: false as const,
      }))
    const merged = [...fromCheckins, ...fromBody]
    return merged.filter((p, i, arr) => arr.findIndex(x => x.url === p.url) === i)
  }, [checkIns, dedupedStats])

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    )
  }

  const firstStat = dedupedStats.length > 0 ? dedupedStats[0] : null
  const latestStat = dedupedStats.length > 0 ? dedupedStats[dedupedStats.length - 1] : null
  const weightChange = latestStat?.weight && firstStat?.weight && dedupedStats.length > 1
    ? (Number(latestStat.weight) - Number(firstStat.weight)).toFixed(1)
    : null
  const bfChange = latestStat?.body_fat && firstStat?.body_fat && dedupedStats.length > 1
    ? (Number(latestStat.body_fat) - Number(firstStat.body_fat)).toFixed(1)
    : null

  const wantsForm = !todayStat || editing
  const preChallenge = challengeDay < 1

  return (
    <div className="pb-4 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-display font-bold">Body Log</h1>
        <p className="text-white/40 text-sm mt-0.5">Track your transformation. Only you can see this.</p>
      </motion.div>

      {/* Milestone Banner */}
      {isMilestoneDay && currentMilestone && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card-bright p-4 border-brand-500/30 bg-brand-500/5"
        >
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-5 h-5 text-yellow-400" fill="currentColor" />
            <span className="font-display font-bold text-brand-400">Milestone Day!</span>
          </div>
          <p className="text-sm text-white/60">{currentMilestone.label} — {currentMilestone.tagline}</p>
          <p className="text-xs text-yellow-400/70 mt-1">Photo, weight & BF% required today.</p>
        </motion.div>
      )}

      {/* Progress Photos — always visible; tap to enlarge */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass-card p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <Camera className="w-5 h-5 text-brand-400" />
          <h3 className="font-display font-semibold">Progress Photos</h3>
          {galleryPhotos.length > 0 && (
            <span className="text-xs text-white/30 ml-auto">{galleryPhotos.length}</span>
          )}
        </div>
        {galleryPhotos.length === 0 ? (
          <p className="text-sm text-white/35 text-center py-6">
            No photos yet. Add a progress photo when you log weight / body fat — they show up here and in trends.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {galleryPhotos.map((photo, i) => (
              <button
                key={`${photo.url}-${i}`}
                type="button"
                onClick={() => setLightboxUrl(photo.url)}
                className="relative aspect-[3/4] max-h-32 rounded-lg overflow-hidden bg-white/5 group text-left ring-1 ring-white/5"
              >
                <img
                  src={photo.url}
                  alt={photo.label}
                  className="w-full h-full object-cover group-active:scale-105 transition-transform"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 py-1 pt-5">
                  <span className="text-[9px] text-white/90 font-medium block truncate leading-tight">
                    {photo.label}
                  </span>
                </div>
                {photo.isMilestone && (
                  <Star className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-yellow-400 drop-shadow-md" fill="currentColor" />
                )}
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* Quick Stats */}
      {latestStat && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-display font-bold">{latestStat.weight ?? '—'}</p>
            <p className="text-[11px] text-white/40">Weight (lbs)</p>
            {weightChange && (
              <div className="flex items-center justify-center gap-1 mt-1">
                {Number(weightChange) < 0 ? (
                  <TrendingDown className="w-3 h-3 text-green-400" />
                ) : Number(weightChange) > 0 ? (
                  <TrendingUp className="w-3 h-3 text-red-400" />
                ) : (
                  <Minus className="w-3 h-3 text-white/30" />
                )}
                <span className={cn('text-xs font-medium',
                  Number(weightChange) < 0 ? 'text-green-400' : Number(weightChange) > 0 ? 'text-red-400' : 'text-white/30'
                )}>
                  {Number(weightChange) > 0 ? '+' : ''}{weightChange}
                </span>
              </div>
            )}
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-display font-bold">{latestStat.body_fat ?? '—'}%</p>
            <p className="text-[11px] text-white/40">Body Fat</p>
            {bfChange && (
              <div className="flex items-center justify-center gap-1 mt-1">
                {Number(bfChange) < 0 ? (
                  <TrendingDown className="w-3 h-3 text-green-400" />
                ) : Number(bfChange) > 0 ? (
                  <TrendingUp className="w-3 h-3 text-red-400" />
                ) : (
                  <Minus className="w-3 h-3 text-white/30" />
                )}
                <span className={cn('text-xs font-medium',
                  Number(bfChange) < 0 ? 'text-green-400' : Number(bfChange) > 0 ? 'text-red-400' : 'text-white/30'
                )}>
                  {Number(bfChange) > 0 ? '+' : ''}{bfChange}%
                </span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Trends */}
      {dedupedStats.length > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-4"
        >
          <div className="flex gap-1 mb-4 bg-white/5 rounded-xl p-1">
            <button
              onClick={() => setTrendTab('weight')}
              className={cn(
                'flex-1 py-2 rounded-lg text-sm font-display font-semibold transition-all',
                trendTab === 'weight'
                  ? 'bg-brand-500/20 text-brand-400'
                  : 'text-white/40'
              )}
            >
              Weight
            </button>
            <button
              onClick={() => setTrendTab('bf')}
              className={cn(
                'flex-1 py-2 rounded-lg text-sm font-display font-semibold transition-all',
                trendTab === 'bf'
                  ? 'bg-green-500/20 text-green-400'
                  : 'text-white/40'
              )}
            >
              Body Fat %
            </button>
          </div>

          {trendTab === 'weight' ? (
            <TrendChart
              data={dedupedStats
                .filter(s => s.weight)
                .map(s => ({ date: s.recorded_date, value: Number(s.weight) }))}
              unit="lbs"
              color="#f97316"
              decimals={1}
            />
          ) : (
            <TrendChart
              data={dedupedStats
                .filter(s => s.body_fat)
                .map(s => ({ date: s.recorded_date, value: Number(s.body_fat) }))}
              unit="%"
              color="#4ade80"
              decimals={1}
            />
          )}
        </motion.div>
      )}

      {/* Today's Entry Display (when already logged and not editing) */}
      {todayStat && !editing && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold">Today&apos;s Entry</h3>
            {!preChallenge && (
              <button
                onClick={startEditing}
                className="flex items-center gap-1.5 text-brand-400 text-xs font-display font-semibold"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {todayStat.weight && (
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-lg font-display font-bold">{todayStat.weight}</p>
                <p className="text-[11px] text-white/40">lbs</p>
              </div>
            )}
            {todayStat.body_fat && (
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-lg font-display font-bold">{todayStat.body_fat}%</p>
                <p className="text-[11px] text-white/40">Body Fat</p>
              </div>
            )}
          </div>
          {todayStat.notes && isPhotoUrl(todayStat.notes) && (
            <div className="mt-3 max-w-[10rem] mx-auto rounded-lg overflow-hidden aspect-[3/4] bg-white/5 ring-1 ring-white/10">
              <img src={todayStat.notes} alt="Today's photo" className="w-full h-full object-cover" />
            </div>
          )}
          {todayStat.notes && !isPhotoUrl(todayStat.notes) && (
            <p className="text-sm text-white/40 mt-2">{todayStat.notes}</p>
          )}
        </motion.div>
      )}

      {/* Log Today — locked until challenge Day 1 */}
      {wantsForm && preChallenge && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-4 space-y-3 border border-white/10"
        >
          <div className="flex items-center gap-2 mb-1">
            <Lock className="w-5 h-5 text-white/45" />
            <h3 className="font-display font-semibold text-white/90">Log Today</h3>
          </div>
          <p className="text-sm text-white/55 leading-relaxed">
            Body logging unlocks when the challenge starts —{' '}
            <strong className="text-white/80">{formatDate(CHALLENGE_START)}</strong> (Day 1). You can still review photos
            and trends above.
          </p>
          <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-2 opacity-50 pointer-events-none">
            <div className="h-10 rounded-xl bg-white/5 border border-dashed border-white/10 flex items-center justify-center gap-2 text-white/25 text-xs">
              <Camera className="w-4 h-4" /> Add Progress Photo
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-10 rounded-xl bg-white/5 border border-white/10" />
              <div className="h-10 rounded-xl bg-white/5 border border-white/10" />
            </div>
            <div className="h-16 rounded-xl bg-white/5 border border-white/10" />
            <div className="h-11 rounded-xl bg-white/10" />
          </div>
        </motion.div>
      )}

      {/* Log Entry Form (new entry or editing) */}
      {wantsForm && !preChallenge && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold">
              {todayStat ? 'Edit Today\u2019s Entry' : 'Log Today'}
            </h3>
            {editing && (
              <button
                onClick={() => setEditing(false)}
                className="text-xs text-white/40"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Photo upload */}
          <div>
            {previewUrl ? (
              <div className="relative w-28 aspect-[3/4] mx-auto rounded-lg overflow-hidden bg-white/5 mb-2 ring-1 ring-white/10">
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                <button
                  onClick={clearFile}
                  className="absolute top-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl
                         bg-white/5 border border-dashed border-white/15 text-white/40 text-sm
                         active:scale-[0.98] transition-all"
            >
              <Camera className="w-4 h-4" />
              {previewUrl ? 'Change Photo' : 'Add Progress Photo'}
            </button>
          </div>

          {/* Weight + BF */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-white/40 block mb-1">Weight (lbs)</label>
              <input
                type="number"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder={latestStat?.weight?.toString() || '185.0'}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10
                           text-white text-sm placeholder:text-white/20 focus:outline-none
                           focus:border-brand-500/50"
              />
            </div>
            <div>
              <label className="text-[11px] text-white/40 block mb-1">Body Fat %</label>
              <input
                type="number"
                step="0.1"
                value={bodyFat}
                onChange={(e) => setBodyFat(e.target.value)}
                placeholder={latestStat?.body_fat?.toString() || '18.5'}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10
                           text-white text-sm placeholder:text-white/20 focus:outline-none
                           focus:border-brand-500/50"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] text-white/40 block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How are you feeling today?"
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10
                         text-white text-sm placeholder:text-white/20 focus:outline-none
                         focus:border-brand-500/50 resize-none"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={saveEntry}
            disabled={saving || uploading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {(saving || uploading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
            {uploading ? 'Uploading Photo...' : saving ? 'Saving...' : todayStat ? 'Update Entry' : 'Save Entry'}
          </button>
        </motion.div>
      )}

      {/* Milestone Check-in Status */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card p-4"
      >
        <h3 className="font-display font-semibold mb-3">Required Check-Ins</h3>
        <div className="space-y-2">
          {CHECKIN_DAYS.map((checkin) => {
            const existing = checkIns.find(c => c.day_number === checkin.day)
            const isReached = calendarChallengeDay >= checkin.day || checkin.day === 1
            return (
              <div key={checkin.day} className="flex items-center justify-between py-2 px-1">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-display font-bold',
                    existing ? 'bg-green-500/20 text-green-400' :
                    isReached ? 'bg-brand-500/20 text-brand-400' : 'bg-white/5 text-white/20'
                  )}>
                    {existing ? '✓' : checkin.day}
                  </div>
                  <div>
                    <span className={cn('text-sm font-medium', !isReached && 'text-white/30')}>
                      {checkin.label}
                    </span>
                    <span className="text-[11px] text-white/20 block">{checkin.date}</span>
                  </div>
                </div>
                {existing?.weight && (
                  <span className="text-xs text-white/40">{existing.weight} lbs</span>
                )}
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* Photo Lightbox */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightboxUrl(null)}
          >
            <button
              type="button"
              className="absolute top-3 right-3 w-9 h-9 bg-white/10 rounded-full flex items-center justify-center z-10"
              onClick={() => setLightboxUrl(null)}
            >
              <X className="w-4 h-4 text-white" />
            </button>
            <motion.img
              initial={{ scale: 0.96 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.96 }}
              src={lightboxUrl}
              alt="Progress photo"
              className="max-w-[min(100%,22rem)] max-h-[58dvh] w-auto h-auto object-contain rounded-lg"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* History */}
      {bodyStats.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
        >
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between text-sm text-white/40 py-2"
          >
            <span>All Entries ({dedupedStats.length})</span>
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 overflow-hidden"
              >
                {[...dedupedStats].reverse().map((stat) => (
                  <div key={stat.id} className="glass-card p-3 flex items-center justify-between">
                    <span className="text-xs text-white/30">{stat.recorded_date}</span>
                    <div className="flex gap-4 text-sm">
                      {stat.weight && <span className="text-white/60">{stat.weight} lbs</span>}
                      {stat.body_fat && <span className="text-white/40">{stat.body_fat}%</span>}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      <ChallengeCompleteCelebration
        open={showChallengeComplete}
        onClose={() => setShowChallengeComplete(false)}
      />
    </div>
  )
}
