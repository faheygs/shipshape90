'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Award } from 'lucide-react'
import { BADGE_DEFINITIONS } from '@/lib/badges'
import { cn } from '@/lib/utils'

const DISMISS_MS = 4500

type Props = {
  badgeKeys: string[] | null
  onDismiss: () => void
}

export function BadgeEarnedToast({ badgeKeys, onDismiss }: Props) {
  const open = badgeKeys != null && badgeKeys.length > 0

  useEffect(() => {
    if (!open) return
    const t = setTimeout(onDismiss, DISMISS_MS)
    return () => clearTimeout(t)
  }, [open, onDismiss, badgeKeys])

  const keySet = new Set(badgeKeys ?? [])
  const defs = BADGE_DEFINITIONS.filter((b) => keySet.has(b.id))

  return (
    <AnimatePresence>
      {open && defs.length > 0 && (
        <motion.div
          key={(badgeKeys ?? []).join(',')}
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className={cn(
            'fixed left-1/2 z-[100] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2',
            'pointer-events-none',
            'bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]',
          )}
        >
          <div
            className="pointer-events-auto rounded-2xl border border-brand-500/35 bg-navy-900/95 px-4 py-3 shadow-2xl shadow-brand-500/15 backdrop-blur-md"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/20 text-brand-300">
                <Award className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="font-display text-sm font-bold text-white">
                  {defs.length === 1 ? 'Badge earned!' : `${defs.length} badges earned!`}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {defs.map((d) => (
                    <li key={d.id} className="text-[13px] text-brand-200/95">
                      {d.title}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[10px] text-white/35">View all on Profile</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
