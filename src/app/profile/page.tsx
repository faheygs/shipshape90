'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { Plane, Baby, LogOut, Loader2, ChevronRight, AlertTriangle, BookOpen, Trophy, Award, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MAX_TRAVEL_DAYS,
  MAX_TOTAL_POINTS,
  STREAK_BONUS_DAYS,
  STREAK_BONUS_POINTS,
  BADGE_COLLECTOR_BONUS_POINTS,
} from '@/lib/constants'
import { BADGE_DEFINITIONS, HIDDEN_BADGE_DEFINITIONS, PUBLIC_BADGE_DEFINITIONS } from '@/lib/badges'
import { format, parseISO } from 'date-fns'
import { useRouter } from 'next/navigation'
import { useSupabaseRealtimeRefresh } from '@/lib/use-supabase-realtime-refresh'
import Link from 'next/link'

const AVATAR_COLORS = [
  { bg: 'bg-brand-500', label: 'Orange' },
  { bg: 'bg-red-500', label: 'Red' },
  { bg: 'bg-blue-500', label: 'Blue' },
  { bg: 'bg-green-500', label: 'Green' },
  { bg: 'bg-purple-500', label: 'Purple' },
  { bg: 'bg-yellow-500', label: 'Yellow' },
  { bg: 'bg-pink-500', label: 'Pink' },
  { bg: 'bg-cyan-500', label: 'Cyan' },
]

