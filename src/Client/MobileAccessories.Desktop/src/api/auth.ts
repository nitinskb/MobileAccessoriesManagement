import { apiRequest } from './client'
import type { UserSummary } from './types'

export function getCurrentUser(): Promise<UserSummary> {
  return apiRequest<UserSummary>('/auth/me')
}

export function signIn(email: string, password: string): Promise<UserSummary> {
  return apiRequest<UserSummary>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    true,
  )
}

export function signOut(): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST' }, true)
}
