import { Link } from 'react-router-dom'

import type { Project } from '@/api/types'
import { RunResultBadge } from '@/components/common/badges'
import { OwnShopNote } from '@/components/common/OwnShopNote'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'

/** A user's site with its last run (new-app dashboard "My sites"). */
export function SiteCard({ site }: { site: Project }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 border p-[18px]">
      <div className="flex flex-col gap-0.5">
        <Link to={`/app/projects/${site.id}`} className="font-heading text-[22px] leading-tight font-semibold hover:underline">
          {site.name}
        </Link>
        <span className="font-mono text-[13px] [overflow-wrap:anywhere]">{site.base_url.replace(/^https?:\/\//, '')}</span>
      </div>
      <OwnShopNote url={site.base_url} />
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-semibold">Last run</span>
        {site.last_run ? (
          <>
            <RunResultBadge run={site.last_run} />
            <span>{formatDate(site.last_run.created_at)}</span>
          </>
        ) : (
          <span>none yet</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link to={`/app/projects/${site.id}/runs/new`}>New run</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to={`/app/projects/${site.id}`}>History</Link>
        </Button>
      </div>
    </div>
  )
}