function getInitials(name: string) {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState('')
  const [showBailout, setShowBailout] = useState(false)
  const [myPoints, setMyPoints] = useState<{
    total_points: number
    streak_bonus: number
    perfect_days: number
    total_penalty: number
    badge_collector_bonus: number
  } | null>(null)
  const [userBadges, setUserBadges] = useState<{ badge_key: string; earned_at: string }[]>([])
  const supabase = createClient()
  const router = useRouter()

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUser(user)

    const { data: existingProfile } = await supabase
      .from('profiles').select('*').eq('id', user.id).single()

    if (!existingProfile) {
      const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Competitor'
      await supabase.from('profiles').insert({
        id: user.id,
        display_name: displayName,
      })
    }

    await supabase.rpc('sync_user_badges')

    const [profileRes, ptsRes, badgesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.rpc('get_my_points'),
      supabase.from('user_badges').select('badge_key, earned_at').eq('user_id', user.id).order('earned_at', { ascending: true }),
    ])

    if (badgesRes.data) setUserBadges(badgesRes.data)
    else setUserBadges([])

    if (profileRes.data) {
      setProfile(profileRes.data)
      setNewName(profileRes.data.display_name)
    }
    if (ptsRes.data?.[0]) {
      const r = ptsRes.data[0]
      setMyPoints({
        total_points: Number(r.total_points ?? 0),
        streak_bonus: Number(r.streak_bonus ?? 0),
        perfect_days: Number(r.perfect_days ?? 0),
        total_penalty: Number(r.total_penalty ?? 0),
        badge_collector_bonus: Number(r.badge_collector_bonus ?? 0),
      })
    } else {
      setMyPoints(null)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  useSupabaseRealtimeRefresh(supabase, loadData, ['daily_logs', 'profiles', 'penalty_pot', 'user_badges'])

  async function updateProfile(updates: Record<string, any>) {
    if (!user) return
    await supabase.from('profiles').update(updates).eq('id', user.id)
    setProfile({ ...profile, ...updates })
  }

  async function saveName() {
    if (!newName.trim()) return
    await updateProfile({ display_name: newName.trim() })
    setEditingName(false)
  }

  async function handleBailout() {
    await updateProfile({ pregnant_bailout: true })
    setShowBailout(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    )
  }

  const avatarColor = profile?.avatar_emoji || 'bg-brand-500'
  const initials = getInitials(profile?.display_name || 'U')

  return (
    <div className="pb-4 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-display font-bold">Profile</h1>
      </motion.div>

      {/* Avatar + Name */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-6 text-center"
      >
        {/* Avatar circle */}
        <div className={cn(
          'w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center',
          'text-white font-display font-bold text-2xl shadow-lg',
          AVATAR_COLORS.find(c => c.bg === avatarColor)?.bg || 'bg-brand-500'
        )}>
          {initials}
        </div>

        {/* Color picker */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {AVATAR_COLORS.map(color => (
            <button
              key={color.bg}
              onClick={() => updateProfile({ avatar_emoji: color.bg })}
              className={cn(
                'w-7 h-7 rounded-full transition-all',
                color.bg,
                avatarColor === color.bg
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-navy-950 scale-110'
                  : 'opacity-50 hover:opacity-80'
              )}
            />
          ))}
        </div>

        {/* Name */}
        {editingName ? (
          <div className="flex items-center gap-2 max-w-xs mx-auto">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10
                         text-white text-center focus:outline-none focus:border-brand-500/50"
              autoFocus
            />
            <button onClick={saveName} className="btn-primary text-sm px-4 py-2">Save</button>
          </div>
        ) : (
          <button onClick={() => setEditingName(true)} className="group">
            <h2 className="text-xl font-display font-bold group-hover:text-brand-400 transition-colors">
              {profile?.display_name}
            </h2>
            <p className="text-[11px] text-white/30">Tap to edit name</p>
          </button>
        )}

        <p className="text-xs text-white/20 mt-2">{user?.email}</p>
      </motion.div>

      {/* Challenge points: daily scores + streak bonus (+5 per 7 consecutive perfect non-travel days) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="glass-card p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-5 h-5 text-brand-400" />
          <h3 className="font-display font-semibold">Challenge points</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-2xl font-display font-bold text-brand-400">
              {myPoints?.total_points ?? 0}
            </p>
            <p className="text-[10px] text-white/35 mt-0.5">Total</p>
            <p className="text-[9px] text-white/20 mt-1 leading-tight">Up to {MAX_TOTAL_POINTS} incl. bonuses</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-2xl font-display font-bold text-amber-400/90">
              +{myPoints?.streak_bonus ?? 0}
            </p>
            <p className="text-[10px] text-white/35 mt-0.5">Streak bonus</p>
            <p className="text-[9px] text-white/20 mt-1 leading-tight">{STREAK_BONUS_POINTS} / {STREAK_BONUS_DAYS} perfect days</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-2xl font-display font-bold text-green-400">
              {myPoints?.perfect_days ?? 0}
            </p>
            <p className="text-[10px] text-white/35 mt-0.5">Perfect days</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-2xl font-display font-bold text-violet-400/95">
              +{myPoints?.badge_collector_bonus ?? 0}
            </p>
            <p className="text-[10px] text-white/35 mt-0.5">Badge bonus</p>
            <p className="text-[9px] text-white/20 mt-1 leading-tight">
              +{BADGE_COLLECTOR_BONUS_POINTS} if all {BADGE_DEFINITIONS.length} badges earned
            </p>
          </div>
        </div>
        {myPoints != null && myPoints.total_penalty > 0 && (
          <p className="text-[11px] text-white/30 mt-3 text-center">
            Prize pot contributions: ${Number(myPoints.total_penalty).toFixed(2)}
          </p>
        )}
      </motion.div>

      {/* Badges */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.09 }}
        className="glass-card p-4"
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Award className="w-5 h-5 text-amber-400 shrink-0" />
            <h3 className="font-display font-semibold">Badges</h3>
          </div>
          <span className="text-[11px] text-white/35 tabular-nums shrink-0">
            {BADGE_DEFINITIONS.filter((d) => userBadges.some((b) => b.badge_key === d.id)).length}
            /{BADGE_DEFINITIONS.length}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {PUBLIC_BADGE_DEFINITIONS.map((def) => {
            const earned = userBadges.find((b) => b.badge_key === def.id)
            const Icon = def.icon
            return (
              <div
                key={def.id}
                className={cn(
                  'rounded-xl p-3 text-left border transition-all',
                  earned
                    ? 'bg-white/[0.08] border-brand-500/25'
                    : 'bg-white/[0.03] border-white/5 opacity-55',
                )}
              >
                <div className="flex items-start gap-2">
                  <div
                    className={cn(
                      'shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                      earned ? 'bg-brand-500/20 text-brand-300' : 'bg-white/5 text-white/20',
                    )}
                  >
                    <Icon className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display font-semibold text-sm leading-tight">{def.title}</p>
                    <p className="text-[10px] text-white/40 mt-0.5 leading-snug">{def.description}</p>
                    {earned && (
                      <p className="text-[9px] text-brand-400/80 mt-1.5">
                        {format(parseISO(earned.earned_at), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-[11px] text-white/30 mt-5 mb-2 font-display font-medium tracking-wide">
          Secret badges
        </p>
        <p className="text-[10px] text-white/20 mb-3 leading-snug">
          Hidden until earned — no spoilers.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {HIDDEN_BADGE_DEFINITIONS.map((def) => {
            const earned = userBadges.find((b) => b.badge_key === def.id)
            const secretLocked = def.hidden && !earned
            const Icon = secretLocked ? HelpCircle : def.icon
            const title = secretLocked ? '???' : def.title
            const description = secretLocked
              ? 'Hidden achievement'
              : def.description
            return (
              <div
                key={def.id}
                className={cn(
                  'rounded-xl p-3 text-left border transition-all',
                  earned
                    ? 'bg-violet-500/10 border-violet-500/30'
                    : 'bg-white/[0.02] border-white/[0.06] opacity-50',
                )}
              >
                <div className="flex items-start gap-2">
                  <div
                    className={cn(
                      'shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                      earned
                        ? 'bg-violet-500/20 text-violet-200'
                        : secretLocked
                          ? 'bg-white/[0.06] text-white/25'
                          : 'bg-white/5 text-white/20',
                    )}
                  >
                    <Icon className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display font-semibold text-sm leading-tight">{title}</p>
                    <p className="text-[10px] text-white/40 mt-0.5 leading-snug">{description}</p>
                    {earned && (
                      <p className="text-[9px] text-violet-300/80 mt-1.5">
                        {format(parseISO(earned.earned_at), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* Travel Days */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-4"
      >
        <div className="flex items-center gap-2 mb-2">
          <Plane className="w-5 h-5 text-blue-400" />
          <h3 className="font-display font-semibold">Travel Days</h3>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/50">
            {profile?.travel_days_used ?? 0} of {MAX_TRAVEL_DAYS} used
          </span>
          <div className="flex gap-1">
            {Array.from({ length: MAX_TRAVEL_DAYS }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'w-2 h-6 rounded-sm transition-all',
                  i < (profile?.travel_days_used ?? 0) ? 'bg-blue-400' : 'bg-white/10'
                )}
              />
            ))}
          </div>
        </div>
      </motion.div>

      {/* Rules Link */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Link
          href="/rules"
          className="w-full glass-card p-4 flex items-center gap-3"
        >
          <BookOpen className="w-5 h-5 text-brand-400" />
          <div className="flex-1">
            <span className="font-display font-semibold text-sm">Challenge Rules</span>
            <span className="text-[11px] text-white/30 block">Scoring, tasks, consequences & more</span>
          </div>
          <ChevronRight className="w-4 h-4 text-white/20" />
        </Link>
      </motion.div>

      {/* Pregnancy Bailout */}
      {!profile?.pregnant_bailout && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <button
            onClick={() => setShowBailout(true)}
            className="w-full glass-card p-4 flex items-center gap-3 text-left"
          >
            <Baby className="w-5 h-5 text-pink-400" />
            <div className="flex-1">
              <span className="font-display font-semibold text-sm">Pregnancy Bailout</span>
              <span className="text-[11px] text-white/30 block">Exit the competition. Irreversible.</span>
            </div>
            <ChevronRight className="w-4 h-4 text-white/20" />
          </button>
        </motion.div>
      )}

      {profile?.pregnant_bailout && (
        <div className="glass-card p-4 border-pink-500/30 bg-pink-500/5">
          <p className="text-sm text-pink-300 font-medium">Pregnancy bailout activated. You&apos;ve exited the competition.</p>
        </div>
      )}

      {/* Bailout Modal */}
      <AnimatePresence>
        {showBailout && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-6"
            onClick={() => setShowBailout(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card-bright p-6 max-w-sm w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto" />
              <h3 className="font-display font-bold text-lg text-center">Are you sure?</h3>
              <p className="text-sm text-white/50 text-center">
                This is irreversible. You will forfeit all ability to gain any future reward,
                including winning the prize pot. This is an exit — not a pause.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowBailout(false)} className="btn-secondary flex-1 text-sm">
                  Cancel
                </button>
                <button
                  onClick={handleBailout}
                  className="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white font-display font-semibold text-sm active:scale-95 transition-all"
                >
                  Confirm Bailout
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logout */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
      >
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3 text-red-400/60 text-sm"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </motion.div>
    </div>
  )
}
