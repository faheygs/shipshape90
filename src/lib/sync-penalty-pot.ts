import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Calls `resync_penalty_pot_from_daily_logs`: deletes orphan pot rows, then recomputes
 * every submitted day (missed tasks × $1). Matches DB trigger logic; use after client
 * writes when you need the UI to reflect penalties immediately.
 */
export async function syncPenaltyPotFromLogs(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc('resync_penalty_pot_from_daily_logs')
  if (error) {
    console.warn('[syncPenaltyPotFromLogs]', error.message)
  }
}
