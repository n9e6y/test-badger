import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, ApiError, post } from './client'
import type { LoginInput, SignupInput, User } from './types'

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
