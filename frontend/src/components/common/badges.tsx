import { Ban, CheckCircle2, CircleDashed, HelpCircle, Loader2, XCircle } from 'lucide-react'

import type { OverallVerdict, RunStatus, Verdict } from '@/api/types'
import { cn } from '@/lib/utils'
import { VERDICT_STYLES } from '@/lib/verdict'

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

export function StatusBadge({ status }: { status: RunStatus }) {
  const active = !['COMPLETED', 'FAILED', 'CANCELLED', 'AWAITING_APPROVAL'].includes(status)
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium">
      {active && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {STATUS_LABELS[status]}
    </span>
  )
}

export function OverallBadge({ verdict }: { verdict: OverallVerdict }) {
  const style = VERDICT_STYLES[verdict]
  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', style.className)}>
      {style.label}
    </span>
  )
}

const SCENARIO_ICONS: Record<Verdict, { icon: typeof CheckCircle2; label: string; color: string }> = {
  PASSED: { icon: CheckCircle2, label: 'Passed', color: 'text-green-600' },
  BUG_FOUND: { icon: XCircle, label: 'Bug found', color: 'text-red-600' },
  BLOCKED: { icon: Ban, label: 'Blocked', color: 'text-gray-500' },
  INCONCLUSIVE: { icon: HelpCircle, label: 'Inconclusive', color: 'text-gray-500' },
}

export function ScenarioVerdictIcon({ verdict, running }: { verdict: Verdict | null; running?: boolean }) {
  if (running) return <Loader2 className="size-4 shrink-0 animate-spin text-foreground" aria-label="Running" />
  if (!verdict) return <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-label="Waiting" />
  const { icon: Icon, label, color } = SCENARIO_ICONS[verdict]
  return <Icon className={cn('size-4 shrink-0', color)} aria-label={label} />
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  PASSED: 'Passed',
  BUG_FOUND: 'Bug found',
  BLOCKED: 'Blocked',
  INCONCLUSIVE: 'Inconclusive',
}
