import type { SupabaseClient } from '@supabase/supabase-js'
import { isChallengeActiveForBadges } from '@/lib/constants'

export async function fetchUserBadgeKeys(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_badges')
    .select('badge_key')
    .eq('user_id', userId)
  if (error || !data) return []
  return data.map((r) => r.badge_key)
}

type SyncOptions = {
  /** Skip first SELECT; use after an upsert so new rows (e.g. from DB trigger) still show as "new" in the diff. */
  beforeKeys?: string[]
}

/**
 * Runs DB sync then returns badge keys that were newly granted (diff before/after).
 * Used for toast notifications. RPC errors return empty new keys + error message.
 */
export async function syncUserBadgesAndDiff(
  supabase: SupabaseClient,
  userId: string,
  options?: SyncOptions,
): Promise<{ newBadgeKeys: string[]; error: string | null }> {
  if (!isChallengeActiveForBadges()) {
    return { newBadgeKeys: [], error: null }
  }

  let before: Set<string>
  if (options?.beforeKeys) {
    before = new Set(options.beforeKeys)
  } else {
    const { data: beforeRows, error: beforeErr } = await supabase
      .from('user_badges')
      .select('badge_key')
      .eq('user_id', userId)

    if (beforeErr) {
      return { newBadgeKeys: [], error: beforeErr.message }
    }
    before = new Set((beforeRows ?? []).map((r) => r.badge_key))
  }

  const { error: rpcError } = await supabase.rpc('sync_user_badges')
  if (rpcError) {
    return { newBadgeKeys: [], error: rpcError.message }
  }

  const { data: afterRows, error: afterErr } = await supabase
    .from('user_badges')
    .select('badge_key')
    .eq('user_id', userId)

  if (afterErr) {
    return { newBadgeKeys: [], error: afterErr.message }
  }

  const after = new Set((afterRows ?? []).map((r) => r.badge_key))
  const newBadgeKeys: string[] = []
  for (const k of after) {
    if (!before.has(k)) newBadgeKeys.push(k)
  }

  return { newBadgeKeys, error: null }
}
