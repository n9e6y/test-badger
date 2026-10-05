import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { useApproveRun, useCancelRun, usePatchPlan } from '@/api/hooks'
import type { PlanScenario, Run } from '@/api/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const KIND: Record<PlanScenario['kind'], { label: string; className: string }> = {
  happy_path: { label: 'Happy path', className: 'bg-sky-50 text-sky-800 border-sky-200' },
  negative: { label: 'Negative', className: 'bg-violet-50 text-violet-800 border-violet-200' },
  edge_case: { label: 'Edge case', className: 'bg-slate-100 text-slate-700 border-slate-200' },
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
    <div className="grid gap-4">
      <div className="rounded-xl border bg-background p-5">
        <h2 className="text-lg font-medium">Review the test plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">{plan.summary}</p>
        <p className="mt-3 text-sm font-medium">
          {enabled.length} checks · about {Math.max(1, enabled.length)} minutes
        </p>
        <p className="text-xs text-muted-foreground">Turn off anything you don't want tested, then approve.</p>
      </div>

      <ul className="grid gap-3">
        {plan.scenarios.map((s) => (
          <li key={s.id} className={cn('rounded-xl border bg-background p-4 transition-opacity', !s.enabled && 'opacity-55')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">{s.id}</span>
                  <span className={cn('rounded-full border px-2 py-0.5 text-xs', KIND[s.kind].className)}>
                    {KIND[s.kind].label}
                  </span>
                </div>
                <p className="mt-1 font-medium">{s.title}</p>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-foreground"
                  checked={s.enabled}
                  disabled={patch.isPending}
                  onChange={(e) => toggle(s.id, e.target.checked)}
                  aria-label={`Include ${s.id}: ${s.title}`}
                />
                Include
              </label>
            </div>
            <dl className="mt-3 grid gap-1 text-sm">
              {s.test_data.length > 0 && (
                <div>
                  <dt className="inline text-muted-foreground">Test data: </dt>
                  <dd className="inline">
                    {s.test_data.map((d) => (
                      <code key={d.key + d.value} className="mr-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                        {d.value}
                      </code>
                    ))}
                  </dd>
                </div>
              )}
              <div>
                <dt className="inline text-muted-foreground">Expected: </dt>
                <dd className="inline">{s.expected_result}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">Starts at: </dt>
                <dd className="inline">{s.start_url}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t bg-muted/80 py-3 backdrop-blur">
        <Button variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate({ runId: run.id }, { onError })}>
          Cancel
        </Button>
        <Button size="lg" disabled={approve.isPending || enabled.length === 0}
          onClick={() => approve.mutate({ runId: run.id }, { onError })}>
          {approve.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Approve &amp; run {enabled.length} checks
        </Button>
      </div>
    </div>
  )
}
