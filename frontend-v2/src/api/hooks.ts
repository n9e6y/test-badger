import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, ApiError, post } from './client'
import type {
  ActivityItem,
  LoginInput,
  Project,
  ProjectDetail,
  ProjectInput,
  Run,
  RunStatus,
  RunSummary,
  SignupInput,
  StartRunInput,
  Step,
  TestType,
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

export const TERMINAL: RunStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED']

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects') })
}

/** `pollMs` keeps statuses fresh where they matter (e.g. waiting plans on the run page). */
export function useRecentRuns(pollMs?: number) {
  return useQuery({
    queryKey: ['runs', 'recent'],
    queryFn: () => api<RunSummary[]>('/runs'),
    refetchInterval: pollMs ?? false,
  })
}

/** Every run of the account (the API caps the list at 50), newest first. */
export function useAllRuns() {
  return useQuery({
    queryKey: ['runs', 'all'],
    queryFn: () => api<RunSummary[]>('/runs?limit=50'),
  })
}

export function useRun(runId: string, sseConnected = false) {
  return useQuery({
    queryKey: ['run', runId],
    queryFn: () => api<Run>(`/runs/${runId}`),
    // SSE keeps the cache fresh; polling is the fallback (2 s without SSE, a slow safety net with it).
    refetchInterval: (q) =>
      q.state.data && TERMINAL.includes(q.state.data.status) ? false : sseConnected ? 15_000 : 2_000,
  })
}

export function useActivity(runId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['activity', runId],
    queryFn: () => api<ActivityItem[]>(`/runs/${runId}/activity`),
    enabled,
    staleTime: Infinity, // seeded once; live events append to it
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

/** What the user can pick on "New run": one test type, or both as two runs. */
export type TestChoice = TestType | 'both'

/**
 * Starts the chosen test. "both" starts a Registration run and a Store run with the same
 * details; each gets its own plan and report. Resolves to the started runs (first one first)
 * and, if a later run could not start, the reason. `storeGoal` is added to the Store run only.
 */
export function useStartTests() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      choice,
      input,
      storeGoal,
    }: {
      projectId: string
      choice: TestChoice
      input: Omit<StartRunInput, 'test_type'>
      storeGoal?: string
    }) => {
      const types: TestType[] = choice === 'both' ? ['registration', 'store'] : [choice]
      const runs: Run[] = []
      for (const test_type of types) {
        try {
          const goal = test_type === 'store' && storeGoal ? { goal_text: storeGoal } : {}
          runs.push(await post<Run>(`/projects/${projectId}/runs`, { ...input, ...goal, test_type }))
        } catch (err) {
          // The first run failing is a normal error; a later one must not hide the runs already started.
          if (runs.length === 0) throw err
          return { runs, notStarted: err instanceof Error ? err.message : 'The second run could not be started.' }
        }
      }
      return { runs, notStarted: null as string | null }
    },
    onSuccess: ({ runs }) => {
      for (const run of runs) qc.setQueryData(['run', run.id], run)
      qc.invalidateQueries({ queryKey: ['runs'] })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ME_KEY }) // runs left today (D25)
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

/** D21: run the same plan again (no new planning) to check whether fixes worked. */
export function useRerun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => post<Run>(`/runs/${runId}/rerun`),
    onSuccess: (run) => {
      qc.setQueryData(['run', run.id], run)
      qc.invalidateQueries({ queryKey: ['runs'] })
      qc.invalidateQueries({ queryKey: ME_KEY })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })
}

export const useApproveRun = () => useRunAction((id) => `/runs/${id}/approve`)
export const useCancelRun = () => useRunAction((id) => `/runs/${id}/cancel`)
export const usePatchPlan = () => useRunAction((id) => `/runs/${id}/plan`, 'PATCH')

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<ProjectDetail>(`/projects/${projectId}`),
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ProjectInput) => post<Project>('/projects', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}
