import { AlertTriangle, Loader2, MousePointerClick } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useActivity, useScenarioSteps } from '@/api/hooks'
import type { ActivityItem, Run } from '@/api/types'
import { ScenarioVerdictIcon, VERDICT_LABEL } from '@/components/common/badges'
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

  return (
    <div className="grid gap-4">
      {(checking || suspected.length > 0) && (
        <div role="status" className="flex items-center gap-2 rounded-xl border bg-background px-4 py-3 text-sm">
          {checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}
          {checking
            ? 'Double-checking possible problems and writing the report…'
            : `Possible issue in ${suspected.join(', ')} — verifying…`}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)_300px]">
        {/* Scenarios */}
        <nav aria-label="Checks" className="order-3 h-fit rounded-xl border bg-background p-2 lg:order-1">
          <p className="px-2 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Checks</p>
          <ul className="grid gap-0.5">
            {enabled.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelected(s.code === current ? null : s.code)}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted',
                    shown === s.code && 'bg-muted',
                  )}
                  aria-current={shown === s.code}
                >
                  <ScenarioVerdictIcon verdict={s.verdict} running={s.code === current && run.status === 'RUNNING'} />
                  <span className="text-muted-foreground">{s.code}</span>
                  <span className="min-w-0 truncate" title={s.title}>{s.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Live browser */}
        <section aria-label="Live browser" className="order-1 grid min-w-0 gap-2 lg:order-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <p className="min-w-0 truncate font-medium">
              {shownScenario ? `${shownScenario.code} · ${shownScenario.title}` : 'Starting…'}
            </p>
            {shownScenario?.verdict && <span className="shrink-0 text-muted-foreground">{VERDICT_LABEL[shownScenario.verdict]}</span>}
          </div>
          <button
            type="button"
            className="overflow-hidden rounded-xl border bg-background text-left"
            onClick={() => shots.length && setLightbox(shots.length - 1)}
            aria-label="Open screenshots"
          >
            {last?.screenshot_artifact_id ? (
              <img src={`/api/artifacts/${last.screenshot_artifact_id}`} alt={`Browser after: ${last.description}`} className="w-full" />
            ) : (
              <div className="flex aspect-[16/10] items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Waiting for the browser…
              </div>
            )}
          </button>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{last?.url ?? ''}</span>
            {last && <span className="shrink-0 tabular-nums">Step {last.index} of ≤{MAX_STEPS}</span>}
          </div>
          {shownScenario?.reason && shownScenario.verdict && (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">{shownScenario.reason}</p>
          )}
        </section>

        {/* Activity */}
        <section aria-label="Agent activity" className="order-2 h-fit rounded-xl border bg-background lg:order-3">
          <p className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Agent activity</p>
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
    return <p className="px-4 py-6 text-sm text-muted-foreground">The agent's actions will appear here.</p>
  return (
    <ol className="max-h-[32rem] divide-y overflow-y-auto" aria-live="polite">
      {recent.map((a) => (
        <li key={`${a.scenario_code}-${a.index}`} className="px-4 py-2.5 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <MousePointerClick className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-xs text-muted-foreground">{a.scenario_code}</span>
            <span className="min-w-0 truncate">{a.description}</span>
          </p>
          {a.reasoning && <p className="mt-0.5 text-muted-foreground">{a.reasoning}</p>}
        </li>
      ))}
    </ol>
  )
}
