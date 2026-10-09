import { AlertTriangle, Bug, CheckCircle2, CircleDashed, HelpCircle, Loader2 } from 'lucide-react'

import type { OverallVerdict, RunStatus, Verdict } from '@/api/types'
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

export const TONE_ICON: Record<VerdictTone, typeof Bug> = {
  pass: CheckCircle2,
  bug: Bug,
  blocked: AlertTriangle,
  inc: HelpCircle,
}

const PILL = 'inline-flex w-fit items-center gap-1.5 border py-0.5 pr-2 pl-1.5 text-xs leading-[18px] font-medium whitespace-nowrap'

/** Verdict pill: always color + icon + text, never color alone. */
export function ToneBadge({ tone, label, className }: { tone: VerdictTone; label: string; className?: string }) {
  const c = TONE_CLASSES[tone]
  const Icon = TONE_ICON[tone]
  return (
    <span className={cn(PILL, c.fg, c.bg, c.bd, className)}>
      <Icon className="size-3.5 stroke-[1.75]" aria-hidden />
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

export function StatusBadge({ status }: { status: RunStatus }) {
  const active = !['COMPLETED', 'FAILED', 'CANCELLED', 'AWAITING_APPROVAL'].includes(status)
  const failed = status === 'FAILED'
  return (
    <span
      className={cn(
        PILL,
        failed ? 'border-v-inc-bd bg-v-inc-bg text-v-inc' : 'border-ink-400 bg-ink-100 text-ink-700',
      )}
    >
      {active ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <CircleDashed className="size-3.5 stroke-[1.75]" aria-hidden />
      )}
      {STATUS_LABELS[status]}
    </span>
  )
}

/** Small icon-only verdict marker for dense lists (scenario column in the live run). */
export function ScenarioVerdictIcon({ verdict, running }: { verdict: Verdict | null; running?: boolean }) {
  if (running) return <Loader2 className="size-4 shrink-0 animate-spin text-ink-700" aria-label="Running" />
  if (!verdict) return <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-label="Waiting" />
  const { tone, label } = SCENARIO_VERDICT[verdict]
  const Icon = TONE_ICON[tone]
  return <Icon className={cn('size-4 shrink-0 stroke-[1.75]', TONE_CLASSES[tone].fg)} aria-label={label} />
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  PASSED: 'Passed',
  BUG_FOUND: 'Bug found',
  BLOCKED: 'Blocked',
  INCONCLUSIVE: 'Inconclusive',
}
