import type { ApiProblem } from './types'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

export class ApiError extends Error {
  public readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

let csrfRequestToken: string | null = null

async function getCsrfRequestToken(): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/auth/csrf`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw await createApiError(response)
  }

  const result = (await response.json()) as { requestToken: string }
  csrfRequestToken = result.requestToken
  return result.requestToken
}

async function createApiError(response: Response): Promise<ApiError> {
  let problem: ApiProblem | null = null
  try {
    problem = (await response.json()) as ApiProblem
  } catch {
    // The server may return an empty response for an error status.
  }

  const validationMessages = problem?.errors
    ? Object.values(problem.errors).flat().join(' ')
    : undefined
  const message = validationMessages || problem?.detail || problem?.title || `Request failed (${response.status}).`
  return new ApiError(message, response.status)
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  protectWithCsrf = false,
): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (protectWithCsrf) {
    csrfRequestToken ??= await getCsrfRequestToken()
    headers.set('X-CSRF-TOKEN', csrfRequestToken)
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    if (response.status === 400 && protectWithCsrf) {
      csrfRequestToken = null
    }
    throw await createApiError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
