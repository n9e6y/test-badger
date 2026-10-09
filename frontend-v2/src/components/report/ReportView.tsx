import { CheckCircle2, Film, Loader2, Printer, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useRerun, useStartRun } from '@/api/hooks'
import type { Report, Run, ScenarioRow } from '@/api/types'
import { TONE_ICON, ToneBadge, VerdictBadge } from '@/components/common/badges'
import { VideoDialog } from '@/components/common/VideoDialog'
import { Button } from '@/components/ui/button'
import { formatCost, formatDate, formatDuration } from '@/lib/format'
import { MODES } from '@/lib/mode'
import { cn } from '@/lib/utils'
import { OVERALL_VERDICT, TONE_CLASSES, type VerdictTone } from '@/lib/verdict'
import { hasVideo } from '@/lib/video'

import { ComparisonCard } from './ComparisonCard'
import { FindingCard } from './FindingCard'

export function ReportView({ run, report }: { run: Run; report: Report }) {
  const start = useStartRun()
  const rerun = useRerun()
  const navigate = useNavigate()
  const [video, setVideo] = useState<ScenarioRow | null>(null)
  const rowFor = (code: string) => run.scenarios.find((s) => s.code === code)
  const watch = (code: string) => {
    const row = rowFor(code)
    return hasVideo(row) ? () => setVideo(row) : undefined
  }
  const overall = OVERALL_VERDICT[report.overall_verdict]
  const tone = TONE_CLASSES[overall.tone]
  const BigIcon = TONE_ICON[overall.tone]
  const unsure = report.scenarios.filter((s) => s.verdict === 'INCONCLUSIVE')
  const couldNotCheck = report.blocked.length + unsure.length
  const runAgain = () =>
    start.mutate(
      { projectId: run.project_id, input: { test_type: run.test_type, goal_text: run.goal_text ?? undefined } },
      { onSuccess: (n) => navigate(`/app/runs/${n.id}`), onError: (e) => toast.error(e.message) },
    )
  const rerunSame = () =>
    rerun.mutate(run.id, {
      onSuccess: (n) => navigate(`/app/runs/${n.id}`),
      onError: (e) => toast.error(e.message),
    })

  const counts: [VerdictTone, number][] = [
    ['pass', report.counts.passed ?? 0],
    ['bug', report.counts.bug_found ?? 0],
    ['blocked', report.counts.blocked ?? 0],
    ['inc', report.counts.inconclusive ?? 0],
  ]
  const TONE_LABEL: Record<VerdictTone, string> = { pass: 'Passed', bug: 'Bug found', blocked: 'Blocked', inc: 'Inconclusive' }
  const stats: [string, string][] = [
    ['Mode', MODES[run.mode].label],
    ['Duration', formatDuration(report.stats.duration_s)],
    ['AI cost', formatCost(report.stats.cost_usd)],
    ['Model calls', String(report.stats.llm_calls)],
    ['Scenarios', String(report.scenarios.length)],
  ]

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        <Button variant="outline" className="min-h-11" onClick={() => window.print()}>
          <Printer aria-hidden /> Print
        </Button>
        <Button variant="outline" className="min-h-11" onClick={runAgain} disabled={start.isPending}>
          <RotateCcw aria-hidden /> Fresh run
        </Button>
        {run.plan && (
          <Button
            className="min-h-11 px-[18px]"
            onClick={rerunSame}
            disabled={rerun.isPending}
            title="Runs the same scenarios again, without new planning, to check your fixes"
          >
            {rerun.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Re-run same plan
          </Button>
        )}
      </div>

      {/* Overall verdict */}
      <section role="status" aria-label="Overall verdict" className={cn('flex flex-col gap-[18px] border-2 p-5 lg:p-7', tone.bg, tone.bdStrong)}>
        <div className="flex items-start gap-4">
          <BigIcon className={cn('size-10 shrink-0 stroke-[2.25]', tone.fg)} aria-hidden />
          <div className="flex flex-col gap-1.5">
            <span className={cn('text-xs font-bold tracking-[0.14em] uppercase', tone.fg)}>{overall.label}</span>
            <h2 className="text-[clamp(30px,3vw,44px)] leading-none font-bold">{report.headline}</h2>
            {report.coverage_note && <p className="text-base leading-normal">{report.coverage_note}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-[color-mix(in_srgb,currentColor_25%,transparent)] pt-3.5">
          {counts.map(([t, n]) => (
            <span key={t} className="flex items-center gap-2">
              <strong className="font-heading text-2xl font-semibold">{n}</strong>
              <ToneBadge tone={t} label={TONE_LABEL[t]} />
            </span>
          ))}
        </div>
      </section>

      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] border-t border-b border-t-foreground">
        {stats.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 py-3 pr-3">
            <dt className="text-[11px] font-semibold tracking-[0.14em] uppercase">{k}</dt>
            <dd className="font-heading text-2xl font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      {run.comparison && <ComparisonCard comparison={run.comparison} />}

      <section id="findings" className="flex scroll-mt-20 flex-col gap-4">
        <h2 className="text-[30px] leading-none">
          Findings <span className="text-xl">· {report.findings.length}</span>
        </h2>
        {report.findings.length === 0 ? (
          <div className="flex items-center gap-2.5 border border-dashed border-foreground p-[18px]">
            <CheckCircle2 className="size-6 shrink-0 stroke-2 text-v-pass" aria-hidden />
            <span>No confirmed bugs in the scenarios that could be completed.</span>
          </div>
        ) : (
          report.findings.map((f) => <FindingCard key={f.id} finding={f} siteUrl={report.site_url} onWatch={watch(f.scenario_id)} />)
        )}
      </section>

      {report.needs_review.length > 0 && (
        <section id="review" className="flex scroll-mt-20 flex-col gap-3">
          <h2 className="text-[26px] leading-none">
            Needs review <span className="text-lg">· {report.needs_review.length}</span>
          </h2>
          <p className="text-[15px]">Low confidence: not counted as bugs. Check them by hand before fixing.</p>
          {report.needs_review.map((f) => (
            <FindingCard key={f.id} finding={f} siteUrl={report.site_url} review onWatch={watch(f.scenario_id)} />
          ))}
        </section>
      )}

      {couldNotCheck > 0 && (
        <section id="blocked" className="flex scroll-mt-20 flex-col gap-3">
          <h2 className="text-[26px] leading-none">
            Couldn’t check <span className="text-lg">· {couldNotCheck}</span>
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] gap-4">
            {report.blocked.map((b) => (
              <div key={b.scenario_id} className="flex flex-col gap-2.5 border border-v-blocked p-4">
                <ToneBadge tone="blocked" label="Blocked" />
                <span className="text-base leading-snug font-semibold">{b.scenario_id === 'ENTRY' ? 'The site' : b.scenario_id}</span>
                <span className="text-sm leading-normal">{b.reason}</span>
                <span className="text-sm leading-normal">
                  <strong className="font-semibold">Advice:</strong> {b.how_to_unblock}
                </span>
              </div>
            ))}
            {unsure.map((s) => (
              <div key={s.id} className="flex flex-col gap-2.5 border border-v-inc p-4">
                <ToneBadge tone="inc" label="Inconclusive" />
                <span className="text-base leading-snug font-semibold">
                  {s.id} · {s.title}
                </span>
                <span className="text-sm leading-normal">{s.reason}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="scenarios" className="flex scroll-mt-20 flex-col gap-3">
        <h2 className="text-[30px] leading-none">All scenarios</h2>
        <ul aria-label="All scenarios" className="flex flex-col border-t border-foreground">
          {report.scenarios.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b py-3">
              <span className="flex min-w-0 flex-[1_1_280px] gap-2.5 text-[15px] leading-snug">
                <span className="w-[30px] shrink-0 font-heading text-base font-semibold">{s.id}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{s.title}</span>
                  <span className="text-[13px]">{s.reason}</span>
                </span>
              </span>
              <span className="flex flex-none items-center gap-3.5 pl-10 sm:pl-0">
                <span className="min-w-[88px] text-[13px] tabular-nums">
                  {s.steps_taken} steps · {formatDuration(s.duration_s)}
                </span>
                <VerdictBadge verdict={s.verdict} />
                {watch(s.id) && (
                  <Button variant="ghost" size="sm" className="print:hidden" onClick={watch(s.id)} aria-label={`Watch video of ${s.id}`}>
                    <Film aria-hidden /> Watch
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {report.stats.limits_hit.length > 0 && <p className="text-[13px]">Limits reached: {report.stats.limits_hit.join('; ')}</p>}
        <p className="text-[13px]">
          {formatDate(report.created_at)} · {report.stats.tokens_in.toLocaleString()} tokens in / {report.stats.tokens_out.toLocaleString()} out ·
          Chromium (headless)
        </p>
      </section>

      {video && <VideoDialog scenario={video} onClose={() => setVideo(null)} />}
    </div>
  )
}
