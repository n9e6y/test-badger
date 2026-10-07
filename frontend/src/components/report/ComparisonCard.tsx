import { ArrowRight, Minus } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { CompareStatus, Comparison } from '@/api/types'
import { ToneBadge, VerdictBadge } from '@/components/common/badges'
import { Corners } from '@/components/common/Corners'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { VerdictTone } from '@/lib/verdict'

// Order = what a developer wants to see first after shipping a fix.
const STATUS: Record<CompareStatus, { label: string; tone: VerdictTone | null; rank: number }> = {
  fixed: { label: 'Fixed', tone: 'pass', rank: 0 },
  still_broken: { label: 'Still broken', tone: 'bug', rank: 1 },
  new_bug: { label: 'New bug', tone: 'bug', rank: 2 },
  unclear: { label: 'Couldn’t check', tone: 'inc', rank: 3 },
  passing: { label: 'Still passing', tone: null, rank: 4 },
}

/** D21: the re-run next to the run it re-ran, per scenario. */
export function ComparisonCard({ comparison }: { comparison: Comparison }) {
  const items = [...comparison.items].sort((a, b) => STATUS[a.status].rank - STATUS[b.status].rank)
  const n = (s: CompareStatus) => comparison.counts[s] ?? 0
  const summary = [
    `${n('fixed')} fixed`,
    `${n('still_broken')} still broken`,
    `${n('new_bug')} new`,
    ...(n('unclear') ? [`${n('unclear')} couldn’t be checked`] : []),
  ].join(' · ')

  return (
    <section aria-labelledby="compare-title" className="blueprint flex flex-col gap-4 p-[22px]">
      <Corners />
      <div>
        <p className="kicker">
          Re-run of the same plan · compared with the{' '}
          <Link to={`/app/runs/${comparison.parent_run_id}`} className="underline underline-offset-2">
            run of {formatDate(comparison.parent_created_at)}
          </Link>
        </p>
        <h2 id="compare-title" className="mt-1 text-[26px]">
          Did the fixes work?
        </h2>
        <p className="mt-0.5 text-base">{summary}</p>
      </div>
      <ul className="flex flex-col">
        {items.map((i) => {
          const s = STATUS[i.status]
          return (
            <li
              key={i.scenario_id}
              className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-b border-[color-mix(in_srgb,var(--foreground)_9%,transparent)] px-1 py-2.5 text-sm"
            >
              <span className="w-10 font-heading font-semibold text-steel-700">{i.scenario_id}</span>
              <span className="min-w-0 flex-[1_1_240px]">
                {i.title}
                {i.bug_title && <span className="block text-xs text-muted-foreground">{i.bug_title}</span>}
              </span>
              <span className="flex items-center gap-1.5" aria-label={`Before: ${i.before ?? 'not run'}, after: ${i.after ?? 'not run'}`}>
                {i.before ? <VerdictBadge verdict={i.before} /> : <Minus className="size-4 text-muted-foreground" aria-hidden />}
                <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                {i.after ? <VerdictBadge verdict={i.after} /> : <Minus className="size-4 text-muted-foreground" aria-hidden />}
              </span>
              <span className="w-32 md:text-right">
                {s.tone ? (
                  <ToneBadge tone={s.tone} label={s.label} />
                ) : (
                  <span className={cn('text-xs text-muted-foreground')}>{s.label}</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
