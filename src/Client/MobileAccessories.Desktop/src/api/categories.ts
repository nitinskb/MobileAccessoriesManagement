import { apiRequest } from './client'
import type { Category, CategoryRequest, PagedResponse } from './types'

export function getCategories(includeInactive = false, search = ''): Promise<PagedResponse<Category>> {
  const parameters = new URLSearchParams({ page: '1', pageSize: '100', sortDirection: 'asc', includeInactive: String(includeInactive), search })
  return apiRequest<PagedResponse<Category>>(`/categories?${parameters}`)
}

export function saveCategory(id: number | null, request: CategoryRequest): Promise<Category> {
  return apiRequest<Category>(id === null ? '/categories' : `/categories/${id}`, {
    method: id === null ? 'POST' : 'PUT',
    body: JSON.stringify(request),
  }, true)
}

export function setCategoryActive(id: number, active: boolean): Promise<Category> {
  return apiRequest<Category>(`/categories/${id}/${active ? 'activate' : 'deactivate'}`, { method: 'POST' }, true)
}
