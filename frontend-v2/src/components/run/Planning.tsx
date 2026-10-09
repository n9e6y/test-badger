import { Loader2 } from 'lucide-react'

import type { Run } from '@/api/types'

/** Planning state: what the agent is doing, and the pages it found so far (new-app "What it found"). */
export function Planning({ run, reconPages }: { run: Run; reconPages: { url: string; title: string }[] }) {
  const planning = run.status === 'PLANNING'
  const path = (u: string) => {
    try {
      return new URL(u).pathname || '/'
    } catch {
      return u
    }
  }
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <div role="status" className="flex items-start gap-3">
        <Loader2 className="mt-1 size-5 shrink-0 animate-spin" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="font-heading text-2xl leading-tight font-semibold">{run.status_message || 'Getting ready…'}</p>
          <p className="text-[17px] leading-relaxed">
            test-badger explores the site and writes a test plan for you to review. Usually under a minute. Nothing is
            typed into your site yet.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 border bg-surface px-[18px] py-4" aria-live="polite">
        <span className="text-xs font-semibold tracking-[0.14em] uppercase">What it found so far</span>
        <div className="flex flex-wrap gap-2">
          <span className="border bg-background px-2.5 py-1.5 font-mono text-[13px] break-all">
            {run.site_url.replace(/^https?:\/\//, '')}
          </span>
          {reconPages.map((p) => (
            <span key={p.url} title={p.title} className="border bg-background px-2.5 py-1.5 font-mono text-[13px] break-all">
              {path(p.url)}
            </span>
          ))}
        </div>
        {planning && (
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Writing the test plan…
          </span>
        )}
      </div>
    </div>
  )
}
