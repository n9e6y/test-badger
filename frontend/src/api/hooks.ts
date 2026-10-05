import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, ApiError, post } from './client'
import type {
  LoginInput,
  Project,
  Run,
  RunStatus,
  RunSummary,
  SignupInput,
  StartRunInput,
  Step,
  User,
} from './types'

const ME_KEY = ['auth', 'me'] as const

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api<User>('/auth/me')
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
    staleTime: 5 * 60_000,
  })
}

export function useSignup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SignupInput) => post<User>('/auth/signup', input),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginInput) => post<User>('/auth/login', input),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => post<void>('/auth/logout'),
    onSuccess: () => {
      qc.setQueryData(ME_KEY, null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' })
    },
  })
}

// ---------- projects & runs ----------

const TERMINAL: RunStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED']

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects') })
}

export function useRecentRuns() {
  return useQuery({ queryKey: ['runs', 'recent'], queryFn: () => api<RunSummary[]>('/runs') })
}

export function useRun(runId: string) {
  return useQuery({
    queryKey: ['run', runId],
    queryFn: () => api<Run>(`/runs/${runId}`),
    // Polling every 2 s while the run is active (SSE replaces this on Day 4, polling stays as fallback).
    refetchInterval: (q) => (q.state.data && TERMINAL.includes(q.state.data.status) ? false : 2000),
  })
}

export function useScenarioSteps(runId: string, scenarioCode: string | null, live: boolean) {
  return useQuery({
    queryKey: ['steps', runId, scenarioCode],
    queryFn: () => api<Step[]>(`/runs/${runId}/scenarios/${scenarioCode}/steps`),
    enabled: Boolean(scenarioCode),
    refetchInterval: live ? 2000 : false,
  })
}

export function useStartRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: string; input: StartRunInput }) =>
      post<Run>(`/projects/${projectId}/runs`, input),
    onSuccess: (run) => {
      qc.setQueryData(['run', run.id], run)
      qc.invalidateQueries({ queryKey: ['runs'] })
    },
  })
}

function useRunAction(path: (id: string) => string, method: 'POST' | 'PATCH' = 'POST') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ runId, body }: { runId: string; body?: unknown }) =>
      api<Run>(path(runId), { method, body: body === undefined ? undefined : JSON.stringify(body) }),
    onSuccess: (run) => qc.setQueryData(['run', run.id], run),
  })
}

export const useApproveRun = () => useRunAction((id) => `/runs/${id}/approve`)
export const useCancelRun = () => useRunAction((id) => `/runs/${id}/cancel`)
export const usePatchPlan = () => useRunAction((id) => `/runs/${id}/plan`, 'PATCH')
