import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { useApproveRun, useCancelRun, usePatchPlan } from '@/api/hooks'
import type { PlanScenario, Run } from '@/api/types'
import { Corners } from '@/components/common/Corners'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const KIND: Record<PlanScenario['kind'], string> = {
  happy_path: 'Happy path',
  negative: 'Negative',
  edge_case: 'Edge case',
}

/** Square on/off switch from the design. */
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
        'mt-0.5 flex h-6 w-[42px] shrink-0 items-center border p-[3px] disabled:opacity-60',
        on ? 'justify-end border-primary bg-primary' : 'justify-start border-input bg-transparent',
      )}
    >
      <span className={cn('size-4', on ? 'bg-primary-foreground' : 'bg-muted-foreground')} />
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

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5">
      <div>
        <h2 className="text-[clamp(26px,2.6vw,34px)]">Review the test plan</h2>
        <p className="mt-1.5 max-w-[44em] text-pretty">{plan.summary}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Switch off any scenario you don’t need, then approve. Nothing has been tested yet.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-2.5 text-sm">
        <span>
          <strong className="font-semibold">
            {enabled.length} of {plan.scenarios.length}
          </strong>{' '}
          selected · about {Math.max(1, enabled.length)} min
        </span>
      </div>

      <ol className="flex flex-col">
        {plan.scenarios.map((s) => (
          <li
            key={s.id}
            className="flex items-start gap-3.5 border-b border-[color-mix(in_srgb,var(--foreground)_9%,transparent)] px-1 py-3.5"
          >
            <Switch on={s.enabled} disabled={patch.isPending} label={`Include ${s.id}: ${s.title}`} onChange={(v) => toggle(s.id, v)} />
            <div className={cn('min-w-0 flex-1 transition-opacity', !s.enabled && 'opacity-55')}>
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="font-heading text-[15px] font-semibold text-ink-700">{s.id}</span>
                <span className="font-semibold">{s.title}</span>
                <span className="border px-1.5 text-[11px] text-muted-foreground">{KIND[s.kind]}</span>
              </div>
              <p className="mt-0.5 text-sm text-pretty">
                <span className="text-muted-foreground">Expected: </span>
                {s.expected_result}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="break-all">Starts at {s.start_url}</span>
                {s.test_data.length > 0 && (
                  <span>
                    Test data:{' '}
                    {s.test_data.map((d) => (
                      <code key={d.key + d.value} className="mr-1 border px-1 font-mono text-[11.5px] text-foreground">
                        {d.value}
                      </code>
                    ))}
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-3">
        <Button variant="outline" size="lg" disabled={cancel.isPending} onClick={() => cancel.mutate({ runId: run.id }, { onError })}>
          Cancel run
        </Button>
        <Button
          size="lg"
          className="blueprint"
          disabled={approve.isPending || enabled.length === 0}
          onClick={() => approve.mutate({ runId: run.id }, { onError })}
        >
          <Corners />
          {approve.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          Approve and start · {enabled.length} scenarios
        </Button>
      </div>
    </div>
  )
}
