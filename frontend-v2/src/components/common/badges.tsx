import { Ban, Check, Circle, CircleHelp, CircleX, Eye, Loader2 } from 'lucide-react'

import type { OverallVerdict, RunStatus, RunSummary, Verdict } from '@/api/types'
import { cn } from '@/lib/utils'
import { OVERALL_VERDICT, SCENARIO_VERDICT, TONE_CLASSES, type VerdictTone } from '@/lib/verdict'

const STATUS_LABELS: Record<RunStatus, string> = {
  QUEUED: 'Queued',
  RECON: 'Planning',
  PLANNING: 'Planning',
  AWAITING_APPROVAL: 'Waiting for approval',
  RUNNING: 'Running',
  TRIAGING: 'Checking',
  REPORTING: 'Checking',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
}

export const TONE_ICON: Record<VerdictTone, typeof Check> = {
  pass: Check,
  bug: CircleX,
  blocked: Ban,
  inc: CircleHelp,
}

// v2 badge: white, coloured border, uppercase (new-app TB-Verdict)
const PILL =
  'inline-flex w-fit items-center gap-1.5 border bg-white py-[3px] pr-2 pl-1.5 text-xs leading-4 font-semibold tracking-[0.05em] uppercase whitespace-nowrap'

/** Verdict pill: always color + icon + text, never color alone. */
export function ToneBadge({ tone, label, className }: { tone: VerdictTone; label: string; className?: string }) {
  const c = TONE_CLASSES[tone]
  const Icon = TONE_ICON[tone]
  return (
    <span className={cn(PILL, c.fg, c.bdStrong, className)}>
      <Icon className="size-3.5 stroke-[2.5]" aria-hidden />
      {label}
    </span>
  )
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const v = SCENARIO_VERDICT[verdict]
  return <ToneBadge tone={v.tone} label={v.label} />
}

export function OverallBadge({ verdict }: { verdict: OverallVerdict }) {
  const v = OVERALL_VERDICT[verdict]
  return <ToneBadge tone={v.tone} label={v.label} />
}

export function StatusBadge({ status, label }: { status: RunStatus; label?: string }) {
  const active = !['COMPLETED', 'FAILED', 'CANCELLED', 'AWAITING_APPROVAL', 'QUEUED'].includes(status)
  const text = label ?? STATUS_LABELS[status]
  if (active)
    return (
      <span className={cn(PILL, 'border-foreground bg-foreground text-background')}>
        <Loader2 className="size-3.5 animate-spin stroke-[2.75]" aria-hidden />
        {text}
      </span>
    )
  if (status === 'AWAITING_APPROVAL')
    return (
      <span className={cn(PILL, 'border-dashed border-foreground text-foreground')}>
        <Eye className="size-3.5 stroke-[2.5]" aria-hidden />
        {text}
      </span>
    )
  return (
    <span className={cn(PILL, status === 'FAILED' ? 'border-v-inc text-v-inc' : 'border-border text-foreground')}>
      <Circle className="size-3.5 stroke-2" aria-hidden />
      {text}
    </span>
  )
}

/** Small icon-only verdict marker for dense lists (scenario column in the live run). */
export function ScenarioVerdictIcon({ verdict, running }: { verdict: Verdict | null; running?: boolean }) {
  if (running) return <Loader2 className="size-4 shrink-0 animate-spin text-ink-700" aria-label="Running" />
  if (!verdict) return <Circle className="size-4 shrink-0 text-muted-foreground" aria-label="Waiting" />
  const { tone, label } = SCENARIO_VERDICT[verdict]
  const Icon = TONE_ICON[tone]
  return <Icon className={cn('size-4 shrink-0 stroke-[2.5]', TONE_CLASSES[tone].fg)} aria-label={label} />
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  PASSED: 'Passed',
  BUG_FOUND: 'Bug found',
  BLOCKED: 'Blocked',
  INCONCLUSIVE: 'Inconclusive',
}

/** One badge for a run in lists: live status while it runs, otherwise its overall verdict with the bug count. */
export function RunResultBadge({ run }: { run: RunSummary }) {
  if (!run.overall_verdict) return <StatusBadge status={run.status} />
  const v = OVERALL_VERDICT[run.overall_verdict]
  const label = v.tone === 'bug' && run.findings_count > 0 ? `Bug found · ${run.findings_count}` : v.label
  return <ToneBadge tone={v.tone} label={label} />
}
