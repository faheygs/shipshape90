import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { HistoryPageClient } from './history-page-client'

export default function HistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        </div>
      }
    >
      <HistoryPageClient />
    </Suspense>
  )
}
