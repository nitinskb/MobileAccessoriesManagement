import { apiRequest } from './client'
import type { PagedResponse, Product, ProductRequest } from './types'

export interface ProductListQuery {
  search: string
  page: number
  pageSize: number
}

export function getProducts(query: ProductListQuery): Promise<PagedResponse<Product>> {
  const parameters = new URLSearchParams({
    search: query.search,
    page: String(query.page),
    pageSize: String(query.pageSize),
    sortBy: 'name',
    sortDirection: 'asc',
    includeInactive: 'true',
  })

  return apiRequest<PagedResponse<Product>>(`/products?${parameters.toString()}`)
}

export function createProduct(request: ProductRequest): Promise<Product> {
  return apiRequest<Product>(
    '/products',
    { method: 'POST', body: JSON.stringify(request) },
    true,
  )
}

export function updateProduct(id: number, request: ProductRequest): Promise<Product> {
  return apiRequest<Product>(
    `/products/${id}`,
    { method: 'PUT', body: JSON.stringify(request) },
    true,
  )
}

export function setProductActive(id: number, isActive: boolean): Promise<Product> {
  const action = isActive ? 'activate' : 'deactivate'
  return apiRequest<Product>(`/products/${id}/${action}`, { method: 'POST' }, true)
}

export function searchProductsForLabels(search: string, page: number, pageSize = 20): Promise<PagedResponse<Product>> {
  const parameters = new URLSearchParams({
    search,
    page: String(page),
    pageSize: String(pageSize),
    sortBy: 'name',
    sortDirection: 'asc',
    includeInactive: 'false',
  })
  return apiRequest<PagedResponse<Product>>(`/products?${parameters.toString()}`)
}

export function generateProductBarcode(id: number): Promise<Product> {
  return apiRequest<Product>(`/products/${id}/generate-barcode`, { method: 'POST' }, true)
}
