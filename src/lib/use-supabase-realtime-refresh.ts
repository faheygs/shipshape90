'use client'

import { useEffect, useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export type RealtimeRefreshOptions = {
  /** When false, no subscription (e.g. logged out). Default true. */
  enabled?: boolean
  /** Coalesce bursts of DB events into one refresh (ms). Default 250. */
  debounceMs?: number
}

/**
 * Subscribes to Supabase Realtime `postgres_changes` for the given public tables
 * and calls `onRefresh` when rows change. Use for live UI without manual refresh.
 *
 * Requires each table to be part of the `supabase_realtime` publication — run
 * `migration-v11-enable-realtime.sql` in the Supabase SQL editor once.
 */
export function useSupabaseRealtimeRefresh(
  supabase: SupabaseClient,
  onRefresh: () => void,
  tables: readonly string[],
  options?: RealtimeRefreshOptions,
) {
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tablesKey = tables.slice().sort().join(',')

  useEffect(() => {
    if (options?.enabled === false) return

    const debounceMs = options?.debounceMs ?? 250

    const schedule = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null
        onRefreshRef.current()
      }, debounceMs)
    }

    const channelName = `ss90-${tablesKey.replace(/[^a-zA-Z0-9_-]/g, '-')}-${Math.random().toString(36).slice(2, 9)}`
    let channel = supabase.channel(channelName)
    for (const table of tables) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        schedule,
      )
    }
    channel.subscribe()

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      void supabase.removeChannel(channel)
    }
  }, [supabase, tablesKey, options?.enabled, options?.debounceMs])
}
