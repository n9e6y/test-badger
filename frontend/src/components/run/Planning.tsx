import { CheckCircle2, Loader2 } from 'lucide-react'

import type { Run } from '@/api/types'

export function Planning({ run, reconPages }: { run: Run; reconPages: { url: string; title: string }[] }) {
  const planning = run.status === 'PLANNING'
  return (
    <div className="mx-auto grid w-full max-w-xl gap-6 rounded-xl border bg-background p-8">
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <div>
          <p className="font-medium">{run.status_message || 'Getting ready…'}</p>
          <p className="text-sm text-muted-foreground">
            The agent explores the site and writes a test plan for you to review. Usually under a minute.
          </p>
        </div>
      </div>
      <ol className="grid gap-2 text-sm" aria-live="polite">
        <li className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-muted-foreground" aria-hidden /> Opening {run.site_url}
        </li>
        {reconPages.map((p) => (
          <li key={p.url} className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-muted-foreground" aria-hidden />
            Found <span className="font-medium">{new URL(p.url).pathname}</span>
            <span className="truncate text-muted-foreground">— {p.title}</span>
          </li>
        ))}
        {planning && (
          <li className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Writing the test plan…
          </li>
        )}
      </ol>
    </div>
  )
}
