import { Loader2, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

import { LogoMark } from '@/components/common/Logo'
import { Button } from '@/components/ui/button'

// v2 states (new-app TB-State): skeleton for loading, dashed badger box for empty,
// heavy ink frame with a black "!" for errors.

export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-[50vh] items-center justify-center gap-2 text-ink-700">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="font-medium">{label}</span>
    </div>
  )
}

export function SkeletonBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col gap-2 border p-4">
      <span className="sr-only">{label}</span>
      <span aria-hidden className="block h-3.5 w-[55%] bg-[#e8e8e8]" />
      <span aria-hidden className="block h-2.5 w-[90%] bg-[#f0f0f0]" />
      <span aria-hidden className="block h-2.5 w-3/4 bg-[#f0f0f0]" />
      <span aria-hidden className="mt-1 block h-11 w-full bg-[#f0f0f0]" />
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 border-2 border-foreground p-3.5">
      <span aria-hidden className="grid size-6 shrink-0 place-items-center bg-foreground text-[15px] leading-none font-bold text-background">
        !
      </span>
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
        <p className="leading-tight font-semibold">Something went wrong</p>
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
    <div className="flex flex-col items-start gap-3.5 border px-4 py-5">
      <div aria-hidden className="grid size-[52px] place-items-center border border-dashed border-foreground">
        <LogoMark size={32} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-heading text-[21px] leading-tight font-semibold">{title}</p>
        {children && <div className="text-sm leading-relaxed">{children}</div>}
      </div>
    </div>
  )
}
