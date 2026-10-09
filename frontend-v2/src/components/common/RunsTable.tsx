import { Link } from 'react-router-dom'

import type { RunSummary } from '@/api/types'
import { RunResultBadge } from '@/components/common/badges'
import { formatCost, formatDate, TEST_TYPE_LABEL } from '@/lib/format'
import { MODES } from '@/lib/mode'

const TH = 'border-b border-foreground px-3 py-2.5 text-[11px] font-semibold tracking-[0.14em] uppercase'
const TD = 'border-b px-3 py-3'

const testLabel = (r: RunSummary) => (TEST_TYPE_LABEL[r.test_type] ?? r.test_type).replace(' & checkout', '').replace(' test', '')

/** Runs as a table on desktop and a stacked list on a phone (new-app dashboard "Recent runs"). */
export function RunsTable({ runs, showSite = true, label }: { runs: RunSummary[]; showSite?: boolean; label: string }) {
  return (
    <>
      <table aria-label={label} className="hidden w-full border-collapse text-[15px] leading-snug md:table">
        <thead>
          <tr>
            <th className={`${TH} pl-0 text-left`}>{showSite ? 'Site' : 'Run'}</th>
            <th className={`${TH} text-left`}>Test</th>
            <th className={`${TH} text-left`}>Mode</th>
            <th className={`${TH} text-left`}>Result</th>
            <th className={`${TH} text-right`}>Cost</th>
            <th className={`${TH} pr-0 text-right`}>Started</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="relative hover:bg-surface">
              <td className={`${TD} pl-0 font-semibold`}>
                <Link to={`/app/runs/${r.id}`} className="after:absolute after:inset-0">
                  {showSite ? r.project_name : formatDate(r.created_at)}
                </Link>
                {r.parent_run_id && <span className="ml-2 border px-1.5 text-[11px] font-normal">Re-run</span>}
              </td>
              <td className={TD}>{testLabel(r)}</td>
              <td className={TD}>{MODES[r.mode].label}</td>
              <td className={TD}>
                <RunResultBadge run={r} />
              </td>
              <td className={`${TD} text-right tabular-nums`}>{formatCost(r.cost_usd)}</td>
              <td className={`${TD} pr-0 text-right`}>{formatDate(r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul aria-label={label} className="flex flex-col border-t border-foreground md:hidden">
        {runs.map((r) => (
          <li key={r.id}>
            <Link to={`/app/runs/${r.id}`} className="flex flex-col gap-2 border-b py-3.5">
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{showSite ? r.project_name : testLabel(r)}</span>
                <span className="text-[13px]">{formatDate(r.created_at)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                <RunResultBadge run={r} />
                <span>
                  {testLabel(r)} · {MODES[r.mode].label}
                </span>
                <span className="tabular-nums">{formatCost(r.cost_usd)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
