'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Trophy, CalendarDays, Scale, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

const NAV_ITEMS = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/leaderboard', icon: Trophy, label: 'Board' },
  { href: '/history', icon: CalendarDays, label: 'History' },
  { href: '/checkins', icon: Scale, label: 'Body Log' },
  { href: '/profile', icon: User, label: 'Profile' },
]

export function BottomNav() {
  const pathname = usePathname()

  const hiddenPaths = ['/login', '/register', '/onboarding', '/dev']
  if (hiddenPaths.some(p => pathname.startsWith(p))) return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-navy-900/90 backdrop-blur-xl border-t border-white/10"
         style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 w-16 h-full relative',
                'transition-colors duration-200',
                isActive ? 'text-brand-400' : 'text-white/40'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -top-px left-3 right-3 h-0.5 bg-brand-400 rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
