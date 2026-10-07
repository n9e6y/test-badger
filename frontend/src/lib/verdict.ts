// The only place verdict colors are defined (02 §4, 06 §2.1). Don't reuse these colors elsewhere.
// Four hues, one per scenario verdict; the overall verdict maps onto them.

import type { OverallVerdict, Verdict } from '@/api/types'

export type VerdictTone = 'pass' | 'bug' | 'blocked' | 'inc'

/** Tailwind classes per tone: text color, tinted background, border. */
export const TONE_CLASSES: Record<VerdictTone, { fg: string; bg: string; bd: string }> = {
  pass: { fg: 'text-v-pass', bg: 'bg-v-pass-bg', bd: 'border-v-pass-bd' },
  bug: { fg: 'text-v-bug', bg: 'bg-v-bug-bg', bd: 'border-v-bug-bd' },
  blocked: { fg: 'text-v-blocked', bg: 'bg-v-blocked-bg', bd: 'border-v-blocked-bd' },
  inc: { fg: 'text-v-inc', bg: 'bg-v-inc-bg', bd: 'border-v-inc-bd' },
}

export const SCENARIO_VERDICT: Record<Verdict, { label: string; tone: VerdictTone }> = {
  PASSED: { label: 'Passed', tone: 'pass' },
  BUG_FOUND: { label: 'Bug found', tone: 'bug' },
  BLOCKED: { label: 'Blocked', tone: 'blocked' },
  INCONCLUSIVE: { label: 'Inconclusive', tone: 'inc' },
}

export const OVERALL_VERDICT: Record<OverallVerdict, { label: string; tone: VerdictTone }> = {
  critical: { label: 'Critical bugs', tone: 'bug' },
  problems: { label: 'Bugs found', tone: 'bug' },
  minor: { label: 'Minor bugs', tone: 'bug' },
  all_passed: { label: 'All passed', tone: 'pass' },
  not_testable: { label: 'Not testable', tone: 'blocked' },
}
