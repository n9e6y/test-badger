import { ChevronRight, Printer, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useStartRun } from '@/api/hooks'
import type { Report, Run } from '@/api/types'
import { ScenarioVerdictIcon, VERDICT_LABEL } from '@/components/common/badges'
import { Button } from '@/components/ui/button'
import { formatCost, formatDate, formatDuration, TEST_TYPE_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'
import { VERDICT_STYLES } from '@/lib/verdict'

import { FindingCard } from './FindingCard'

export function ReportView({ run, report }: { run: Run; report: Report }) {
  const start = useStartRun()
  const navigate = useNavigate()
  const style = VERDICT_STYLES[report.overall_verdict]
  const unsure = report.scenarios.filter((s) => s.verdict === 'INCONCLUSIVE')
  const runAgain = () =>
    start.mutate(
      { projectId: run.project_id, input: { test_type: run.test_type, goal_text: run.goal_text ?? undefined } },
      { onSuccess: (n) => navigate(`/app/runs/${n.id}`), onError: (e) => toast.error(e.message) },
    )

  return (
    <div className="grid gap-6">
      {/* 1-2. Verdict */}
      <section className={cn('rounded-xl border p-6', style.className)}>
        <p className="text-xs font-medium uppercase tracking-wide opacity-80">
          {TEST_TYPE_LABEL[report.test_type] ?? report.test_type} · {formatDate(report.created_at)}
        </p>
        <h2 className="mt-1 text-2xl font-semibold">{report.headline}</h2>
        {report.coverage_note && <p className="mt-1">{report.coverage_note}</p>}
      </section>

      {/* 3. Summary */}
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Passed', report.counts.passed],
          ['Bugs found', report.counts.bug_found],
          ['Blocked', report.counts.blocked],
          ['Unsure', report.counts.inconclusive],
        ].map(([label, n]) => (
          <div key={label} className="rounded-xl border bg-background p-4">
            <p className="text-2xl font-semibold tabular-nums">{n}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button onClick={runAgain} disabled={start.isPending}>
          <RotateCcw className="size-4" aria-hidden /> Run again
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden /> Print / Save as PDF
        </Button>
      </div>

      {/* 4. Findings */}
      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">Problems to fix</h2>
        {report.findings.length === 0 ? (
          <p className="rounded-xl border bg-background p-5 text-sm text-muted-foreground">
            No confirmed problems in the checks that could be completed.
          </p>
        ) : (
          report.findings.map((f) => <FindingCard key={f.id} finding={f} siteUrl={report.site_url} />)
        )}
      </section>

      {report.needs_review.length > 0 && (
        <section className="grid gap-4">
          <h2 className="text-lg font-semibold">Needs review</h2>
          <p className="text-sm text-muted-foreground">The agent wasn't fully sure about these. Take a look before fixing.</p>
          {report.needs_review.map((f) => <FindingCard key={f.id} finding={f} siteUrl={report.site_url} review />)}
        </section>
      )}

      {/* 5. Scenarios */}
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">All checks</h2>
        <div className="divide-y rounded-xl border bg-background">
          {report.scenarios.map((s) => (
            <div key={s.id} className="flex items-start gap-3 p-4 text-sm">
              <ScenarioVerdictIcon verdict={s.verdict} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  <span className="mr-2 text-muted-foreground">{s.id}</span>
                  {s.title}
                </p>
                <p className="mt-0.5 text-muted-foreground">{s.reason}</p>
              </div>
              <div className="shrink-0 text-right">
                <p>{VERDICT_LABEL[s.verdict]}</p>
                <p className="text-xs text-muted-foreground">
                  {s.steps_taken} steps · {formatDuration(s.duration_s)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. Blocked & unsure */}
      {(report.blocked.length > 0 || unsure.length > 0) && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">What we couldn't check</h2>
          <ul className="grid gap-2">
            {report.blocked.map((b) => (
              <li key={b.scenario_id} className="rounded-xl border bg-background p-4 text-sm">
                <p className="font-medium">{b.scenario_id === 'ENTRY' ? 'The site' : b.scenario_id}: blocked — {b.reason}</p>
                <p className="mt-1 text-muted-foreground">How to unblock: {b.how_to_unblock}</p>
              </li>
            ))}
            {unsure.map((s) => (
              <li key={s.id} className="rounded-xl border bg-background p-4 text-sm">
                <p className="font-medium">{s.id}: not sure</p>
                <p className="mt-1 text-muted-foreground">{s.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 7. Run details */}
      <details className="group rounded-xl border bg-background p-4 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-1 font-medium">
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden /> Run details
        </summary>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Duration</dt><dd>{formatDuration(report.stats.duration_s)}</dd></div>
          <div><dt className="text-muted-foreground">AI cost</dt><dd>{formatCost(report.stats.cost_usd)}</dd></div>
          <div><dt className="text-muted-foreground">AI calls</dt><dd>{report.stats.llm_calls}</dd></div>
          <div><dt className="text-muted-foreground">Tokens</dt><dd>{report.stats.tokens_in.toLocaleString()} in / {report.stats.tokens_out.toLocaleString()} out</dd></div>
        </dl>
        {report.stats.limits_hit.length > 0 && (
          <p className="mt-3 text-muted-foreground">Limits reached: {report.stats.limits_hit.join('; ')}</p>
        )}
        <p className="mt-3 text-muted-foreground">Site: {report.site_url}</p>
      </details>
    </div>
  )
}
