import { Globe, History, Layers, Loader2, Play, Plus, ShoppingCart, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { type TestChoice, useMe, useProjects, useRecentRuns, useStartTests } from '@/api/hooks'
import type { RunMode } from '@/api/types'
import { OverallBadge, StatusBadge } from '@/components/common/badges'
import { Corners } from '@/components/common/Corners'
import { RunsTable } from '@/components/common/RunsTable'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { formatCost, formatDate, TEST_TYPE_LABEL } from '@/lib/format'
import { MODES } from '@/lib/mode'
import { cn } from '@/lib/utils'

export function Dashboard() {
  const me = useMe()
  const projects = useProjects()
  const runs = useRecentRuns()
  const startRun = useStartTests()
  const navigate = useNavigate()
  const demo = projects.data?.find((p) => p.is_demo)
  const sites = projects.data?.filter((p) => !p.is_demo) ?? []
  const firstName = me.data?.name.split(' ')[0]
  const lastDemo = demo ? runs.data?.find((r) => r.project_id === demo.id) : undefined

  const [mode, setMode] = useState<RunMode>('thorough')
  const startDemo = (choice: TestChoice) => {
    if (!demo) return
    startRun.mutate(
      { projectId: demo.id, choice, input: { mode } },
      {
        onSuccess: ({ runs, notStarted }) => {
          if (notStarted) toast.error(`The Store run was not started: ${notStarted}`)
          else if (runs.length > 1) toast.success('Two runs started. The Store plan will be waiting for you too.')
          navigate(`/app/runs/${runs[0].id}`)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }
  const pending = (c: TestChoice) => startRun.isPending && startRun.variables?.choice === c

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[clamp(30px,3vw,40px)]">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Hi {firstName}. Check your site’s key flows before you release.
          </p>
        </div>
        <Button asChild size="lg" className="blueprint">
          <Link to="/app/projects/new">
            <Corners />
            <Plus aria-hidden />
            Test your own site
          </Link>
        </Button>
      </div>

      {/* Demo shop */}
      <section aria-labelledby="demo-title" className="blueprint flex flex-wrap items-center gap-x-8 gap-y-5 p-[22px]">
        <Corners />
        <div className="flex min-w-0 flex-[2_1_340px] flex-col gap-2">
          <p className="kicker flex items-center gap-2">
            <ShoppingCart className="size-4 stroke-[1.5]" aria-hidden /> Practice site
          </p>
          <h2 id="demo-title" className="text-[26px]">Demo shop</h2>
          <p className="max-w-[40em] text-pretty">
            A small store with 9 planted bugs in signup, cart and checkout. Run a test here to see the full flow (plan,
            live run, report) in about 5 minutes before you test your own site.
          </p>
          <div role="radiogroup" aria-label="Mode" className="mt-1 flex w-fit border">
            {(Object.keys(MODES) as RunMode[]).map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={mode === key}
                onClick={() => setMode(key)}
                title={MODES[key].text}
                className={cn(
                  'min-h-9 px-3.5 text-sm [&+&]:border-l',
                  mode === key ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
              >
                {MODES[key].label}
                <span className="ml-1.5 opacity-80">
                  ${MODES[key].cost.registration.toFixed(2)}–{MODES[key].cost.store.toFixed(2)}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2.5">
            <Button variant="outline" onClick={() => startDemo('registration')} disabled={!demo || startRun.isPending}>
              {pending('registration') ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}
              Test registration
            </Button>
            <Button variant="outline" onClick={() => startDemo('store')} disabled={!demo || startRun.isPending}>
              {pending('store') ? <Loader2 className="animate-spin" aria-hidden /> : <ShoppingCart aria-hidden />}
              Test store &amp; checkout
            </Button>
            <Button variant="outline" onClick={() => startDemo('both')} disabled={!demo || startRun.isPending}>
              {pending('both') ? <Loader2 className="animate-spin" aria-hidden /> : <Layers aria-hidden />}
              Test both
            </Button>
            {demo && (
              <Button variant="ghost" asChild>
                <a href={demo.base_url} target="_blank" rel="noreferrer">
                  Visit the shop
                </a>
              </Button>
            )}
          </div>
        </div>
        {lastDemo && (
          <Link
            to={`/app/runs/${lastDemo.id}`}
            className="flex flex-[1_1_220px] flex-col gap-1.5 border px-4 py-3.5 hover:bg-accent"
          >
            <span className="text-xs text-muted-foreground">Your last demo run · {formatDate(lastDemo.created_at)}</span>
            {lastDemo.overall_verdict ? (
              <OverallBadge verdict={lastDemo.overall_verdict} />
            ) : (
              <StatusBadge status={lastDemo.status} />
            )}
            <span className="text-sm">
              {TEST_TYPE_LABEL[lastDemo.test_type]} · {lastDemo.findings_count} {lastDemo.findings_count === 1 ? 'bug' : 'bugs'} · {formatCost(lastDemo.cost_usd)}
            </span>
          </Link>
        )}
      </section>

      {/* My sites */}
      <section aria-labelledby="sites-title" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="sites-title" className="text-[26px]">My sites</h2>
          <Button variant="ghost" asChild>
            <Link to="/app/projects/new">
              <Plus aria-hidden /> Add site
            </Link>
          </Button>
        </div>
        {projects.isError ? (
          <ErrorState message={projects.error.message} onRetry={() => projects.refetch()} />
        ) : projects.isPending ? (
          <div className="h-32 animate-pulse bg-muted" />
        ) : sites.length === 0 ? (
          <EmptyState title="No sites yet">
            Add your own site to test it, or start with the demo shop above.
            <div className="mt-3">
              <Button asChild variant="outline">
                <Link to="/app/projects/new">
                  <Plus aria-hidden /> Add your site
                </Link>
              </Button>
            </div>
          </EmptyState>
        ) : (
          <div className="grid gap-5 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
            {sites.map((p) => (
              <div key={p.id} className="blueprint flex min-w-0 flex-col gap-2.5 p-[18px]">
                <Corners />
                <h3 className="text-xl">{p.name}</h3>
                <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                  <Globe className="size-4 shrink-0 stroke-[1.5]" aria-hidden />
                  <span className="break-all">{p.base_url}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                  {p.last_run ? (
                    <>
                      {p.last_run.overall_verdict ? (
                        <OverallBadge verdict={p.last_run.overall_verdict} />
                      ) : (
                        <StatusBadge status={p.last_run.status} />
                      )}
                      <span>{formatDate(p.last_run.created_at)}</span>
                    </>
                  ) : (
                    <span>No runs yet</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Button variant="outline" asChild>
                    <Link to={`/app/projects/${p.id}/runs/new`}>
                      <Play aria-hidden /> New run
                    </Link>
                  </Button>
                  <Button variant="ghost" asChild>
                    <Link to={`/app/projects/${p.id}`}>
                      <History aria-hidden /> History
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent runs */}
      <section aria-labelledby="runs-title" className="flex flex-col gap-3">
        <h2 id="runs-title" className="text-[26px]">Recent runs</h2>
        {runs.isError ? (
          <ErrorState message={runs.error.message} onRetry={() => runs.refetch()} />
        ) : runs.isPending ? (
          <div className="h-32 animate-pulse bg-muted" />
        ) : runs.data.length === 0 ? (
          <EmptyState title="No runs yet">Your test runs and their reports will show up here.</EmptyState>
        ) : (
          <RunsTable runs={runs.data} label="Recent runs" />
        )}
      </section>
    </div>
  )
}
