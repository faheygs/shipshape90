'use client'

import { motion } from 'framer-motion'
import { Flame } from 'lucide-react'

interface StreakCounterProps {
  streak: number
  compact?: boolean
}

export function StreakCounter({ streak, compact }: StreakCounterProps) {
  const intensity = Math.min(streak / 7, 1)

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={
        compact
          ? 'inline-flex items-center gap-1'
          : 'flex items-center gap-3 glass-card px-4 py-3'
      }
    >
      <div className="relative">
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            rotate: [-2, 2, -2],
          }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            repeatType: 'reverse',
          }}
          style={{ opacity: streak > 0 ? 0.3 + intensity * 0.7 : 0.2 }}
        >
          <Flame
            className={streak > 0 ? 'text-orange-400' : 'text-white/20'}
            size={compact ? 18 : 28}
            fill={streak > 0 ? 'currentColor' : 'none'}
          />
        </motion.div>
        {streak >= 7 && (
          <motion.div
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-400"
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
      </div>
      <div className={compact ? 'flex items-center gap-1' : ''}>
        <span className={`font-display font-bold ${compact ? 'text-sm' : 'text-xl'} text-white`}>
          {streak}
        </span>
        {!compact && (
          <span className="text-white/40 text-sm">
            day streak {streak >= 7 ? '— BONUS!' : ''}
          </span>
        )}
      </div>
    </motion.div>
  )
}
