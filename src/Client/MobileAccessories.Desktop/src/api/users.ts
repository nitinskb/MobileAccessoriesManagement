import { apiRequest } from './client'
import type { UserSummary } from './types'

export function createUser(email: string, temporaryPassword: string): Promise<UserSummary> {
  return apiRequest<UserSummary>(
    '/users',
    {
      method: 'POST',
      body: JSON.stringify({ email, temporaryPassword }),
    },
    true,
  )
}
