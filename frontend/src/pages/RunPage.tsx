import { ArrowLeft, Loader2, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import {
  useApproveRun,
  useCancelRun,
  usePatchPlan,
  useRun,
  useScenarioSteps,
  useStartRun,
} from '@/api/hooks'
import type { Report, Run } from '@/api/types'
import { OverallBadge, ScenarioVerdictIcon, StatusBadge, VERDICT_LABEL } from '@/components/common/badges'
import { ErrorState, FullPageSpinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCost, formatDuration, TEST_TYPE_LABEL } from '@/lib/format'
import { VERDICT_STYLES } from '@/lib/verdict'

// Day 3 minimal run page: one route, view chosen by run.status (polished on Day 4).
export function RunPage() {
  const { runId = '' } = useParams()
  const run = useRun(runId)

  if (run.isPending) return <FullPageSpinner />
  if (run.isError) return <ErrorState message={run.error.message} onRetry={() => run.refetch()} />
  const r = run.data

  return (
    <div className="grid gap-6">
      <RunHeader run={r} />
      {(r.status === 'QUEUED' && !r.plan) || r.status === 'RECON' || r.status === 'PLANNING' ? (
        <Planning run={r} />
      ) : r.status === 'AWAITING_APPROVAL' ? (
        <PlanReview run={r} />
      ) : r.status === 'COMPLETED' && r.report ? (
        <ReportView report={r.report} />
      ) : r.status === 'FAILED' ? (
        <Failed run={r} />
      ) : r.status === 'CANCELLED' ? (
        <p className="text-muted-foreground">This run was cancelled.</p>
      ) : (
        <LiveRun run={r} />
      )}
    </div>
  )
}

function RunHeader({ run }: { run: Run }) {
  const cancel = useCancelRun()
  const cancellable = !['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)
  return (
    <div className="grid gap-2">
      <Link to="/app" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Dashboard
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{run.project_name}</h1>
          <p className="text-sm text-muted-foreground">
            {TEST_TYPE_LABEL[run.test_type]} · {run.site_url}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <StatusBadge status={run.status} />
          <span className="tabular-nums text-muted-foreground">{formatCost(run.cost_usd)}</span>
          {cancellable && (
            <Button variant="outline" size="sm" disabled={cancel.isPending}
              onClick={() => cancel.mutate({ runId: run.id }, { onError: (e) => toast.error(e.message) })}>
              Stop
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Planning({ run }: { run: Run }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-background py-16 text-center">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <p className="font-medium">{run.status_message || 'Getting ready…'}</p>
      <p className="text-sm text-muted-foreground">The agent is exploring the site and writing a test plan. Usually under a minute.</p>
    </div>
  )
}

const KIND_LABEL = { happy_path: 'Happy path', negative: 'Negative', edge_case: 'Edge case' } as const

function PlanReview({ run }: { run: Run }) {
  const patch = usePatchPlan()
  const approve = useApproveRun()
  const plan = run.plan
  if (!plan) return null
  const enabledCount = plan.scenarios.filter((s) => s.enabled).length
  const toggle = (id: string, enabled: boolean) =>
    patch.mutate({ runId: run.id, body: { scenarios: [{ id, enabled }] } }, { onError: (e) => toast.error(e.message) })

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border bg-background p-5">
        <h2 className="font-medium">Review the test plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">{plan.summary}</p>
        <p className="mt-2 text-sm">
          {enabledCount} checks · about {Math.max(1, enabledCount)} minutes
        </p>
      </div>
      <ul className="grid gap-3">
        {plan.scenarios.map((s) => (
          <li key={s.id} className={cn('rounded-xl border bg-background p-4', !s.enabled && 'opacity-60')}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  <span className="mr-2 text-muted-foreground">{s.id}</span>
                  {s.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {KIND_LABEL[s.kind]} · starts at {s.start_url}
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" checked={s.enabled} disabled={patch.isPending}
                  onChange={(e) => toggle(s.id, e.target.checked)} />
                Include
              </label>
            </div>
            {s.test_data.length > 0 && (
              <p className="mt-2 text-sm">
                <span className="text-muted-foreground">Test data: </span>
                {s.test_data.map((d) => `${d.value}`).join(' · ')}
              </p>
            )}
            <p className="mt-1 text-sm">
              <span className="text-muted-foreground">Expected: </span>
              {s.expected_result}
            </p>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button size="lg" disabled={approve.isPending || enabledCount === 0}
          onClick={() => approve.mutate({ runId: run.id }, { onError: (e) => toast.error(e.message) })}>
          {approve.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Approve &amp; run
        </Button>
      </div>
    </div>
  )
}

function LiveRun({ run }: { run: Run }) {
  const enabled = run.scenarios.filter((s) => s.enabled)
  const current = enabled.find((s) => !s.verdict)?.code ?? null
  const [selected, setSelected] = useState<string | null>(null)
  const shown = selected ?? current
  const steps = useScenarioSteps(run.id, shown, shown === current)
  const last = steps.data?.at(-1)

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <ul className="order-2 grid h-fit min-w-0 gap-1 rounded-xl border bg-background p-2 lg:order-1">
        {enabled.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setSelected(s.code)}
              className={cn('flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted',
                shown === s.code && 'bg-muted')}>
              <ScenarioVerdictIcon verdict={s.verdict} running={s.code === current && run.status === 'RUNNING'} />
              <span className="text-muted-foreground">{s.code}</span>
              <span className="min-w-0 truncate" title={s.title}>{s.title}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="order-1 grid min-w-0 gap-3 lg:order-2">
        <p className="text-sm text-muted-foreground">{run.status_message}</p>
        <div className="overflow-hidden rounded-xl border bg-background">
          {last?.screenshot_artifact_id ? (
            <img src={`/api/artifacts/${last.screenshot_artifact_id}`} alt={`Browser after: ${last.description}`}
              className="w-full" />
          ) : (
            <div className="flex aspect-[16/10] items-center justify-center text-sm text-muted-foreground">
              Waiting for the first screenshot…
            </div>
          )}
          {last?.url && <p className="truncate border-t px-3 py-2 text-xs text-muted-foreground">{last.url}</p>}
        </div>
        <ol className="grid gap-2 rounded-xl border bg-background p-4 text-sm">
          {(steps.data ?? []).slice().reverse().map((st) => (
            <li key={st.index}>
              <span className="font-medium">{st.index}. {st.description}</span>
              {st.reasoning && <span className="text-muted-foreground"> — {st.reasoning}</span>}
            </li>
          ))}
          {steps.data?.length === 0 && <li className="text-muted-foreground">No steps yet.</li>}
        </ol>
      </div>
    </div>
  )
}

function ReportView({ report }: { report: Report }) {
  const style = VERDICT_STYLES[report.overall_verdict]
  return (
    <div className="grid gap-4">
      <div className={cn('rounded-xl border p-5', style.className)}>
        <p className="text-lg font-semibold">{report.headline}</p>
        {report.coverage_note && <p className="mt-1 text-sm">{report.coverage_note}</p>}
      </div>
      <p className="text-sm text-muted-foreground">
        {report.counts.passed} passed · {report.counts.bug_found} bugs · {report.counts.blocked} blocked ·{' '}
        {report.counts.inconclusive} unsure · {formatDuration(report.stats.duration_s)} · {formatCost(report.stats.cost_usd)}
      </p>
      {report.findings.map((f) => (
        <article key={f.id} className="rounded-xl border bg-background p-5">
          <p className="text-xs font-medium uppercase text-muted-foreground">{f.severity} · {f.area}</p>
          <h3 className="mt-1 font-semibold">{f.title}</h3>
          <p className="mt-2 text-sm">{f.owner_summary}</p>
          <dl className="mt-3 grid gap-1 text-sm">
            <div><dt className="inline text-muted-foreground">Expected: </dt><dd className="inline">{f.expected}</dd></div>
            <div><dt className="inline text-muted-foreground">Actual: </dt><dd className="inline">{f.actual}</dd></div>
          </dl>
          <p className="mt-3 text-sm font-medium">Steps to reproduce</p>
          <ol className="list-decimal pl-5 text-sm">
            {f.repro_steps.map((s) => <li key={s.order}>{s.action}</li>)}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            {f.evidence.screenshot_ids.map((id) => (
              <a key={id} href={`/api/artifacts/${id}`} target="_blank" rel="noreferrer">
                <img src={`/api/artifacts/${id}`} alt="Evidence screenshot" className="h-24 rounded border" />
              </a>
            ))}
          </div>
        </article>
      ))}
      <div className="rounded-xl border bg-background">
        {report.scenarios.map((s) => (
          <div key={s.id} className="flex items-start gap-3 border-b p-3 text-sm last:border-0">
            <ScenarioVerdictIcon verdict={s.verdict} />
            <div>
              <p><span className="text-muted-foreground">{s.id}</span> {s.title} — {VERDICT_LABEL[s.verdict]}</p>
              <p className="text-muted-foreground">{s.reason}</p>
            </div>
          </div>
        ))}
      </div>
      {report.blocked.map((b) => (
        <p key={b.scenario_id} className="rounded-xl border bg-background p-4 text-sm">
          <span className="font-medium">Couldn't test {b.scenario_id}:</span> {b.reason}. {b.how_to_unblock}
        </p>
      ))}
      <div><OverallBadge verdict={report.overall_verdict} /></div>
    </div>
  )
}

function Failed({ run }: { run: Run }) {
  const start = useStartRun()
  const navigate = useNavigate()
  return (
    <div className="rounded-xl border bg-background p-6">
      <p className="font-medium">This run didn't finish</p>
      <p className="mt-1 text-sm text-muted-foreground">{run.error_message || 'Something went wrong.'}</p>
      <Button className="mt-4" variant="outline" disabled={start.isPending}
        onClick={() => start.mutate({ projectId: run.project_id, input: { test_type: run.test_type } },
          { onSuccess: (n) => navigate(`/app/runs/${n.id}`), onError: (e) => toast.error(e.message) })}>
        <RotateCcw className="size-4" aria-hidden /> Try again
      </Button>
    </div>
  )
}
