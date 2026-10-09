import { ArrowLeft, Globe, Play } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { useProject } from '@/api/hooks'
import { Corners } from '@/components/common/Corners'
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
      <Button variant="ghost" asChild className="-ml-3.5 w-fit">
        <Link to="/app">
          <ArrowLeft aria-hidden /> Dashboard
        </Link>
      </Button>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Globe className="size-4 shrink-0 stroke-[1.5]" aria-hidden />
            <span className="break-all">{p.base_url}</span>
          </p>
          <h1 className="mt-1.5 text-[clamp(30px,3vw,40px)]">{p.name}</h1>
          {p.is_demo && (
            <p className="mt-1 text-muted-foreground">Our demo store with 9 planted bugs. Try both test types.</p>
          )}
          {!p.is_demo && <OwnShopNote url={p.base_url} className="mt-1.5" />}
        </div>
        <Button asChild size="lg" className="blueprint">
          <Link to={`/app/projects/${p.id}/runs/new`}>
            <Corners />
            <Play aria-hidden /> New run
          </Link>
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
