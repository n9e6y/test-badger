import { ArrowLeft, ArrowRight, Clock, DollarSign, ListChecks, RotateCcw, Square } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { TERMINAL, useCancelRun, useRecentRuns, useRun, useStartRun } from '@/api/hooks'
import type { Run, RunStatus } from '@/api/types'
import { ErrorState, FullPageSpinner } from '@/components/common/states'
import { ReportView } from '@/components/report/ReportView'
import { LiveRun } from '@/components/run/LiveRun'
import { Planning } from '@/components/run/Planning'
import { PlanReview } from '@/components/run/PlanReview'
import { Button } from '@/components/ui/button'
import { useElapsed } from '@/hooks/useElapsed'
import { useRunEvents } from '@/hooks/useRunEvents'
import { formatCost, formatDate, formatDuration, TEST_TYPE_LABEL } from '@/lib/format'

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
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-steel-400 bg-steel-100 px-4 py-3 text-sm text-steel-800 hover:bg-steel-200"
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

const KICKER: Record<RunStatus, string> = {
  QUEUED: 'Queued',
  RECON: 'Planning · exploring the site',
  PLANNING: 'Planning · writing the test plan',
  AWAITING_APPROVAL: 'Plan · waiting for your approval',
  RUNNING: 'Live · running',
  TRIAGING: 'Live · double-checking',
  REPORTING: 'Live · writing the report',
  COMPLETED: 'Report',
  FAILED: 'Run failed',
  CANCELLED: 'Run stopped',
}

function RunHeader({ run }: { run: Run }) {
  const cancel = useCancelRun()
  const elapsed = useElapsed(run.started_at, run.finished_at)
  const terminal = TERMINAL.includes(run.status)
  const active = !terminal && run.status !== 'AWAITING_APPROVAL'
  const live = ['RUNNING', 'TRIAGING', 'REPORTING'].includes(run.status)
  return (
    <div className="flex flex-col gap-3 print:gap-1">
      <Button variant="ghost" asChild className="-ml-3.5 w-fit print:hidden">
        <Link to={`/app/projects/${run.project_id}`}>
          <ArrowLeft aria-hidden /> {run.project_name}
        </Link>
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="min-w-0">
          <p className="kicker flex items-center gap-2 font-semibold">
            {live && (
              <span aria-hidden className="size-2 rounded-full bg-v-bug [animation:tb-pulse_1.4s_ease-in-out_infinite]" />
            )}
            {KICKER[run.status]}
            {terminal && ` · ${formatDate(run.created_at)}`}
          </p>
          <h1 className="mt-1 text-[clamp(26px,2.6vw,36px)]">
            {run.project_name} · {TEST_TYPE_LABEL[run.test_type] ?? run.test_type}
          </h1>
          <p className="truncate text-sm text-muted-foreground">{run.site_url}</p>
        </div>
        <div className="flex flex-wrap items-stretch gap-2.5">
          {run.started_at && (
            <div title="Time testing" className="flex items-center gap-2 border px-3 py-1.5">
              <Clock className="size-4 stroke-[1.5]" aria-hidden />
              <span className="sr-only">Elapsed time</span>
              <span role="timer" className="font-heading text-[22px] font-semibold tabular-nums">
                {formatDuration(elapsed)}
              </span>
            </div>
          )}
          <div title="AI cost so far" className="flex items-center gap-2 border px-3 py-1.5">
            <DollarSign className="size-4 stroke-[1.5]" aria-hidden />
            <span className="sr-only">AI cost so far</span>
            <span className="font-heading text-[22px] font-semibold tabular-nums">{formatCost(run.cost_usd)}</span>
          </div>
          {active && (
            <Button
              variant="outline"
              size="lg"
              className="print:hidden"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate({ runId: run.id }, { onError: (e) => toast.error(e.message) })}
            >
              <Square aria-hidden /> Stop run
            </Button>
          )}
        </div>
      </div>
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
    <div className="flex flex-col gap-1 border border-v-inc-bd bg-v-inc-bg p-6">
      <p className="font-heading text-xl font-semibold">This run didn’t finish</p>
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
      <p className="font-heading text-xl font-semibold">This run was stopped</p>
      <p className="text-sm text-muted-foreground">Start a new run whenever you’re ready.</p>
      <RetryButton run={run} label="Start again" />
    </div>
  )
}
