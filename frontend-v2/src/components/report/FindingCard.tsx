import { Check, Copy, Film } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import type { Finding } from '@/api/types'
import { ReviewBadge, ToneBadge } from '@/components/common/badges'
import { Lightbox } from '@/components/common/Lightbox'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Severity is neutral ink, kept apart from the verdict colors.
const SEVERITY: Record<Finding['severity'], { label: string; className: string }> = {
  critical: { label: 'Critical', className: 'border-foreground bg-foreground text-background' },
  major: { label: 'Major', className: 'border-foreground' },
  minor: { label: 'Minor', className: 'border-border' },
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
  return <p className="mb-1.5 text-xs font-semibold tracking-[0.14em] uppercase">{children}</p>
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
  const logs = [...f.evidence.console_errors, ...f.evidence.failed_requests]

  return (
    <article className={cn('break-inside-avoid bg-background', review ? 'border border-dashed border-foreground' : 'border border-foreground')}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b px-[18px] py-3.5">
        {review ? <ReviewBadge /> : <ToneBadge tone="bug" label="Bug found" />}
        <span className={cn('border px-2 py-[3px] text-xs leading-4 font-semibold tracking-[0.05em] uppercase', sev.className)}>
          Severity · {sev.label}
        </span>
        <span className="text-[13px] font-semibold">
          {f.area} · {f.scenario_id}
        </span>
        {f.confirmed && (
          <span className="flex items-center gap-1 text-[13px] font-semibold text-v-pass">
            <Check className="size-3.5 stroke-[2.75]" aria-hidden /> Reproduced
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-5 p-[18px]">
        <div className="flex min-w-0 flex-[1.3_1_360px] flex-col gap-3.5">
          <h3 className="text-[26px] leading-[1.05] text-pretty">{f.title}</h3>
          <p className="text-[15px] leading-relaxed text-pretty">{f.owner_summary}</p>
          <p className="text-[15px] leading-relaxed">
            <strong className="font-semibold">Expected:</strong> {f.expected}
            <br />
            <strong className="font-semibold">Actual:</strong> {f.actual}
          </p>
          <div>
            <Label>Steps to reproduce</Label>
            <ol className="flex list-decimal flex-col gap-[3px] pl-[22px] text-[15px] leading-normal">
              {f.repro_steps.map((s) => (
                <li key={s.order}>{s.action}</li>
              ))}
            </ol>
            <p className="mt-2 font-mono text-[13px] break-all">{f.evidence.page_url || siteUrl}</p>
          </div>
          <div>
            <Label>Console and network</Label>
            <pre className="m-0 border bg-surface px-3.5 py-3 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap">
              {logs.length ? logs.join('\n') : 'No console errors or failed requests.'}
            </pre>
          </div>
        </div>

        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2">
          {images.length > 0 && (
            <>
              <Label>Screenshots · click to enlarge</Label>
              <div className="grid grid-cols-3 gap-2">
                {images.map((img, i) => (
                  <button
                    key={img.src}
                    type="button"
                    onClick={() => setLightbox(i)}
                    aria-label={`Enlarge screenshot ${i + 1}`}
                    className="flex cursor-zoom-in flex-col gap-1 text-left"
                  >
                    <img
                      src={img.src}
                      alt={img.caption}
                      className="aspect-[4/3] w-full border bg-white object-cover object-top hover:border-foreground"
                      loading="lazy"
                    />
                    <span className="text-[11px] font-semibold">Step {i + 1}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="mt-1 flex flex-wrap gap-2 print:hidden">
            {onWatch && (
              <Button variant="outline" onClick={onWatch}>
                <Film aria-hidden /> Watch video
              </Button>
            )}
            <Button variant="outline" onClick={copy}>
              <Copy aria-hidden /> Copy as text
            </Button>
          </div>
          <span className="text-[13px]">Confidence: {f.confidence}</span>
        </div>
      </div>

      {lightbox !== null && <Lightbox images={images} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
    </article>
  )
}
