import { Link } from 'react-router-dom'

import { useProjects } from '@/api/hooks'
import { SiteCard } from '@/components/common/SiteCard'
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/common/states'
import { Button } from '@/components/ui/button'

/** All of the user's sites, plus the shared demo shop (new-app app bar "Sites"). */
export function Sites() {
  const projects = useProjects()
  const sites = projects.data?.filter((p) => !p.is_demo) ?? []
  const demo = projects.data?.find((p) => p.is_demo)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[clamp(40px,4vw,52px)] leading-[0.95]">Sites</h1>
          <p className="text-base">Every site you test, with its last result.</p>
        </div>
        <Button asChild size="lg">
          <Link to="/app/projects/new">+ Add site</Link>
        </Button>
      </div>

      <section aria-labelledby="my-sites" className="flex flex-col gap-3.5">
        <h2 id="my-sites" className="text-[26px] leading-none">My sites</h2>
        {projects.isError ? (
          <ErrorState message={projects.error.message} onRetry={() => projects.refetch()} />
        ) : projects.isPending ? (
          <SkeletonBlock label="Loading your sites…" />
        ) : sites.length === 0 ? (
          <EmptyState title="No sites yet">
            Add a site you own or may test. Sites behind CAPTCHA or bot protection end as Blocked.
            <div className="mt-3">
              <Button asChild variant="outline">
                <Link to="/app/projects/new">Add your site</Link>
              </Button>
            </div>
          </EmptyState>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-3">
            {sites.map((p) => (
              <SiteCard key={p.id} site={p} />
            ))}
          </div>
        )}
      </section>

      {demo && (
        <section aria-labelledby="practice" className="flex flex-col gap-3.5">
          <h2 id="practice" className="text-[26px] leading-none">Practice site</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-3">
            <SiteCard site={demo} />
          </div>
        </section>
      )}
    </div>
  )
}
