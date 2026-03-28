import type { Metadata, Viewport } from 'next'
import './globals.css'
import { BottomNav } from '@/components/bottom-nav'

export const metadata: Metadata = {
  title: 'ShipShape90',
  description: '90-day fitness challenge. Four go in — one walks off the gangplank with everyone\'s money.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ShipShape90',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#080f18',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <main className="max-w-lg mx-auto px-4 pt-4 safe-bottom min-h-dvh">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  )
}
