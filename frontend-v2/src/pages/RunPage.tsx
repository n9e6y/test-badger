import { ArrowRight, ListChecks, RotateCcw } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { useCancelRun, useRecentRuns, useRun, useStartRun } from '@/api/hooks'
import type { Run, RunStatus } from '@/api/types'
import { StatusBadge } from '@/components/common/badges'
import { ErrorState, FullPageSpinner } from '@/components/common/states'
import { ReportView } from '@/components/report/ReportView'
import { LiveRun } from '@/components/run/LiveRun'
import { Planning } from '@/components/run/Planning'
import { PlanReview } from '@/components/run/PlanReview'
import { Button } from '@/components/ui/button'
import { useElapsed } from '@/hooks/useElapsed'
import { useRunEvents } from '@/hooks/useRunEvents'
import { formatDate, formatDuration, TEST_TYPE_LABEL } from '@/lib/format'
import { MODES } from '@/lib/mode'
import { cn } from '@/lib/utils'

/** One route for the whole run: the view is chosen by run.status, so refresh always lands right. */
export function RunPage() {
  const { runId = '' } = useParams()
  const live = useRunEvents(runId)
  const run = useRun(runId, live.connected)

  if (run.isPending) return <FullPageSpinner />
  if (run.isError) return <ErrorState message={run.error.message} onRetry={() => run.refetch()} />
  const r = run.data
  const planning = r.status === 'RECON' || r.status === 'PLANNING' || (r.status === 'QUEUED' && !r.plan)

  return (
    <div className="flex flex-col gap-6">
      <RunHeader run={r} />
      <OtherPlans currentId={r.id} />
      {planning ? (
        <Planning run={r} reconPages={live.reconPages} />
      ) : r.status === 'AWAITING_APPROVAL' ? (
        <PlanReview run={r} />
      ) : r.status === 'COMPLETED' && r.report ? (
        <ReportView run={r} report={r.report} />
      ) : r.status === 'FAILED' ? (
        <Failed run={r} />
      ) : r.status === 'CANCELLED' ? (
        <Cancelled run={r} />
      ) : (
        <LiveRun run={r} live={live} />
      )}
    </div>
  )
}

const NOT_STARTED: RunStatus[] = ['QUEUED', 'RECON', 'PLANNING', 'AWAITING_APPROVAL']

