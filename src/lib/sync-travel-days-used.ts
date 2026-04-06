import type { SupabaseClient } from '@supabase/supabase-js'
import { CHALLENGE_END, CHALLENGE_START, MAX_TRAVEL_DAYS } from '@/lib/constants'

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const START_YMD = toYmd(CHALLENGE_START)
const END_YMD = toYmd(CHALLENGE_END)

/**
 * Recompute `profiles.travel_days_used` from `daily_logs` (honor-system / retroactive edits).
 * Counts rows in the challenge window with `is_travel_day = true`, capped at MAX_TRAVEL_DAYS.
 */
export async function syncTravelDaysUsedFromLogs(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('log_date')
    .eq('user_id', userId)
    .eq('is_travel_day', true)

  if (error) throw error

  const n = (data || []).filter((row) => {
    const d = typeof row.log_date === 'string' ? row.log_date.slice(0, 10) : String(row.log_date ?? '').slice(0, 10)
    return d >= START_YMD && d <= END_YMD
  }).length

  const capped = Math.min(MAX_TRAVEL_DAYS, n)
  await supabase.from('profiles').update({ travel_days_used: capped }).eq('id', userId)
}
