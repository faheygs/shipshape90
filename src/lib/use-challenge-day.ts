'use client'

import { useEffect, useState } from 'react'
import {
  getChallengeDay,
  getChallengeDayCalendarOnly,
  getDateStringForChallengeDay,
  SIM_CHALLENGE_DAY_STORAGE_KEY,
  TOTAL_DAYS,
} from '@/lib/constants'
import { getLocalDateString, getMsUntilNextLocalMidnight } from '@/lib/utils'

const CHANGE_EVENT = 'shipshape90-sim-challenge-day'

export function notifyChallengeDaySimChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

/** Set or clear dev-only simulated challenge day for *today* (localStorage). */
export function setSimulatedChallengeDay(day: number | null) {
  if (typeof window === 'undefined') return
  if (day === null) {
    localStorage.removeItem(SIM_CHALLENGE_DAY_STORAGE_KEY)
  } else {
    const n = Math.max(0, Math.min(Math.floor(day), TOTAL_DAYS))
    localStorage.setItem(SIM_CHALLENGE_DAY_STORAGE_KEY, String(n))
  }
  notifyChallengeDaySimChanged()
}

/**
 * Reactive challenge day for calendar “today”, including dev simulation when set.
 * First paint matches SSR (calendar only); after mount, applies sim if present.
 */
export function useChallengeDay(): number {
  const [day, setDay] = useState<number | null>(null)

  useEffect(() => {
    function refresh() {
      setDay(getChallengeDay())
    }
    refresh()

    let midnightTimer: ReturnType<typeof setTimeout>
    const scheduleLocalMidnight = () => {
      clearTimeout(midnightTimer)
      midnightTimer = setTimeout(() => {
        refresh()
        scheduleLocalMidnight()
      }, getMsUntilNextLocalMidnight())
    }
    scheduleLocalMidnight()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const onStorage = (e: StorageEvent) => {
      if (e.key === SIM_CHALLENGE_DAY_STORAGE_KEY || e.key === null) refresh()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(CHANGE_EVENT, refresh)
    return () => {
      clearTimeout(midnightTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(CHANGE_EVENT, refresh)
    }
  }, [])

  return day ?? getChallengeDayCalendarOnly()
}

/** True when dev sim key is set (for UI hints). */
export function useSimulatedChallengeDayActive(): boolean {
  const [active, setActive] = useState(false)

  useEffect(() => {
    function sync() {
      const v = localStorage.getItem(SIM_CHALLENGE_DAY_STORAGE_KEY)
      setActive(v != null && v !== '')
    }
    sync()
    const onStorage = (e: StorageEvent) => {
      if (e.key === SIM_CHALLENGE_DAY_STORAGE_KEY || e.key === null) sync()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(CHANGE_EVENT, sync)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(CHANGE_EVENT, sync)
    }
  }, [])

  return active
}

/**
 * When dev sim is active, daily_logs / body_stats use the calendar date for that simulated
 * challenge day (so milestone flows are not blocked by “real today” already submitted).
 */
export function getEffectiveLogDateString(): string {
  if (typeof window === 'undefined') return getLocalDateString()
  const raw = localStorage.getItem(SIM_CHALLENGE_DAY_STORAGE_KEY)
  if (raw !== null && raw !== '') {
    const n = parseInt(raw, 10)
    if (!Number.isNaN(n)) {
      const clamped = Math.max(1, Math.min(n, TOTAL_DAYS))
      return getDateStringForChallengeDay(clamped)
    }
  }
  return getLocalDateString()
}

export function useEffectiveLogDate(): string {
  const [effective, setEffective] = useState<string | null>(null)

  useEffect(() => {
    function refresh() {
      setEffective(getEffectiveLogDateString())
    }
    refresh()

    let midnightTimer: ReturnType<typeof setTimeout>
    const scheduleLocalMidnight = () => {
      clearTimeout(midnightTimer)
      midnightTimer = setTimeout(() => {
        refresh()
        scheduleLocalMidnight()
      }, getMsUntilNextLocalMidnight())
    }
    scheduleLocalMidnight()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const onStorage = (e: StorageEvent) => {
      if (e.key === SIM_CHALLENGE_DAY_STORAGE_KEY || e.key === null) refresh()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(CHANGE_EVENT, refresh)
    return () => {
      clearTimeout(midnightTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(CHANGE_EVENT, refresh)
    }
  }, [])

  return effective ?? getLocalDateString()
}
