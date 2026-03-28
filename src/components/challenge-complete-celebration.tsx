'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendChart } from '@/components/trend-chart'
import {
  formatDayLabel,
  getChallengeDayNumberForDateString,
  TOTAL_DAYS,
  MAX_TOTAL_POINTS,
  STREAK_BONUS_DAYS,
  STREAK_BONUS_POINTS,
  BADGE_COLLECTOR_BONUS_POINTS,
} from '@/lib/constants'
import { isPhotoUrl, cn } from '@/lib/utils'
import { Trophy, Ship, Sparkles, X, Loader2, TrendingDown, TrendingUp, Minus } from 'lucide-react'

interface ChallengeCompleteCelebrationProps {
  open: boolean
  onClose: () => void
  /** If omitted, loads from profiles */
  displayName?: string | null
}

export function ChallengeCompleteCelebration({
  open,
  onClose,
  displayName: displayNameProp,
}: ChallengeCompleteCelebrationProps) {
  const [loading, setLoading] = useState(true)
  const [bodyStats, setBodyStats] = useState<any[]>([])
  const [checkIns, setCheckIns] = useState<any[]>([])
  const [myPoints, setMyPoints] = useState<any>(null)
  const [displayName, setDisplayName] = useState<string | null>(displayNameProp ?? null)
  const supabase = createClient()

  useEffect(() => {
    if (displayNameProp) setDisplayName(displayNameProp)
  }, [displayNameProp])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) {
        setLoading(false)
        return
      }

      const [statsRes, ciRes, ptsRes, profileRes] = await Promise.all([
        supabase.from('body_stats').select('*').eq('user_id', user.id).order('recorded_date', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from('check_ins').select('*').eq('user_id', user.id).order('day_number'),
        supabase.rpc('get_my_points'),
        supabase.from('profiles').select('display_name').eq('id', user.id).single(),
      ])

      if (cancelled) return

      if (statsRes.data) {
        const sorted = [...statsRes.data].sort((a, b) => {
          const dateCompare = a.recorded_date.localeCompare(b.recorded_date)
          if (dateCompare !== 0) return dateCompare
          return (a.created_at || '').localeCompare(b.created_at || '')
        })
        setBodyStats(sorted)
      }
      if (ciRes.data) setCheckIns(ciRes.data)
      if (ptsRes.data?.[0]) setMyPoints(ptsRes.data[0])
      if (profileRes.data?.display_name) setDisplayName(profileRes.data.display_name)

      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [open, supabase])

  const dedupedStats = useMemo(() => {
    return bodyStats.reduce<any[]>((acc, stat) => {
      const existing = acc.findIndex(s => s.recorded_date === stat.recorded_date)
      if (existing >= 0) acc[existing] = stat
      else acc.push(stat)
      return acc
    }, [])
  }, [bodyStats])

  const galleryPhotos = useMemo(() => {
    const fromCheckins = checkIns
      .filter(c => c.photo_url && isPhotoUrl(c.photo_url))
      .map(c => ({
        url: String(c.photo_url).trim(),
        label: formatDayLabel(c.day_number),
        order: c.day_number as number,
      }))
    const fromBody = dedupedStats
      .filter(s => isPhotoUrl(s.notes))
      .map(s => ({
        url: String(s.notes).trim(),
        label: formatDayLabel(getChallengeDayNumberForDateString(s.recorded_date)),
        order: getChallengeDayNumberForDateString(s.recorded_date),
      }))
    const merged = [...fromCheckins, ...fromBody]
    return merged
      .filter((p, i, arr) => arr.findIndex(x => x.url === p.url) === i)
      .sort((a, b) => (a.order !== b.order ? a.order - b.order : String(a.label).localeCompare(String(b.label))))
  }, [checkIns, dedupedStats])

  const firstStat = dedupedStats.length > 0 ? dedupedStats[0] : null
  const latestStat = dedupedStats.length > 0 ? dedupedStats[dedupedStats.length - 1] : null

  const weightDelta =
    firstStat?.weight != null && latestStat?.weight != null
      ? Number(latestStat.weight) - Number(firstStat.weight)
      : null
  const bfDelta =
    firstStat?.body_fat != null && latestStat?.body_fat != null
      ? Number(latestStat.body_fat) - Number(firstStat.body_fat)
      : null

  const weightChartData = dedupedStats
    .filter(s => s.weight != null && s.weight !== '')
    .map(s => ({ date: s.recorded_date, value: Number(s.weight) }))

  const bfChartData = dedupedStats
    .filter(s => s.body_fat != null && s.body_fat !== '')
    .map(s => ({ date: s.recorded_date, value: Number(s.body_fat) }))

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex flex-col bg-navy-950/98 backdrop-blur-xl"
        >
          <div className="flex-1 overflow-y-auto overscroll-contain pb-24 safe-bottom">
            <div className="max-w-md mx-auto px-4 pt-4 pb-3">
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-full bg-white/10 text-white/60 hover:text-white active:scale-95"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
                  <p className="text-xs text-white/40">Loading your journey...</p>
                </div>
              ) : (
                <>
                  {/* Hero */}
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-5"
                  >
                    <motion.div
                      animate={{ rotate: [0, -6, 6, 0] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                      className="inline-flex items-center justify-center w-14 h-14 rounded-xl gradient-brand mb-3 shadow-lg shadow-brand-500/30"
                    >
                      <Trophy className="w-7 h-7 text-white" />
                    </motion.div>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Sparkles className="w-5 h-5 text-yellow-400" />
                      <span className="text-sm font-display font-semibold text-yellow-400/90 tracking-wide">
                        90 days complete
                      </span>
                      <Sparkles className="w-5 h-5 text-yellow-400" />
                    </div>
                    <h2 className="text-xl font-display font-bold text-gradient leading-tight px-1">
                      Hey {displayName || 'champion'} — you did it!
                    </h2>
                    <p className="text-white/50 text-xs mt-2 max-w-sm mx-auto leading-relaxed">
                      You crossed the finish line of ShipShape90. Here&apos;s what you accomplished — your photos,
                      your numbers, and the full picture of your transformation.
                    </p>
                  </motion.div>

                  {/* Challenge stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                    <div className="glass-card p-3 text-center">
                      <p className="text-xl font-display font-bold text-brand-400">
                        {myPoints?.total_points ?? 0}
                      </p>
                      <p className="text-[11px] text-white/40 mt-0.5 leading-tight">Challenge total</p>
                      <p className="text-[9px] text-white/25 mt-0.5 leading-tight">
                        Daily + streak + badge bonus · up to {MAX_TOTAL_POINTS}.
                      </p>
                    </div>
                    <div className="glass-card p-3 text-center">
                      <p className="text-xl font-display font-bold text-amber-400/90">
                        +{myPoints?.streak_bonus ?? 0}
                      </p>
                      <p className="text-[11px] text-white/40 mt-0.5 leading-tight">Streak bonus</p>
                      <p className="text-[9px] text-white/25 mt-0.5 leading-tight">
                        +{STREAK_BONUS_POINTS} per {STREAK_BONUS_DAYS} perfect days in a row
                      </p>
                    </div>
                    <div className="glass-card p-3 text-center">
                      <p className="text-xl font-display font-bold text-green-400">
                        {myPoints?.perfect_days ?? 0}
                      </p>
                      <p className="text-[11px] text-white/40 mt-0.5">Perfect days</p>
                    </div>
                    <div className="glass-card p-3 text-center">
                      <p className="text-xl font-display font-bold text-violet-400/95">
                        +{myPoints?.badge_collector_bonus ?? 0}
                      </p>
                      <p className="text-[11px] text-white/40 mt-0.5 leading-tight">Badge bonus</p>
                      <p className="text-[9px] text-white/25 mt-0.5 leading-tight">
                        +{BADGE_COLLECTOR_BONUS_POINTS} if you earned every badge
                      </p>
                    </div>
                  </div>

                  {/* Delta summary */}
                  {(weightDelta != null || bfDelta != null) && (
                    <div className="glass-card-bright p-3 mb-4 border-brand-500/20">
                      <h3 className="font-display font-semibold text-xs text-center mb-2 text-white/80">
                        From start to finish
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        {weightDelta != null && (
                          <div className="text-center">
                            <p className="text-xs text-white/40 mb-1">Weight</p>
                            <p className="text-lg font-display font-bold">
                              {firstStat?.weight} → {latestStat?.weight}{' '}
                              <span className="text-white/40 text-sm">lbs</span>
                            </p>
                            <div className="flex items-center justify-center gap-1 mt-1">
                              {weightDelta < 0 ? (
                                <TrendingDown className="w-3.5 h-3.5 text-green-400" />
                              ) : weightDelta > 0 ? (
                                <TrendingUp className="w-3.5 h-3.5 text-red-400" />
                              ) : (
                                <Minus className="w-3.5 h-3.5 text-white/30" />
                              )}
                              <span
                                className={cn(
                                  'text-sm font-semibold',
                                  weightDelta < 0 ? 'text-green-400' : weightDelta > 0 ? 'text-red-400' : 'text-white/30'
                                )}
                              >
                                {weightDelta > 0 ? '+' : ''}
                                {weightDelta.toFixed(1)} lbs
                              </span>
                            </div>
                          </div>
                        )}
                        {bfDelta != null && (
                          <div className="text-center">
                            <p className="text-xs text-white/40 mb-1">Body fat</p>
                            <p className="text-lg font-display font-bold">
                              {firstStat?.body_fat}% → {latestStat?.body_fat}%
                            </p>
                            <div className="flex items-center justify-center gap-1 mt-1">
                              {bfDelta < 0 ? (
                                <TrendingDown className="w-3.5 h-3.5 text-green-400" />
                              ) : bfDelta > 0 ? (
                                <TrendingUp className="w-3.5 h-3.5 text-red-400" />
                              ) : (
                                <Minus className="w-3.5 h-3.5 text-white/30" />
                              )}
                              <span
                                className={cn(
                                  'text-sm font-semibold',
                                  bfDelta < 0 ? 'text-green-400' : bfDelta > 0 ? 'text-red-400' : 'text-white/30'
                                )}
                              >
                                {bfDelta > 0 ? '+' : ''}
                                {bfDelta.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Photos */}
                  <div className="mb-4">
                    <h3 className="font-display font-semibold text-xs text-white/70 mb-2 flex items-center gap-2">
                      <Ship className="w-3.5 h-3.5 text-brand-400" />
                      Your progress photos
                    </h3>
                    {galleryPhotos.length === 0 ? (
                      <p className="text-xs text-white/30 text-center py-4 glass-card">
                        Photos from your check-ins will appear here.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                        {galleryPhotos.map((photo, i) => (
                          <div
                            key={`${photo.url}-${i}`}
                            className="relative rounded-lg overflow-hidden bg-white/5 aspect-[3/4] max-h-36"
                          >
                            <img
                              src={photo.url}
                              alt={photo.label}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1 py-1 pt-4">
                              <span className="text-[9px] text-white font-medium block truncate leading-tight">
                                {photo.label}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Trends */}
                  {weightChartData.length > 1 && (
                    <div className="glass-card p-3 mb-3">
                      <h3 className="font-display font-semibold text-xs text-white/70 mb-1.5">Weight trend</h3>
                      <TrendChart data={weightChartData} unit="lbs" color="#f97316" decimals={1} />
                    </div>
                  )}
                  {weightChartData.length === 1 && latestStat?.weight != null && (
                    <div className="glass-card p-3 mb-3 text-center text-xs text-white/50">
                      Log more than one day of weight to see a trend line.
                    </div>
                  )}

                  {bfChartData.length > 1 && (
                    <div className="glass-card p-3 mb-4">
                      <h3 className="font-display font-semibold text-xs text-white/70 mb-1.5">Body fat % trend</h3>
                      <TrendChart data={bfChartData} unit="%" color="#4ade80" decimals={1} />
                    </div>
                  )}
                  {bfChartData.length === 1 && latestStat?.body_fat != null && (
                    <div className="glass-card p-3 mb-4 text-center text-xs text-white/50">
                      Log more than one day of body fat to see a trend line.
                    </div>
                  )}

                  <div className="text-center py-2">
                    <p className="text-white/35 text-[11px]">
                      {TOTAL_DAYS} days. You showed up. That&apos;s the win.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sticky CTA */}
          {!loading && (
            <div
              className="fixed bottom-0 left-0 right-0 p-3 max-w-md mx-auto bg-gradient-to-t from-navy-950 via-navy-950 to-transparent pt-6"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              <button
                type="button"
                onClick={onClose}
                className="btn-primary w-full py-3 font-display font-bold text-sm"
              >
                Continue
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
