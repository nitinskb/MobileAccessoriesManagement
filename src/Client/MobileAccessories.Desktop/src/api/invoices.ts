import { apiRequest } from './client'
import type { Invoice, InvoiceListItem, PagedResponse, Product } from './types'

export function getInvoices(search = ''): Promise<PagedResponse<InvoiceListItem>> {
  const query = new URLSearchParams({ search, page: '1', pageSize: '100' })
  return apiRequest(`/invoices?${query}`)
}

export function getInvoice(id: number): Promise<Invoice> {
  return apiRequest(`/invoices/${id}`)
}

export function findInvoiceProducts(search: string): Promise<PagedResponse<Product>> {
  const query = new URLSearchParams({ search, page: '1', pageSize: '20', sortBy: 'name', sortDirection: 'asc', includeInactive: 'false' })
  return apiRequest(`/products?${query}`)
}

export function getInvoiceProductByBarcode(barcode: string): Promise<Product> {
  return apiRequest(`/products/barcode/${encodeURIComponent(barcode)}`)
}

export function createInvoice(request: {
  customerName: string | null
  customerPhone: string | null
  notes: string | null
  lines: { productId: number; quantity: number }[]
}): Promise<Invoice> {
  return apiRequest('/invoices', { method: 'POST', body: JSON.stringify(request) }, true)
}
