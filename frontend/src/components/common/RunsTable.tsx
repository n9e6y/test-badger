import { Link } from 'react-router-dom'

import type { RunSummary } from '@/api/types'
import { OverallBadge, StatusBadge } from '@/components/common/badges'
import { formatCost, formatDate, TEST_TYPE_LABEL } from '@/lib/format'
import { MODES } from '@/lib/mode'

const ROW_RULE = 'border-b border-[color-mix(in_srgb,var(--foreground)_9%,transparent)]'

/** Run list used on the dashboard and the site page. Rows wrap into stacked items on a phone. */
export function RunsTable({ runs, showSite = true, label }: { runs: RunSummary[]; showSite?: boolean; label: string }) {
  return (
    <div role="table" aria-label={label} className="flex flex-col">
      <div
        role="row"
        className="hidden gap-3.5 border-b px-2 py-2 text-[11px] tracking-[0.08em] text-muted-foreground uppercase md:flex"
      >
        <span role="columnheader" className="flex-[1_1_240px]">
          {showSite ? 'Site · test' : 'Test'}
        </span>
        <span role="columnheader" className="w-36">Result</span>
        <span role="columnheader" className="w-14 text-right">Bugs</span>
        <span role="columnheader" className="w-16 text-right">Cost</span>
        <span role="columnheader" className="w-40 text-right">Started</span>
      </div>
      {runs.map((r) => (
        <Link
          key={r.id}
          to={`/app/runs/${r.id}`}
          role="row"
          className={`flex min-h-11 flex-wrap items-center gap-x-3.5 gap-y-1.5 px-2 py-3 text-sm hover:bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] ${ROW_RULE}`}
        >
          <span role="cell" className="min-w-0 flex-[1_1_240px]">
            {showSite && <strong className="font-semibold">{r.project_name} · </strong>}
            {TEST_TYPE_LABEL[r.test_type] ?? r.test_type}
            <span className="ml-2 border px-1.5 text-[11px] text-muted-foreground">{MODES[r.mode].label}</span>
            {r.parent_run_id && (
              <span className="ml-2 border border-steel-400 px-1.5 text-[11px] text-steel-700">Re-run</span>
            )}
          </span>
          <span role="cell" className="w-36">
            {r.overall_verdict ? <OverallBadge verdict={r.overall_verdict} /> : <StatusBadge status={r.status} />}
          </span>
          <span role="cell" className="w-14 tabular-nums md:text-right">
            <span className="md:hidden">Bugs: </span>
            {r.findings_count}
          </span>
          <span role="cell" className="w-16 tabular-nums md:text-right">{formatCost(r.cost_usd)}</span>
          <span role="cell" className="text-muted-foreground md:w-40 md:text-right">{formatDate(r.created_at)}</span>
        </Link>
      ))}
    </div>
  )
}
