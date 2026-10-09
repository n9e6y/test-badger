import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { useApproveRun, useCancelRun, usePatchPlan } from '@/api/hooks'
import type { PlanScenario, Run } from '@/api/types'
import { Button } from '@/components/ui/button'
import { estimate } from '@/lib/mode'
import { cn } from '@/lib/utils'

const KIND: Record<PlanScenario['kind'], string> = {
  happy_path: 'Happy path',
  negative: 'Negative',
  edge_case: 'Edge case',
}

/** Square on/off switch (new-app plan review): ink track with a white knob when on. */
function Switch({ on, disabled, label, onChange }: { on: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        'flex h-[30px] w-[52px] shrink-0 items-center border-2 border-foreground p-[3px] disabled:opacity-60',
        on ? 'justify-end bg-foreground' : 'justify-start bg-background',
      )}
    >
      <span className={cn('size-5', on ? 'bg-background' : 'bg-foreground')} />
    </button>
  )
}

export function PlanReview({ run }: { run: Run }) {
  const patch = usePatchPlan()
  const approve = useApproveRun()
  const cancel = useCancelRun()
  const plan = run.plan
  if (!plan) return null
  const enabled = plan.scenarios.filter((s) => s.enabled)
  const onError = (e: Error) => toast.error(e.message)
  const toggle = (id: string, on: boolean) =>
    patch.mutate({ runId: run.id, body: { scenarios: [{ id, enabled: on }] } }, { onError })
  const est = estimate(run.mode, [run.test_type])

  return (
    <div className="flex flex-col gap-7">
      <div className="flex max-w-[680px] flex-col gap-1.5 text-[17px] leading-relaxed">
        <p className="text-pretty">{plan.summary}</p>
        <p>Switch off any scenario you don’t need, then approve. Nothing has been typed into your site yet.</p>
      </div>

      <ol className="flex flex-col border-t border-foreground">
        {plan.scenarios.map((s) => (
          <li key={s.id} className={cn('flex items-start gap-4 border-b py-4 transition-opacity', !s.enabled && 'opacity-55')}>
            <span className="w-9 shrink-0 font-heading text-xl leading-snug font-semibold">{s.id}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="text-[17px] leading-snug font-semibold">{s.title}</span>
                <span className="border px-1.5 text-[11px] font-semibold tracking-[0.05em] uppercase">{KIND[s.kind]}</span>
              </span>
              <span className="text-[15px] leading-normal text-pretty">
                <strong className="font-semibold">Expected:</strong> {s.expected_result}
              </span>
              {s.test_data.length > 0 && (
                <span className="self-start bg-surface px-2 py-[3px] font-mono text-[12.5px] [overflow-wrap:anywhere]">
                  {s.test_data.map((d) => d.value).join(', ')}
                </span>
              )}
            </div>
            <Switch on={s.enabled} disabled={patch.isPending} label={`Include ${s.id}: ${s.title}`} onChange={(v) => toggle(s.id, v)} />
          </li>
        ))}
      </ol>

      <div className="sticky bottom-0 -mx-4 border-t border-foreground bg-background px-4 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3.5">
          <div className="flex flex-col gap-0.5">
            <span className="font-heading text-[22px] leading-none font-semibold">
              {enabled.length} of {plan.scenarios.length} scenarios selected
            </span>
            <span className="text-sm">
              {enabled.length ? `Full plan estimated ${est.cost} · ${est.minutes}` : 'Turn on at least one scenario.'}
            </span>
          </div>
          <div className="flex max-w-[420px] flex-auto justify-end gap-2.5">
            <Button variant="outline" size="lg" disabled={cancel.isPending} onClick={() => cancel.mutate({ runId: run.id }, { onError })}>
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={approve.isPending || enabled.length === 0}
              onClick={() => approve.mutate({ runId: run.id }, { onError })}
            >
              {approve.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Approve and run
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
