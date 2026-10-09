import { AlertTriangle, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useActivity, useScenarioSteps } from '@/api/hooks'
import type { ActivityItem, Run } from '@/api/types'
import { StatusBadge, VerdictBadge } from '@/components/common/badges'
import { Lightbox } from '@/components/common/Lightbox'
import type { LiveState } from '@/hooks/useRunEvents'
import { cn } from '@/lib/utils'

const MAX_STEPS = 25

export function LiveRun({ run, live }: { run: Run; live: LiveState }) {
  const enabled = run.scenarios.filter((s) => s.enabled)
  const current = enabled.find((s) => !s.verdict)?.code ?? null
  const [selected, setSelected] = useState<string | null>(null)
  const shown = selected ?? current ?? enabled.at(-1)?.code ?? null
  const isLive = shown === current && run.status === 'RUNNING'
  const steps = useScenarioSteps(run.id, shown, isLive && !live.connected)
  const activity = useActivity(run.id, true)
  const [lightbox, setLightbox] = useState<number | null>(null)

  const shots = useMemo(
    () =>
      (steps.data ?? [])
        .filter((s) => s.screenshot_artifact_id)
        .map((s) => ({ src: `/api/artifacts/${s.screenshot_artifact_id}`, caption: `${s.index}. ${s.description}` })),
    [steps.data],
  )
  const last = steps.data?.at(-1)
  const checking = run.status === 'TRIAGING' || run.status === 'REPORTING'
  const suspected = live.suspected.filter((id) => !run.scenarios.find((s) => s.code === id)?.verdict)
  const shownScenario = run.scenarios.find((s) => s.code === shown)
  const done = enabled.filter((s) => s.verdict).length

  return (
    <div className="flex flex-col gap-4">
      {(checking || suspected.length > 0) && (
        <div role="status" className="flex items-center gap-2 border border-dashed border-foreground px-4 py-3 text-sm font-medium">
          {checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}
          {checking
            ? 'Double-checking possible problems and writing the report…'
            : `Possible issue in ${suspected.join(', ')}. Verifying…`}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)_300px]">
        {/* Scenarios */}
        <nav aria-label="Scenarios" className="order-3 border lg:order-1">
          <div className="flex justify-between border-b px-3.5 py-3 text-xs font-semibold tracking-[0.14em] uppercase">
            <span>Scenarios</span>
            <span>
              {done} of {enabled.length} done
            </span>
          </div>
          <ul>
            {enabled.map((s) => {
              const running = s.code === current && run.status === 'RUNNING'
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(s.code === current ? null : s.code)}
                    aria-current={shown === s.code}
                    className={cn(
                      'flex w-full min-w-0 flex-col gap-2 border-b px-3.5 py-3 text-left hover:bg-surface',
                      shown === s.code && 'bg-surface',
                    )}
                  >
                    <span className="flex gap-2 text-sm leading-snug">
                      <span className="w-7 shrink-0 font-heading text-[15px] font-semibold">{s.code}</span>
                      <span className={cn(running && 'font-semibold')}>{s.title}</span>
                    </span>
                    <span className="pl-9">
                      {s.verdict ? (
                        <VerdictBadge verdict={s.verdict} />
                      ) : (
                        <StatusBadge status={running ? 'RUNNING' : 'QUEUED'} label={running ? 'Running' : 'Queued'} />
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Live browser */}
        <section aria-label="Live browser" className="order-1 flex min-w-0 flex-col gap-2 lg:order-2">
          <div className="border border-foreground bg-background">
            <div className="flex items-center gap-2.5 border-b border-foreground bg-surface px-2.5 py-2">
              <span aria-hidden className="flex gap-[5px]">
                <span className="size-[9px] border border-foreground" />
                <span className="size-[9px] border border-foreground" />
                <span className="size-[9px] border border-foreground" />
              </span>
              <div className="flex h-7 min-w-0 flex-1 items-center truncate border bg-background px-2.5 font-mono text-[13px]">
                {(last?.url ?? run.site_url).replace(/^https?:\/\//, '')}
              </div>
              <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase">
                {isLive && <span aria-hidden className="size-2 bg-foreground [animation:tb-pulse_1.4s_ease-in-out_infinite]" />}
                {isLive ? 'Live' : 'Chromium'}
                {last && ` · step ${last.index}`}
              </span>
            </div>
            <button
              type="button"
              className="block w-full cursor-zoom-in bg-white text-left"
              onClick={() => shots.length && setLightbox(shots.length - 1)}
              aria-label="Open screenshots of this scenario"
            >
              {last?.screenshot_artifact_id ? (
                <img
                  src={`/api/artifacts/${last.screenshot_artifact_id}`}
                  alt={`Browser after: ${last.description}`}
                  className="w-full"
                />
              ) : (
                <div className="flex aspect-[16/10] items-center justify-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Waiting for the browser…
                </div>
              )}
            </button>
          </div>
          <div className="flex flex-col gap-1.5 border bg-surface px-4 py-3.5">
            <span className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold tracking-[0.14em] uppercase">
              <span>
                {isLive ? 'Now' : shownScenario ? `${shownScenario.code}${last ? ` · step ${last.index} of ≤${MAX_STEPS}` : ''}` : 'Starting'}
              </span>
              {shownScenario?.verdict && <VerdictBadge verdict={shownScenario.verdict} />}
            </span>
            <span className="text-[17px] leading-snug font-semibold">{last?.description ?? shownScenario?.title ?? 'Opening the site…'}</span>
            {shownScenario?.verdict && shownScenario.reason ? (
              <span className="text-[15px] leading-normal">{shownScenario.reason}</span>
            ) : (
              last?.reasoning && <span className="text-[15px] leading-normal">Why: {last.reasoning}</span>
            )}
          </div>
        </section>

        {/* Activity */}
        <section aria-label="Agent activity" className="order-2 min-w-0 border lg:order-3">
          <div className="flex justify-between border-b px-3.5 py-3 text-xs font-semibold tracking-[0.14em] uppercase">
            <span>Activity</span>
            <span>newest first</span>
          </div>
          <ActivityFeed items={activity.data ?? []} />
        </section>
      </div>

      {lightbox !== null && (
        <Lightbox images={shots} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const recent = items.slice(-30).reverse()
  if (recent.length === 0)
    return <p className="px-3.5 py-6 text-sm">The agent’s actions will appear here.</p>
  return (
    <ol className="max-h-[32rem] overflow-y-auto" aria-live="polite">
      {recent.map((a) => (
        <li key={`${a.scenario_code}-${a.index}`} className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-2.5 gap-y-1 border-b px-3.5 py-[11px]">
          <span className="font-mono text-xs leading-relaxed">{a.scenario_code}</span>
          <span className="flex min-w-0 flex-col gap-0.5 [overflow-wrap:anywhere]">
            <span className="text-sm leading-snug font-semibold">{a.description}</span>
            {a.reasoning && <span className="text-[13px] leading-snug">{a.reasoning}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}
