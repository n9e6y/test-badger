import { FlaskConical, Loader2, Plus, ShoppingCart, UserPlus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useMe, useProjects, useRecentRuns, useStartRun } from '@/api/hooks'
import type { TestType } from '@/api/types'
import { OverallBadge, StatusBadge } from '@/components/common/badges'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { formatDate, TEST_TYPE_LABEL } from '@/lib/format'

export function Dashboard() {
  const me = useMe()
  const projects = useProjects()
  const runs = useRecentRuns()
  const startRun = useStartRun()
  const navigate = useNavigate()
  const demo = projects.data?.find((p) => p.is_demo)
  const sites = projects.data?.filter((p) => !p.is_demo) ?? []
  const firstName = me.data?.name.split(' ')[0]

  const startDemo = (testType: TestType) => {
    if (!demo) return
    startRun.mutate(
      { projectId: demo.id, input: { test_type: testType } },
      {
        onSuccess: (run) => navigate(`/app/runs/${run.id}`),
        onError: (err) => toast.error(err.message),
      },
    )
  }
  const pending = (t: TestType) => startRun.isPending && startRun.variables?.input.test_type === t

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hi {firstName}</h1>
        <p className="text-muted-foreground">Check your site's key flows before you release.</p>
      </div>

      <section className="rounded-xl border-2 border-primary/20 bg-background p-6">
        <div className="flex items-start gap-3">
          <FlaskConical className="mt-0.5 size-5" aria-hidden />
          <div className="flex-1">
            <h2 className="font-medium">Try it on our demo shop</h2>
            <p className="text-sm text-muted-foreground">
              A real store with hidden bugs. See what the agent finds in about 5 minutes.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => startDemo('registration')} disabled={!demo || startRun.isPending}>
                {pending('registration') ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <UserPlus className="size-4" aria-hidden />
                )}
                Test registration
              </Button>
              <Button variant="outline" onClick={() => startDemo('store')} disabled={!demo || startRun.isPending}>
                {pending('store') ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <ShoppingCart className="size-4" aria-hidden />
                )}
                Test store &amp; checkout
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">My sites</h2>
          <Button variant="outline" size="sm" disabled title="Coming soon">
            <Plus className="size-4" aria-hidden />
            Add a site
          </Button>
        </div>
        {projects.isError ? (
          <ErrorState message={projects.error.message} onRetry={() => projects.refetch()} />
        ) : sites.length === 0 ? (
          <EmptyState title="No sites yet">Start with the demo shop above, or add your own site.</EmptyState>
        ) : (
          <ul className="divide-y rounded-lg border bg-background">
            {sites.map((p) => (
              <li key={p.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-muted-foreground">{p.base_url}</p>
                </div>
                {p.last_run?.overall_verdict && <OverallBadge verdict={p.last_run.overall_verdict} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="font-medium">Recent runs</h2>
        {runs.isError ? (
          <ErrorState message={runs.error.message} onRetry={() => runs.refetch()} />
        ) : !runs.data || runs.data.length === 0 ? (
          <EmptyState title="No runs yet">Your test runs will show up here.</EmptyState>
        ) : (
          <ul className="divide-y rounded-lg border bg-background">
            {runs.data.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/app/runs/${r.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-muted/40"
                >
                  <div>
                    <p className="font-medium">{r.project_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {TEST_TYPE_LABEL[r.test_type]} · {formatDate(r.created_at)}
                    </p>
                  </div>
                  {r.overall_verdict ? <OverallBadge verdict={r.overall_verdict} /> : <StatusBadge status={r.status} />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
