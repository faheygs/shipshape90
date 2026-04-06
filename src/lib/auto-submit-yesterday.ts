import type { SupabaseClient } from '@supabase/supabase-js'
import { CHALLENGE_START, CHALLENGE_END } from '@/lib/constants'
import { syncPenaltyPotFromLogs } from '@/lib/sync-penalty-pot'

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Calendar day before `todayYmd` in the user's local timezone. */
export function getPreviousLocalYmd(todayYmd: string): string {
  const [y, m, d] = todayYmd.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  return toYmd(dt)
}

function challengeBoundsYmd() {
  return { start: toYmd(CHALLENGE_START), end: toYmd(CHALLENGE_END) }
}

/**
 * Any calendar day before "today" is closed. In-progress (unsubmitted) logs for those
 * days are auto-submitted so scoring and prize-pot penalties match whatever was checked
 * (unchecked = missed tasks). Runs on each load so returning after days offline still finalizes.
 */
export async function autoSubmitStalePastDays(
  supabase: SupabaseClient,
  userId: string,
  todayYmd: string,
): Promise<boolean> {
  const { start, end } = challengeBoundsYmd()
  if (todayYmd <= start) return false

  const { data: rows, error: qErr } = await supabase
    .from('daily_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('submitted', false)
    .gte('log_date', start)
    .lte('log_date', end)
    .lt('log_date', todayYmd)

  if (qErr || !rows?.length) return false

  let ok = false
  for (const row of rows) {
    const { error } = await supabase.from('daily_logs').update({ submitted: true }).eq('id', row.id)
    if (error) console.warn('[autoSubmitStalePastDays]', error.message)
    else ok = true
  }

  if (ok) await syncPenaltyPotFromLogs(supabase)
  return ok
}
