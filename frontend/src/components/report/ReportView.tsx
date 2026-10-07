import { CheckCircle2, Film, Loader2, Printer, RefreshCcw, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useRerun, useStartRun } from '@/api/hooks'
import type { Report, Run, ScenarioRow } from '@/api/types'
import { TONE_ICON, ToneBadge, VerdictBadge } from '@/components/common/badges'
import { Corners } from '@/components/common/Corners'
import { VideoDialog } from '@/components/common/VideoDialog'
import { Button } from '@/components/ui/button'
import { formatCost, formatDate, formatDuration, TEST_TYPE_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'
import { OVERALL_VERDICT, TONE_CLASSES, type VerdictTone } from '@/lib/verdict'
import { hasVideo } from '@/lib/video'

import { ComparisonCard } from './ComparisonCard'
import { FindingCard } from './FindingCard'

const ROW_RULE = 'border-b border-[color-mix(in_srgb,var(--foreground)_9%,transparent)]'

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

  const counts: [VerdictTone, number, string][] = [
    ['bug', report.counts.bug_found ?? 0, 'Bug found'],
    ['pass', report.counts.passed ?? 0, 'Passed'],
    ['blocked', report.counts.blocked ?? 0, 'Blocked'],
    ['inc', report.counts.inconclusive ?? 0, 'Inconclusive'],
  ]
  const details: [string, string][] = [
    ['Test', TEST_TYPE_LABEL[report.test_type] ?? report.test_type],
    ['Site', report.site_url],
    ['Started', formatDate(report.created_at)],
    ['Duration', formatDuration(report.stats.duration_s)],
    ['AI cost', formatCost(report.stats.cost_usd)],
    ['AI calls', String(report.stats.llm_calls)],
    ['Tokens', `${report.stats.tokens_in.toLocaleString()} in / ${report.stats.tokens_out.toLocaleString()} out`],
    ['Browser', 'Chromium (headless)'],
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Verdict */}
      <section role="status" className={cn('flex flex-wrap items-center gap-x-5 gap-y-3.5 border px-[22px] py-5', tone.bg, tone.bd)}>
        <BigIcon className={cn('size-9 shrink-0 stroke-[1.5]', tone.fg)} aria-hidden />
        <div className="min-w-0 flex-[1_1_280px]">
          <p className={cn('font-heading text-[clamp(28px,2.6vw,36px)] leading-tight font-semibold', tone.fg)}>{overall.label}</p>
          <p className="mt-1 text-base">{report.headline}</p>
          {report.coverage_note && <p className="mt-0.5 text-sm">{report.coverage_note}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {counts.map(([t, n, label]) => (
            <span
              key={t}
              className={cn('inline-flex items-center gap-1.5 border bg-background py-1 pr-2.5 pl-2 text-[13px] font-medium', TONE_CLASSES[t].fg, TONE_CLASSES[t].bd)}
            >
              <strong className="font-bold">{n}</strong> {label}
            </span>
          ))}
        </div>
      </section>

      {run.comparison && <ComparisonCard comparison={run.comparison} />}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2.5 print:hidden">
        <nav aria-label="Report sections" className="flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-steel-700">
          <a href="#findings" className="hover:underline">Findings ({report.findings.length})</a>
          {report.needs_review.length > 0 && (
            <a href="#review" className="hover:underline">Needs review ({report.needs_review.length})</a>
          )}
          {couldNotCheck > 0 && <a href="#blocked" className="hover:underline">Couldn’t check ({couldNotCheck})</a>}
          <a href="#scenarios" className="hover:underline">All scenarios ({report.scenarios.length})</a>
          <a href="#details" className="hover:underline">Run details</a>
        </nav>
        <div className="flex flex-wrap gap-2.5">
          {run.plan && (
            <Button
              className="blueprint"
              onClick={rerunSame}
              disabled={rerun.isPending}
              title="Runs the same scenarios again, without new planning, to check your fixes"
            >
              <Corners />
              {rerun.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCcw aria-hidden />}
              Re-run same plan
            </Button>
          )}
          <Button variant="outline" onClick={runAgain} disabled={start.isPending}>
            <RotateCcw aria-hidden /> Fresh run
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer aria-hidden /> Print / PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-8">
        <div className="flex min-w-0 flex-[3_1_600px] flex-col gap-9">
          <section id="findings" className="flex scroll-mt-20 flex-col gap-5">
            <h2 className="text-[26px]">Findings</h2>
            {report.findings.length === 0 ? (
              <div className="flex items-center gap-2.5 border border-dashed p-[18px]">
                <CheckCircle2 className="size-6 shrink-0 stroke-[1.5] text-v-pass" aria-hidden />
                <span>No confirmed bugs in the scenarios that could be completed.</span>
              </div>
            ) : (
              report.findings.map((f) => (
                <FindingCard key={f.id} finding={f} siteUrl={report.site_url} onWatch={watch(f.scenario_id)} />
              ))
            )}
          </section>

          {report.needs_review.length > 0 && (
            <section id="review" className="flex scroll-mt-20 flex-col gap-3.5">
              <h2 className="text-[26px]">Needs review</h2>
              <p className="text-muted-foreground">The agent wasn’t fully sure about these. Take a look before fixing.</p>
              {report.needs_review.map((f) => (
                <FindingCard key={f.id} finding={f} siteUrl={report.site_url} review onWatch={watch(f.scenario_id)} />
              ))}
            </section>
          )}

          {couldNotCheck > 0 && (
            <section id="blocked" className="flex scroll-mt-20 flex-col gap-3.5">
              <h2 className="text-[26px]">What we couldn’t check</h2>
              {report.blocked.map((b) => (
                <div key={b.scenario_id} className="flex flex-col gap-2.5 border border-v-blocked-bd p-[18px]">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <ToneBadge tone="blocked" label="Blocked" />
                    <strong className="font-semibold">{b.scenario_id === 'ENTRY' ? 'The site' : b.scenario_id}</strong>
                  </div>
                  <p className="text-sm text-pretty">{b.reason}</p>
                  <p className="text-sm text-pretty">
                    <span className="font-medium">How to unblock: </span>
                    {b.how_to_unblock}
                  </p>
                </div>
              ))}
              {unsure.map((s) => (
                <div key={s.id} className="flex flex-col gap-2.5 border border-v-inc-bd p-[18px]">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <ToneBadge tone="inc" label="Inconclusive" />
                    <strong className="font-semibold">
                      {s.id}. {s.title}
                    </strong>
                  </div>
                  <p className="text-sm text-pretty">{s.reason}</p>
                </div>
              ))}
            </section>
          )}

          <section id="scenarios" className="flex scroll-mt-20 flex-col gap-2.5">
            <h2 className="text-[26px]">All scenarios</h2>
            <div role="table" aria-label="All scenarios" className="flex flex-col">
              {report.scenarios.map((s) => (
                <div key={s.id} role="row" className={cn('flex flex-wrap items-center gap-x-3.5 gap-y-1.5 px-1.5 py-3 text-sm', ROW_RULE)}>
                  <span role="cell" className="w-10 font-heading font-semibold text-steel-700">{s.id}</span>
                  <span role="cell" className="min-w-0 flex-[1_1_260px]">
                    {s.title}
                    <span className="block text-xs text-muted-foreground">{s.reason}</span>
                  </span>
                  <span role="cell" className="w-32">
                    <VerdictBadge verdict={s.verdict} />
                  </span>
                  <span role="cell" className="w-24 text-right text-xs text-muted-foreground tabular-nums">
                    {s.steps_taken} steps · {formatDuration(s.duration_s)}
                  </span>
                  <span role="cell" className="w-20 text-right print:hidden">
                    {watch(s.id) && (
                      <Button variant="ghost" size="sm" onClick={watch(s.id)} aria-label={`Watch video of ${s.id}`}>
                        <Film aria-hidden /> Watch
                      </Button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside id="details" className="blueprint min-w-0 flex-[1_1_280px] scroll-mt-20">
          <Corners />
          <h2 className="border-b px-4 py-3 text-[19px]">Run details</h2>
          <dl className="px-4 pt-1.5 pb-3">
            {details.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] py-2 text-sm last:border-b-0">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium [overflow-wrap:anywhere]">{v}</dd>
              </div>
            ))}
          </dl>
          {report.stats.limits_hit.length > 0 && (
            <p className="border-t px-4 py-3 text-[13px] text-muted-foreground">
              Limits reached: {report.stats.limits_hit.join('; ')}
            </p>
          )}
        </aside>
      </div>

      {video && <VideoDialog scenario={video} onClose={() => setVideo(null)} />}
    </div>
  )
}
