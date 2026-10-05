import { CheckCircle2, ChevronRight, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import type { Finding } from '@/api/types'
import { Lightbox } from '@/components/common/Lightbox'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const SEVERITY: Record<Finding['severity'], string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  major: 'bg-orange-100 text-orange-800 border-orange-200',
  minor: 'bg-yellow-100 text-yellow-800 border-yellow-200',
}

export function findingMarkdown(f: Finding, siteUrl: string): string {
  return [
    `### [${f.severity.toUpperCase()}] ${f.title}`,
    '',
    f.owner_summary,
    '',
    `**Expected:** ${f.expected}`,
    `**Actual:** ${f.actual}`,
    '',
    '**Steps to reproduce**',
    ...f.repro_steps.map((s) => `${s.order}. ${s.action}`),
    '',
    `Page: ${f.evidence.page_url || siteUrl}`,
    ...(f.evidence.console_errors.length ? ['', '**Console errors**', ...f.evidence.console_errors.map((e) => `- \`${e}\``)] : []),
    ...(f.evidence.failed_requests.length ? ['', '**Failed requests**', ...f.evidence.failed_requests.map((e) => `- \`${e}\``)] : []),
    '',
    `_Found by ShipCheck · scenario ${f.scenario_id} · confidence ${f.confidence}_`,
  ].join('\n')
}

export function FindingCard({ finding: f, siteUrl, review = false }: { finding: Finding; siteUrl: string; review?: boolean }) {
  const [lightbox, setLightbox] = useState<number | null>(null)
  const images = f.evidence.screenshot_ids.map((id, i) => ({
    src: `/api/artifacts/${id}`,
    caption: `${f.title} — screenshot ${i + 1}`,
  }))
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(findingMarkdown(f, siteUrl))
      toast.success('Copied as Markdown — paste it into a ticket or an email.')
    } catch {
      toast.error('Could not copy. Your browser blocked clipboard access.')
    }
  }

  return (
    <article className="break-inside-avoid rounded-xl border bg-background p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={cn('rounded-full border px-2 py-0.5 font-medium uppercase', SEVERITY[f.severity])}>{f.severity}</span>
          <span className="uppercase text-muted-foreground">{f.area}</span>
          {review && <span className="rounded-full border px-2 py-0.5">Needs review</span>}
          {f.confirmed && (
            <span className="flex items-center gap-1 text-green-700"><CheckCircle2 className="size-3.5" aria-hidden /> Confirmed</span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={copy} className="print:hidden">
          <Copy className="size-3.5" aria-hidden /> Copy as text
        </Button>
      </div>
      <h3 className="mt-2 text-lg font-semibold">{f.title}</h3>
      <p className="mt-2">{f.owner_summary}</p>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt className="text-muted-foreground">Expected</dt>
        <dd>{f.expected}</dd>
        <dt className="text-muted-foreground">Actual</dt>
        <dd>{f.actual}</dd>
      </dl>

      <p className="mt-4 text-sm font-medium">Steps to reproduce</p>
      <ol className="mt-1 list-decimal pl-5 text-sm">
        {f.repro_steps.map((s) => <li key={s.order}>{s.action}</li>)}
      </ol>

      {images.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {images.map((img, i) => (
            <button key={img.src} type="button" onClick={() => setLightbox(i)} className="overflow-hidden rounded-md border hover:ring-2 hover:ring-ring">
              <img src={img.src} alt={img.caption} className="h-24 w-36 object-cover object-top" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <details className="group mt-4 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-muted-foreground">
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden /> Technical details
        </summary>
        <div className="mt-2 grid gap-2 rounded-lg bg-muted/60 p-3 font-mono text-xs">
          <p>Page: {f.evidence.page_url || siteUrl}</p>
          {f.evidence.console_errors.map((e) => <p key={e}>console: {e}</p>)}
          {f.evidence.failed_requests.map((e) => <p key={e}>network: {e}</p>)}
          {!f.evidence.console_errors.length && !f.evidence.failed_requests.length && <p>No console errors or failed requests.</p>}
          <p>Scenario {f.scenario_id} · confidence {f.confidence}</p>
        </div>
      </details>

      {lightbox !== null && <Lightbox images={images} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
    </article>
  )
}
