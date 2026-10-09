import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-[50vh] items-center justify-center gap-2 text-ink-700">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="font-medium">{label}</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-start gap-x-3.5 gap-y-2.5 border border-v-bug-bd bg-v-bug-bg px-3.5 py-3">
      <AlertCircle className="mt-0.5 size-5 shrink-0 text-v-bug" aria-hidden />
      <div className="min-w-0 flex-[1_1_240px]">
        <p className="font-semibold text-v-bug">Something went wrong</p>
        <p className="text-sm">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw aria-hidden /> Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 border border-dashed px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="text-sm text-muted-foreground">{children}</div>}
    </div>
  )
}
