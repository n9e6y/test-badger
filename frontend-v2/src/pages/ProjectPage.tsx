import { Link, useParams } from 'react-router-dom'

import { useProject } from '@/api/hooks'
import { OwnShopNote } from '@/components/common/OwnShopNote'
import { RunsTable } from '@/components/common/RunsTable'
import { EmptyState, ErrorState, FullPageSpinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'

export function ProjectPage() {
  const { projectId = '' } = useParams()
  const project = useProject(projectId)
  if (project.isPending) return <FullPageSpinner />
  if (project.isError) return <ErrorState message={project.error.message} onRetry={() => project.refetch()} />
  const p = project.data

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="flex gap-2 text-sm">
        <Link to="/app/sites" className="font-semibold underline-offset-4 hover:underline">
          Sites
        </Link>
        <span aria-hidden>/</span>
        <span>{p.name}</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-[clamp(40px,4vw,52px)] leading-[0.95]">{p.name}</h1>
          <span className="font-mono text-sm break-all">{p.base_url.replace(/^https?:\/\//, '')}</span>
          {p.is_demo && <p className="text-base">Our demo store with 9 planted bugs. Try both test types.</p>}
          {!p.is_demo && <OwnShopNote url={p.base_url} />}
        </div>
        <Button asChild size="lg">
          <Link to={`/app/projects/${p.id}/runs/new`}>New run →</Link>
        </Button>
      </div>

      <section aria-labelledby="history-title" className="flex flex-col gap-3">
        <h2 id="history-title" className="text-[26px]">Run history</h2>
        {p.runs.length === 0 ? (
          <EmptyState title="No runs yet">Start your first test with “New run”.</EmptyState>
        ) : (
          <RunsTable runs={p.runs} showSite={false} label="Run history" />
        )}
      </section>
    </div>
  )
}
