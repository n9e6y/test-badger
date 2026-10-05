import { ArrowLeft, Clock, RotateCcw } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { TERMINAL, useCancelRun, useRun, useStartRun } from '@/api/hooks'
import type { Run } from '@/api/types'
import { StatusBadge } from '@/components/common/badges'
import { ErrorState, FullPageSpinner } from '@/components/common/states'
import { ReportView } from '@/components/report/ReportView'
import { LiveRun } from '@/components/run/LiveRun'
import { Planning } from '@/components/run/Planning'
import { PlanReview } from '@/components/run/PlanReview'
import { Button } from '@/components/ui/button'
import { useElapsed } from '@/hooks/useElapsed'
import { useRunEvents } from '@/hooks/useRunEvents'
import { formatCost, formatDuration, TEST_TYPE_LABEL } from '@/lib/format'

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
    <div className="grid gap-6">
      <RunHeader run={r} />
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

function RunHeader({ run }: { run: Run }) {
  const cancel = useCancelRun()
  const elapsed = useElapsed(run.started_at, run.finished_at)
  const active = !TERMINAL.includes(run.status) && run.status !== 'AWAITING_APPROVAL'
  return (
    <div className="grid gap-2 print:hidden">
      <Link to={`/app/projects/${run.project_id}`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {run.project_name}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{TEST_TYPE_LABEL[run.test_type]}</h1>
          <p className="truncate text-sm text-muted-foreground">{run.site_url}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <StatusBadge status={run.status} />
          {run.started_at && (
            <span className="flex items-center gap-1 tabular-nums text-muted-foreground" title="Time testing">
              <Clock className="size-3.5" aria-hidden /> {formatDuration(elapsed)}
            </span>
          )}
          <span className="tabular-nums text-muted-foreground" title="AI cost so far">{formatCost(run.cost_usd)}</span>
          {active && (
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

function RetryButton({ run, label = 'Try again' }: { run: Run; label?: string }) {
  const start = useStartRun()
  const navigate = useNavigate()
  return (
    <Button className="mt-4" variant="outline" disabled={start.isPending}
      onClick={() => start.mutate({ projectId: run.project_id, input: { test_type: run.test_type, goal_text: run.goal_text ?? undefined } },
        { onSuccess: (n) => navigate(`/app/runs/${n.id}`), onError: (e) => toast.error(e.message) })}>
      <RotateCcw className="size-4" aria-hidden /> {label}
    </Button>
  )
}

function Failed({ run }: { run: Run }) {
  return (
    <div className="rounded-xl border bg-background p-6">
      <p className="font-medium">This run didn't finish</p>
      <p className="mt-1 text-sm text-muted-foreground">{run.error_message || 'Something went wrong on our side.'}</p>
      {run.scenarios.some((s) => s.verdict) && (
        <p className="mt-1 text-sm text-muted-foreground">Checks finished before the problem are kept in your run history.</p>
      )}
      <RetryButton run={run} />
    </div>
  )
}

function Cancelled({ run }: { run: Run }) {
  return (
    <div className="rounded-xl border bg-background p-6">
      <p className="font-medium">This run was stopped</p>
      <p className="mt-1 text-sm text-muted-foreground">Start a new run whenever you're ready.</p>
      <RetryButton run={run} label="Start again" />
    </div>
  )
}
