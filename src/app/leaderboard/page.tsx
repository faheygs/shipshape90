'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSupabaseRealtimeRefresh } from '@/lib/use-supabase-realtime-refresh'
import { motion } from 'framer-motion'
import { Crown, Trophy, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BASE_PRIZE_POOL_DOLLARS, LEADERBOARD_POLL_INTERVAL_MS } from '@/lib/constants'
import { syncPenaltyPotFromLogs } from '@/lib/sync-penalty-pot'
import { backfillMissingDailyLogs } from '@/lib/auto-submit-yesterday'

interface LeaderboardEntry {
  user_id: string
  display_name: string
  avatar_emoji: string
  rank: number
}

const RANK_STYLES: Record<number, string> = {
  1: 'from-yellow-500/20 to-amber-600/10 border-yellow-500/40',
  2: 'from-gray-300/10 to-gray-400/5 border-gray-400/30',
  3: 'from-orange-700/15 to-orange-800/5 border-orange-700/30',
  4: 'from-white/5 to-white/0 border-white/10',
}

const RANK_BADGES: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' }

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = useCallback(async () => {
    await backfillMissingDailyLogs(supabase)
    await syncPenaltyPotFromLogs(supabase)
    await supabase.rpc('sync_user_badges')

    const { data: boardData, error: boardError } = await supabase.rpc('get_leaderboard')
    if (boardError) {
      console.error(boardError)
    }

    if (boardData) {
      const mapped = boardData.map((row: Record<string, unknown>) => ({
        ...row,
        rank: Number(row.rank),
      })) as LeaderboardEntry[]
      setEntries(mapped)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  /** RLS limits realtime to rows you can SELECT; all users can read profiles + penalty_pot. Own daily_logs too. Others' logs need polling. */
  useSupabaseRealtimeRefresh(supabase, load, ['daily_logs', 'profiles', 'penalty_pot'])

  useEffect(() => {
    const t = setInterval(load, LEADERBOARD_POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [load])

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
        <h1 className="text-2xl font-display font-bold">Leaderboard</h1>
        <p className="text-white/40 text-sm mt-0.5">Current rankings.</p>
      </motion.div>

      {/* Prize Pot */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="glass-card-bright p-5 text-center relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 to-yellow-500/5" />
        <div className="relative">
          <Trophy className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
          <p className="text-3xl font-display font-bold text-gradient">
            ${BASE_PRIZE_POOL_DOLLARS}
          </p>
          <p className="text-white/40 text-sm mt-1">Prize pot</p>
          <p className="text-[11px] text-white/25 mt-1">
            Winner takes all on Day 90.
          </p>
        </div>
      </motion.div>

      {/* Rankings */}
      <div className="space-y-3">
        {entries.map((entry, i) => (
          <motion.div
            key={entry.user_id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.08 }}
            className={cn(
              'flex items-center gap-4 p-4 rounded-xl border bg-gradient-to-r',
              RANK_STYLES[entry.rank] || RANK_STYLES[4]
            )}
          >
            {/* Rank */}
            <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center relative">
              {entry.rank === 1 ? (
                <motion.div
                  animate={{ rotate: [0, -5, 5, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Crown className="w-7 h-7 text-yellow-400" fill="currentColor" />
                </motion.div>
              ) : (
                <span className="text-xl font-display font-bold text-white/50">{entry.rank}</span>
              )}
            </div>

            {/* Avatar + Name */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-display font-bold text-white',
                  entry.avatar_emoji?.startsWith('bg-') ? entry.avatar_emoji : 'bg-brand-500'
                )}>
                  {entry.display_name?.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <span className="font-display font-semibold text-white truncate">
                  {entry.display_name}
                </span>
              </div>
              <span className="text-[11px] text-white/30 ml-10">{RANK_BADGES[entry.rank] || ''}</span>
            </div>
          </motion.div>
        ))}

        {entries.length === 0 && (
          <div className="glass-card p-8 text-center">
            <p className="text-white/40">No competitors yet. The race begins March 30.</p>
          </div>
        )}
      </div>
    </div>
  )
}
