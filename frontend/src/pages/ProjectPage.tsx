import { ArrowLeft, Play } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { useProject } from '@/api/hooks'
import { OverallBadge, StatusBadge } from '@/components/common/badges'
import { EmptyState, ErrorState, FullPageSpinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { formatCost, formatDate, TEST_TYPE_LABEL } from '@/lib/format'

export function ProjectPage() {
  const { projectId = '' } = useParams()
  const project = useProject(projectId)
  if (project.isPending) return <FullPageSpinner />
  if (project.isError) return <ErrorState message={project.error.message} onRetry={() => project.refetch()} />
  const p = project.data

  return (
    <div className="grid gap-6">
      <Link to="/app" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Dashboard
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <p className="truncate text-muted-foreground">{p.base_url}</p>
          {p.is_demo && <p className="mt-1 text-sm text-muted-foreground">Our demo store with hidden bugs — try both test types.</p>}
        </div>
        <Button asChild size="lg">
          <Link to={`/app/projects/${p.id}/runs/new`}>
            <Play className="size-4" aria-hidden /> New test run
          </Link>
        </Button>
      </div>

      <section className="grid gap-3">
        <h2 className="font-medium">Run history</h2>
        {p.runs.length === 0 ? (
          <EmptyState title="No runs yet">Start your first test.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-background">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Test</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                  <th className="px-4 py-3 text-right font-medium">Problems</th>
                  <th className="px-4 py-3 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {p.runs.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link to={`/app/runs/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                        {formatDate(r.created_at)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{TEST_TYPE_LABEL[r.test_type]}</td>
                    <td className="px-4 py-3">
                      {r.overall_verdict ? <OverallBadge verdict={r.overall_verdict} /> : <StatusBadge status={r.status} />}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.findings_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCost(r.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
