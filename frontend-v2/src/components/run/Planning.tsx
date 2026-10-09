import { CheckCircle2, Loader2 } from 'lucide-react'

import type { Run } from '@/api/types'
import { Corners } from '@/components/common/Corners'

export function Planning({ run, reconPages }: { run: Run; reconPages: { url: string; title: string }[] }) {
  const planning = run.status === 'PLANNING'
  return (
    <div className="blueprint mx-auto flex w-full max-w-[640px] flex-col gap-6 px-7 py-8">
      <Corners />
      <div role="status" className="flex items-start gap-3">
        <Loader2 className="mt-1 size-5 shrink-0 animate-spin text-ink-700" aria-hidden />
        <div>
          <p className="font-heading text-2xl font-semibold">{run.status_message || 'Getting ready…'}</p>
          <p className="text-sm text-muted-foreground">
            The agent explores the site and writes a test plan for you to review. Usually under a minute.
          </p>
        </div>
      </div>
      <ol className="flex flex-col text-sm" aria-live="polite">
        <li className="flex items-center gap-2 border-b py-2">
          <CheckCircle2 className="size-4 shrink-0 stroke-[1.75] text-ink-700" aria-hidden /> Opening {run.site_url}
        </li>
        {reconPages.map((p) => (
          <li key={p.url} className="flex min-w-0 items-center gap-2 border-b py-2">
            <CheckCircle2 className="size-4 shrink-0 stroke-[1.75] text-ink-700" aria-hidden />
            <span className="shrink-0">Found</span>
            <span className="shrink-0 font-mono text-[12.5px]">{new URL(p.url).pathname}</span>
            <span className="truncate text-muted-foreground">· {p.title}</span>
          </li>
        ))}
        {planning && (
          <li className="flex items-center gap-2 py-2 text-ink-700">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Writing the test plan…
          </li>
        )}
      </ol>
    </div>
  )
}
