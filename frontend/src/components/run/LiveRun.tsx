import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, MousePointerClick } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useActivity, useScenarioSteps } from '@/api/hooks'
import type { ActivityItem, Run } from '@/api/types'
import { ScenarioVerdictIcon, VerdictBadge } from '@/components/common/badges'
import { Lightbox } from '@/components/common/Lightbox'
import type { LiveState } from '@/hooks/useRunEvents'
import { cn } from '@/lib/utils'

const MAX_STEPS = 25
const ROW_RULE = 'border-b border-[color-mix(in_srgb,var(--foreground)_8%,transparent)]'

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
        <div role="status" className="flex items-center gap-2 border border-steel-400 bg-steel-100 px-4 py-3 text-sm text-steel-800">
          {checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}
          {checking
            ? 'Double-checking possible problems and writing the report…'
            : `Possible issue in ${suspected.join(', ')}. Verifying…`}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)_290px]">
        {/* Scenarios */}
        <nav aria-label="Scenarios" className="order-3 border lg:order-1">
          <div className="flex justify-between border-b px-3 py-2.5 text-[13px]">
            <strong className="font-semibold">Scenarios</strong>
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
                      'flex w-full min-w-0 flex-col gap-1.5 px-3 py-2.5 text-left hover:bg-accent',
                      ROW_RULE,
                      shown === s.code && 'bg-steel-100',
                    )}
                  >
                    <span className="text-sm leading-snug">
                      <span className="font-heading font-semibold text-steel-700">{s.code}</span> {s.title}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {s.verdict ? (
                        <VerdictBadge verdict={s.verdict} />
                      ) : (
                        <>
                          <ScenarioVerdictIcon verdict={null} running={running} />
                          {running ? 'Running' : 'Queued'}
                        </>
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
          <div className="border">
            <div className="flex items-center gap-2 border-b px-2.5 py-2 text-muted-foreground">
              <ChevronLeft className="size-4 stroke-[1.5]" aria-hidden />
              <ChevronRight className="size-4 stroke-[1.5]" aria-hidden />
              <div className="min-w-0 flex-1 truncate border px-2.5 py-0.5 font-mono text-[12.5px] text-foreground">
                {last?.url ?? run.site_url}
              </div>
              <span className="text-xs">Chromium</span>
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
                <div className="flex aspect-[16/10] items-center justify-center gap-2 text-sm text-steel-700">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Waiting for the browser…
                </div>
              )}
            </button>
          </div>
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[13px]">
            <span className="min-w-0">
              {shownScenario ? (
                <>
                  <strong className="font-semibold">
                    {shownScenario.code}
                    {last && `, step ${last.index} of ≤${MAX_STEPS}`}:
                  </strong>{' '}
                  {last?.description ?? shownScenario.title}
                </>
              ) : (
                'Starting…'
              )}
            </span>
            {shownScenario?.verdict && <VerdictBadge verdict={shownScenario.verdict} />}
          </div>
          {shownScenario?.reason && shownScenario.verdict && (
            <p className="border bg-surface px-3 py-2 text-sm">{shownScenario.reason}</p>
          )}
        </section>

        {/* Activity */}
        <section aria-label="Agent activity" className="order-2 min-w-0 border lg:order-3">
          <div className="border-b px-3 py-2.5 text-[13px]">
            <strong className="font-semibold">Agent activity</strong>
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
    return <p className="px-3 py-6 text-sm text-muted-foreground">The agent’s actions will appear here.</p>
  return (
    <ol className="max-h-[32rem] overflow-y-auto" aria-live="polite">
      {recent.map((a) => (
        <li key={`${a.scenario_code}-${a.index}`} className={cn('flex gap-2 px-3 py-2 text-[13px] leading-snug', ROW_RULE)}>
          <span className="w-9 shrink-0 pt-px font-mono text-[11.5px] text-muted-foreground">{a.scenario_code}</span>
          <MousePointerClick className="mt-0.5 size-3.5 shrink-0 stroke-[1.5] text-muted-foreground" aria-hidden />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            <span className="font-medium">{a.description}</span>
            {a.reasoning && <span className="mt-0.5 block text-muted-foreground">{a.reasoning}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}
