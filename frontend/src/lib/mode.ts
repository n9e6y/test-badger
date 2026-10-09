// D17 run modes. Internal values stay thorough/quick; users see Hard/Easy.
// Numbers are the measured averages from the evaluation (09_EVALUATION_LOG.md).
import type { RunMode, TestType } from '@/api/types'

export const MODES: Record<
  RunMode,
  { label: string; text: string; cost: Record<TestType, number>; minutes: Record<TestType, number> }
> = {
  thorough: {
    label: 'Hard',
    text: 'The strongest model drives the browser. Most thorough: found 9 of 9 planted bugs.',
    cost: { registration: 0.3, store: 0.45 },
    minutes: { registration: 3, store: 5 },
  },
  quick: {
    label: 'Easy',
    text: 'A lighter model drives the browser. About half the cost, a bit faster, may miss more (8 of 9).',
    cost: { registration: 0.15, store: 0.26 },
    minutes: { registration: 2.5, store: 4.5 },
  },
}

/** Rough cost and time for one test type, or both. */
export function estimateUsd(mode: RunMode, types: TestType[]): number {
  return types.reduce((sum, t) => sum + MODES[mode].cost[t], 0)
}

export function estimate(mode: RunMode, types: TestType[]): { cost: string; minutes: string } {
  const m = MODES[mode]
  const cost = types.reduce((sum, t) => sum + m.cost[t], 0)
  const minutes = types.reduce((sum, t) => sum + m.minutes[t], 0)
  return { cost: `~$${cost.toFixed(2)}`, minutes: `~${Math.round(minutes)} min` }
}

/** D25: the mode to use — the chosen one if this account may use it, else its first allowed. */
export function allowedMode(wanted: RunMode, allowed: RunMode[] | undefined): RunMode {
  const list = allowed?.length ? allowed : (['quick'] as RunMode[])
  return list.includes(wanted) ? wanted : list[0]
}

export const RESERVED_NOTE = 'Hard mode is reserved for the judge account in this demo.'
