import { Activity, CheckCircle2, Copy, Film, Terminal } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import type { Finding } from '@/api/types'
import { ToneBadge } from '@/components/common/badges'
import { Corners } from '@/components/common/Corners'
import { Lightbox } from '@/components/common/Lightbox'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Severity is neutral ink, kept apart from the verdict colors.
const SEVERITY: Record<Finding['severity'], { label: string; className: string }> = {
  critical: { label: 'Critical', className: 'border-foreground bg-foreground text-background' },
  major: { label: 'Major', className: 'border-foreground' },
  minor: { label: 'Minor', className: 'border-border text-muted-foreground' },
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
    `_Found by test-badger · scenario ${f.scenario_id} · confidence ${f.confidence}_`,
  ].join('\n')
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="kicker mb-1.5">{children}</p>
}

function LogPanel({ icon: Icon, title, lines, empty }: { icon: typeof Terminal; title: string; lines: string[]; empty: string }) {
  return (
    <div className="min-w-0 border">
      <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5 text-[13px] font-semibold">
        <Icon className="size-4 stroke-[1.5]" aria-hidden />
        {title}
      </div>
      <pre
        className={cn(
          'm-0 p-2.5 font-mono text-[12.5px] leading-normal break-words whitespace-pre-wrap',
          lines.length ? 'text-v-bug' : 'text-muted-foreground',
        )}
      >
        {lines.length ? lines.join('\n') : empty}
      </pre>
    </div>
  )
}

export function FindingCard({
  finding: f,
  siteUrl,
  review = false,
  onWatch,
}: {
  finding: Finding
  siteUrl: string
  review?: boolean
  /** Opens the scenario's video (D22), when one was recorded. */
  onWatch?: () => void
}) {
  const [lightbox, setLightbox] = useState<number | null>(null)
  const images = f.evidence.screenshot_ids.map((id, i) => ({
    src: `/api/artifacts/${id}`,
    caption: `${f.title}: screenshot ${i + 1}`,
  }))
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(findingMarkdown(f, siteUrl))
      toast.success('Copied as Markdown. Paste it into a ticket or an email.')
    } catch {
      toast.error('Could not copy. Your browser blocked clipboard access.')
    }
  }
  const sev = SEVERITY[f.severity]

  return (
    <article className="blueprint flex break-inside-avoid flex-col gap-[18px] p-[22px]">
      <Corners />
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('border px-2 py-0.5 text-xs font-semibold', sev.className)}>{sev.label}</span>
        {review ? <ToneBadge tone="inc" label="Needs review" /> : <ToneBadge tone="bug" label="Bug found" />}
        <span className="text-[13px] text-muted-foreground">
          Scenario {f.scenario_id} · {f.area}
        </span>
        {f.confirmed && (
          <span className="flex items-center gap-1 text-[13px] text-v-pass">
            <CheckCircle2 className="size-3.5" aria-hidden /> Reproduced
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-2xl text-pretty">{f.title}</h3>
        <p className="text-pretty">{f.owner_summary}</p>
      </div>

      <div className="grid gap-x-7 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <Label>Expected</Label>
          {f.expected}
        </div>
        <div>
          <Label>Actual</Label>
          {f.actual}
        </div>
      </div>

      {images.length > 0 && (
        <div>
          <Label>Screenshots · {images.length}</Label>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {images.map((img, i) => (
              <button
                key={img.src}
                type="button"
                onClick={() => setLightbox(i)}
                aria-label={`Open screenshot ${i + 1}`}
                className="block cursor-zoom-in border bg-white hover:border-primary"
              >
                <img src={img.src} alt={img.caption} className="aspect-[16/10] w-full object-cover object-top" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <Label>Steps to reproduce</Label>
        <ol className="grid list-decimal gap-1 pl-[22px]">
          {f.repro_steps.map((s) => (
            <li key={s.order}>{s.action}</li>
          ))}
        </ol>
        <p className="mt-2 text-[13px] break-all text-muted-foreground">Page: {f.evidence.page_url || siteUrl}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <LogPanel icon={Terminal} title="Console" lines={f.evidence.console_errors} empty="No console errors." />
        <LogPanel icon={Activity} title="Network" lines={f.evidence.failed_requests} empty="No failed requests." />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5 print:hidden">
        <div className="flex flex-wrap gap-2.5">
          {onWatch && (
            <Button variant="outline" onClick={onWatch}>
              <Film aria-hidden /> Watch video
            </Button>
          )}
          <Button variant="outline" onClick={copy}>
            <Copy aria-hidden /> Copy as text
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">Confidence: {f.confidence}</span>
      </div>

      {lightbox !== null && <Lightbox images={images} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
    </article>
  )
}