/** Points to the user's other runs that still need a plan approval (e.g. the second run of "Both"). */
function OtherPlans({ currentId }: { currentId: string }) {
  const runs = useRecentRuns(10_000)
  const others = (runs.data ?? []).filter((x) => x.id !== currentId && NOT_STARTED.includes(x.status))
  if (others.length === 0) return null
  return (
    <ul className="flex flex-col gap-2 print:hidden">
      {others.map((o) => (
        <li key={o.id}>
          <Link
            to={`/app/runs/${o.id}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-dashed border-foreground px-4 py-3 text-sm hover:bg-surface"
          >
            <ListChecks className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              {o.status === 'AWAITING_APPROVAL' ? 'Another test plan is waiting for your approval: ' : 'Another test is being planned: '}
              <strong className="font-semibold">
                {o.project_name} · {TEST_TYPE_LABEL[o.test_type] ?? o.test_type}
              </strong>
            </span>
            <span className="inline-flex items-center gap-1 font-heading font-semibold">
              Open <ArrowRight className="size-4" aria-hidden />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

const PILL_LABEL: Partial<Record<RunStatus, string>> = {
  QUEUED: 'Queued',
  RECON: 'Planning · digging through the site',
  PLANNING: 'Planning · writing the test plan',
  AWAITING_APPROVAL: 'Waiting for your approval',
  TRIAGING: 'Double-checking possible bugs',
  REPORTING: 'Writing the report',
}

const SEGMENT: Record<string, string> = {
  PASSED: 'bg-v-pass',
  BUG_FOUND: 'bg-v-bug',
  BLOCKED: 'bg-v-blocked',
  INCONCLUSIVE: 'bg-v-inc',
}

const LIVE: RunStatus[] = ['RUNNING', 'TRIAGING', 'REPORTING']

function Breadcrumb({ run, last }: { run: Run; last: string }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm print:hidden">
      <Link to={`/app/projects/${run.project_id}`} className="font-semibold underline-offset-4 hover:underline">
        {run.project_name}
      </Link>
      <span aria-hidden>/</span>
      <span>{last}</span>
    </nav>
  )
}

/** Header per run state (new-app designs: plan review, live run, report). */
function RunHeader({ run }: { run: Run }) {
  const cancel = useCancelRun()
  const elapsed = useElapsed(run.started_at, run.finished_at)
  const testLine = `${TEST_TYPE_LABEL[run.test_type] ?? run.test_type} · ${MODES[run.mode].label}`
  const onCancel = () => cancel.mutate({ runId: run.id }, { onError: (e) => toast.error(e.message) })
  const reRunOf = run.parent_run_id && (
    <Link to={`/app/runs/${run.parent_run_id}`} className="text-sm underline underline-offset-2">
      Re-run of an earlier run
    </Link>
  )

  if (run.status === 'COMPLETED')
    return (
      <div className="flex flex-col gap-2">
        <Breadcrumb run={run} last="Runs" />
        <h1 className="text-[clamp(40px,4vw,52px)] leading-[0.95]">Test report</h1>
        <p className="flex flex-wrap gap-x-3 text-[15px]">
          <span>
            {testLine} · {formatDate(run.created_at)}
          </span>
          <span className="font-mono text-sm break-all">{run.site_url.replace(/^https?:\/\//, '')}</span>
          {reRunOf}
        </p>
      </div>
    )

  if (LIVE.includes(run.status) || (run.status === 'QUEUED' && run.plan)) {
    const enabled = run.scenarios.filter((s) => s.enabled)
    const currentIdx = enabled.findIndex((s) => !s.verdict)
    const label =
      run.status === 'RUNNING' && currentIdx >= 0
        ? `Running · scenario ${currentIdx + 1} of ${enabled.length}`
        : (PILL_LABEL[run.status] ?? 'Running')
    const done = enabled.filter((s) => s.verdict).length
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusBadge status={run.status === 'QUEUED' ? 'RUNNING' : run.status} label={label} />
            <span className="text-sm">{testLine}</span>
            {reRunOf}
          </div>
          <h1 className="text-[clamp(30px,3vw,40px)] leading-none">{run.project_name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          {run.started_at && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold tracking-[0.14em] uppercase">Time</span>
              <span role="timer" className="font-heading text-[34px] leading-none font-semibold tabular-nums">
                {formatDuration(elapsed)}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold tracking-[0.14em] uppercase">AI cost</span>
            <span className="font-heading text-[34px] leading-none font-semibold tabular-nums">${run.cost_usd.toFixed(2)}</span>
          </div>
          <Button variant="outline" className="min-h-11" disabled={cancel.isPending} onClick={onCancel}>
            Cancel run
          </Button>
        </div>
        <div
          role="progressbar"
          aria-label={`Progress: ${done} of ${enabled.length} scenarios done`}
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={enabled.length}
          className="grid basis-full gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, enabled.length)}, minmax(0, 1fr))` }}
        >
          {enabled.map((s, k) => (
            <span
              key={s.id}
              className={cn('h-1.5', s.verdict ? SEGMENT[s.verdict] : k === currentIdx ? 'bg-foreground' : 'bg-[#e4e4e4]')}
            />
          ))}
        </div>
      </div>
    )
  }

  const title =
    run.status === 'AWAITING_APPROVAL'
      ? 'Review the test plan'
      : run.status === 'FAILED'
        ? 'This run didn’t finish'
        : run.status === 'CANCELLED'
          ? 'Run stopped'
          : 'Building the test plan'
  const planning = ['QUEUED', 'RECON', 'PLANNING'].includes(run.status)
  return (
    <div className="flex flex-col gap-3">
      <Breadcrumb run={run} last={testLine} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusBadge status={run.status} label={PILL_LABEL[run.status]} />
        {planning && (
          <Button variant="outline" className="min-h-11" disabled={cancel.isPending} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      <h1 className="text-[clamp(40px,4vw,52px)] leading-[0.95]">{title}</h1>
      {reRunOf}
    </div>
  )
}

function RetryButton({ run, label = 'Try again' }: { run: Run; label?: string }) {
  const start = useStartRun()
  const navigate = useNavigate()
  return (
    <Button
      className="mt-2 w-fit"
      variant="outline"
      disabled={start.isPending}
      onClick={() =>
        start.mutate(
          { projectId: run.project_id, input: { test_type: run.test_type, goal_text: run.goal_text ?? undefined } },
          { onSuccess: (n) => navigate(`/app/runs/${n.id}`), onError: (e) => toast.error(e.message) },
        )
      }
    >
      <RotateCcw aria-hidden /> {label}
    </Button>
  )
}

function Failed({ run }: { run: Run }) {
  return (
    <div role="alert" className="flex flex-col gap-1 border-2 border-foreground p-6">
      <p className="font-heading text-[21px] font-semibold">Something went wrong</p>
      <p className="text-sm">{run.error_message || 'Something went wrong on our side.'}</p>
      {run.scenarios.some((s) => s.verdict) && (
        <p className="text-sm text-muted-foreground">Checks finished before the problem are kept in your run history.</p>
      )}
      <RetryButton run={run} />
    </div>
  )
}

function Cancelled({ run }: { run: Run }) {
  return (
    <div className="flex flex-col gap-1 border p-6">
      <p className="text-sm">This run was stopped before it finished. Start a new run whenever you’re ready.</p>
      <RetryButton run={run} label="Start again" />
    </div>
  )
}
