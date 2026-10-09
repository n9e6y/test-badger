import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { TERMINAL } from '@/api/hooks'
import type { ActivityItem, Run, RunStatus, StepEvent, Verdict } from '@/api/types'

export interface LiveSignal {
  scenario_id: string
  kind: 'console_error' | 'http_error'
  text: string
}

export interface LiveState {
  connected: boolean
  reconPages: { url: string; title: string }[]
  signals: LiveSignal[]
  suspected: string[]
}

/**
 * EventSource on /api/runs/:id/events. Applies the snapshot and live events to the TanStack
 * cache (run + activity feed). If the stream drops, `connected` turns false and `useRun`
 * falls back to 2 s polling; the browser reconnects on its own and gets a fresh snapshot.
 */
export function useRunEvents(runId: string): LiveState {
  const qc = useQueryClient()
  const [state, setState] = useState<LiveState>({ connected: false, reconPages: [], signals: [], suspected: [] })

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    // A finished run gets one snapshot and the stream is closed right away (see 'snapshot').
    const es = new EventSource(`/api/runs/${runId}/events`, { withCredentials: true })
    const patchRun = (fn: (r: Run) => Run) =>
      qc.setQueryData<Run>(['run', runId], (r) => (r ? fn(r) : r))
    const on = <T,>(name: string, handler: (data: T) => void) =>
      es.addEventListener(name, (e) => handler(JSON.parse((e as MessageEvent<string>).data) as T))

    es.onopen = () => setState((s) => ({ ...s, connected: true }))
    es.onerror = () => setState((s) => ({ ...s, connected: false }))

    on<Run>('snapshot', (run) => {
      qc.setQueryData(['run', runId], run)
      if (TERMINAL.includes(run.status)) es.close()
    })
    on<{ status: RunStatus; message: string }>('run.status', ({ status, message }) => {
      patchRun((r) => ({ ...r, status, status_message: message }))
      void qc.invalidateQueries({ queryKey: ['run', runId] })
    })
    on<{ url: string; title: string }>('recon.page', (page) =>
      setState((s) => ({ ...s, reconPages: [...s.reconPages, page] })),
    )
    on<{ scenario_id: string; verdict: Verdict; reason: string }>('scenario.finished', (e) =>
      patchRun((r) => ({
        ...r,
        scenarios: r.scenarios.map((sc) =>
          sc.code === e.scenario_id ? { ...sc, verdict: e.verdict, reason: e.reason } : sc,
        ),
      })),
    )
    on<StepEvent>('step', (e) => {
      qc.setQueryData<ActivityItem[]>(['activity', runId], (items = []) => [
        ...items,
        {
          index: e.index,
          action: e.action,
          description: e.description,
          target_label: null,
          reasoning: e.reasoning,
          result: null,
          url: e.url,
          screenshot_artifact_id: e.screenshot_id,
          console_json: [],
          network_json: [],
          created_at: new Date().toISOString(),
          scenario_code: e.scenario_id,
        },
      ])
      void qc.invalidateQueries({ queryKey: ['steps', runId, e.scenario_id] })
    })
    on<LiveSignal>('signal', (sig) => setState((s) => ({ ...s, signals: [...s.signals, sig] })))
    on<{ scenario_id: string }>('finding.suspected', ({ scenario_id }) =>
      setState((s) => ({ ...s, suspected: [...s.suspected, scenario_id] })),
    )
    on<{ cost_usd: number; tokens_in: number; tokens_out: number }>('cost.updated', (c) =>
      patchRun((r) => ({ ...r, cost_usd: c.cost_usd, tokens_in: c.tokens_in, tokens_out: c.tokens_out })),
    )
    const finish = () => {
      es.close()
      setState((s) => ({ ...s, connected: false }))
      void qc.invalidateQueries({ queryKey: ['run', runId] })
    }
    on('run.completed', finish)
    on('run.failed', finish)
    return () => es.close()
  }, [runId, qc])

  return state
}
