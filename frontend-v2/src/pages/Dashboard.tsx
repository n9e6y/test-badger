import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { type TestChoice, useMe, useProjects, useRecentRuns, useStartTests } from '@/api/hooks'
import type { RunMode } from '@/api/types'
import { RunResultBadge } from '@/components/common/badges'
import { GridPanel } from '@/components/common/GridPanel'
import { RunsTable } from '@/components/common/RunsTable'
import { SiteCard } from '@/components/common/SiteCard'
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import { allowedMode, MODES, RESERVED_NOTE, RUNS_RESERVED_NOTE } from '@/lib/mode'
import { cn } from '@/lib/utils'

/** What an owner would tell a tester about the demo shop; the 9/9 evaluation used exactly this (09 §1). */
const DEMO_STORE_GOAL = 'Valid coupon is WELCOME10, expired coupon is SUMMER24'

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

  const [wantedMode, setMode] = useState<RunMode>('thorough')
  const mode = allowedMode(wantedMode, me.data?.modes)
  const canUse = (m: RunMode) => (me.data?.modes ?? ['quick']).includes(m)
  const startDemo = (choice: TestChoice) => {
    if (!demo) return
    startRun.mutate(
      { projectId: demo.id, choice, input: { mode }, storeGoal: DEMO_STORE_GOAL },
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
  const noRuns = me.data?.runs_per_day === 0 // D34: free runs switched off
  const pending = (c: TestChoice) => startRun.isPending && startRun.variables?.choice === c

  const user = me.data
  const runsUsed = user ? user.runs_per_day - user.runs_left_today : 0
  const budgetPct =
    user?.budget_left_usd != null && user.budget_total_usd ? Math.round((user.budget_left_usd / user.budget_total_usd) * 100) : null

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[clamp(40px,4vw,52px)] leading-[0.95]">Dashboard</h1>
          <p className="text-base">Hi {firstName}. Test a site before your next release.</p>
        </div>
        <Button asChild size="lg">
          <Link to="/app/projects/new">Test your own site →</Link>
        </Button>
      </div>

      {/* Demo shop */}
      <GridPanel aria-labelledby="demo-title" className="flex flex-wrap items-center gap-x-10 gap-y-5 p-6">
        <div className="flex min-w-0 flex-[2_1_360px] flex-col gap-2">
          <p className="kicker page-label font-semibold">Demo shop</p>
          <h2 id="demo-title" className="text-[32px] leading-none">
            Try it on Pine &amp; Pebble
          </h2>
          <p className="max-w-[560px] text-base leading-normal">
            A demo store with 9 planted bugs. No setup, about 5 minutes. Watch test-badger find them.
          </p>
          <div role="radiogroup" aria-label="Mode" className="mt-1 flex w-fit border border-foreground bg-background">
            {(Object.keys(MODES) as RunMode[]).map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={mode === key}
                disabled={!canUse(key)}
                onClick={() => setMode(key)}
                title={canUse(key) ? MODES[key].text : RESERVED_NOTE}
                className={cn(
                  'min-h-9 px-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 [&+&]:border-l [&+&]:border-foreground',
                  mode === key ? 'bg-primary text-primary-foreground' : 'enabled:hover:bg-accent',
                )}
              >
                {MODES[key].label}
                <span className="ml-1.5 font-normal opacity-80">
                  ${MODES[key].cost.registration.toFixed(2)}–{MODES[key].cost.store.toFixed(2)}
                </span>
              </button>
            ))}
          </div>
          {noRuns && <p className="text-sm font-medium">{RUNS_RESERVED_NOTE}</p>}
          {!noRuns && !canUse('thorough') && <p className="text-sm">{RESERVED_NOTE}</p>}
        </div>
        <div className="flex flex-[1_1_240px] flex-col items-start gap-3 lg:items-end">
          <span className="text-sm">
            <strong className="font-heading text-[22px] font-semibold">9</strong> planted bugs ·{' '}
            <strong className="font-heading text-[22px] font-semibold">
              ~${MODES[mode].cost.store.toFixed(2)}
            </strong>{' '}
            a store test
          </span>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button size="lg" onClick={() => startDemo('store')} disabled={!demo || startRun.isPending || noRuns}>
              {pending('store') && <Loader2 className="animate-spin" aria-hidden />}
              Run demo store test
            </Button>
            <Button variant="outline" onClick={() => startDemo('registration')} disabled={!demo || startRun.isPending || noRuns}>
              {pending('registration') && <Loader2 className="animate-spin" aria-hidden />}
              Test registration
            </Button>
            <Button variant="outline" onClick={() => startDemo('both')} disabled={!demo || startRun.isPending || noRuns}>
              {pending('both') && <Loader2 className="animate-spin" aria-hidden />}
              Test both
            </Button>
          </div>
          {demo && (
            <a href={demo.base_url} target="_blank" rel="noreferrer" className="text-sm font-semibold underline underline-offset-4">
              Visit the shop ↗
            </a>
          )}
          {lastDemo && (
            <Link to={`/app/runs/${lastDemo.id}`} className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-semibold">Your last demo run</span>
              <RunResultBadge run={lastDemo} />
              <span>{formatDate(lastDemo.created_at)}</span>
            </Link>
          )}
        </div>
      </GridPanel>

      <div className="flex flex-wrap gap-6">
        {/* My sites */}
        <section aria-labelledby="sites-title" className="flex min-w-0 flex-[2_1_520px] flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="sites-title" className="text-[26px] leading-none">My sites</h2>
            <Link to="/app/projects/new" className="inline-flex min-h-10 items-center border px-3 text-[15px] font-semibold hover:bg-accent">
              + Add site
            </Link>
          </div>
          {projects.isError ? (
            <ErrorState message={projects.error.message} onRetry={() => projects.refetch()} />
          ) : projects.isPending ? (
            <SkeletonBlock label="Loading your sites…" />
          ) : sites.length === 0 ? (
            <EmptyState title="No sites yet">
              Start with the demo shop above, or add your own site.
              <div className="mt-3">
                <Button asChild variant="outline">
                  <Link to="/app/projects/new">Add your site</Link>
                </Button>
              </div>
            </EmptyState>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3">
              {sites.slice(0, 4).map((p) => (
                <SiteCard key={p.id} site={p} />
              ))}
            </div>
          )}
          {sites.length > 4 && (
            <Link to="/app/sites" className="text-[15px] font-semibold">
              All {sites.length} sites →
            </Link>
          )}
        </section>

        {/* Today */}
        <section aria-labelledby="today-title" className="flex min-w-0 flex-[1_1_280px] flex-col gap-3.5">
          <h2 id="today-title" className="flex min-h-10 items-center text-[26px] leading-none">
            Today
          </h2>
          <div className="flex flex-col gap-4 border p-[18px]">
            {user?.budget_left_usd != null && (
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">AI budget left</span>
                  <span className="font-heading text-2xl font-semibold">
                    ${user.budget_left_usd.toFixed(2)}
                    {user.budget_total_usd != null && (
                      <span className="font-sans text-[13px] font-normal"> of ${user.budget_total_usd.toFixed(2)}</span>
                    )}
                  </span>
                </div>
                {budgetPct !== null && (
                  <div
                    role="progressbar"
                    aria-valuenow={budgetPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="AI budget left"
                    className="h-2.5 border border-foreground"
                  >
                    <div className="h-full bg-foreground" style={{ width: `${budgetPct}%` }} />
                  </div>
                )}
              </div>
            )}
            <div className="flex items-baseline justify-between gap-2 border-t pt-3 first:border-t-0 first:pt-0">
              <span className="text-sm font-semibold">Runs today</span>
              <span className="font-heading text-2xl font-semibold">
                {runsUsed} <span className="font-sans text-[13px] font-normal">of {user?.runs_per_day ?? 0}</span>
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Recent runs */}
      <section aria-labelledby="runs-title" className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="runs-title" className="text-[26px] leading-none">Recent runs</h2>
          <Link to="/app/runs" className="text-[15px] font-semibold">
            All runs →
          </Link>
        </div>
        {runs.isError ? (
          <ErrorState message={runs.error.message} onRetry={() => runs.refetch()} />
        ) : runs.isPending ? (
          <SkeletonBlock label="Loading recent runs…" />
        ) : runs.data.length === 0 ? (
          <EmptyState title="No runs yet">Your test runs and their reports will show up here.</EmptyState>
        ) : (
          <RunsTable runs={runs.data.slice(0, 6)} label="Recent runs" />
        )}
      </section>
    </div>
  )
}
