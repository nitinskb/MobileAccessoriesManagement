export interface UserSummary {
  id: string
  email: string
  roles: string[]
}

export interface Product {
  id: number
  categoryId: number
  categoryName: string
  name: string
  brand: string | null
  model: string | null
  sku: string | null
  hsnCode: string | null
  barcode: string | null
  unit: string
  purchasePrice: number
  salePrice: number
  currentStock: number
  minimumStock: number
  warrantyMonths: number
  warrantyType: string | null
  isActive: boolean
  createdAtUtc: string
  createdBy: string | null
  updatedAtUtc: string | null
  updatedBy: string | null
  rowVersion: string
}

export interface ProductRequest {
  categoryId: number
  name: string
  brand: string | null
  model: string | null
  sku: string | null
  hsnCode: string | null
  barcode: string | null
  unit: string
  purchasePrice: number
  salePrice: number
  minimumStock: number
  warrantyMonths: number
  warrantyType: string | null
  rowVersion?: string
}

export interface Category {
  id: number
  name: string
  description: string | null
  isActive: boolean
  productCount: number
  createdAtUtc: string
  updatedAtUtc: string | null
  rowVersion: string
}

export interface CategoryRequest {
  name: string
  description: string | null
  rowVersion?: string
}

export interface InvoiceLine {
  productId: number
  productName: string
  barcode: string | null
  unit: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface Invoice {
  id: number
  invoiceNumber: string
  customerName: string | null
  customerPhone: string | null
  notes: string | null
  total: number
  createdAtUtc: string
  createdByEmail: string
  lines: InvoiceLine[]
}

export interface InvoiceListItem {
  id: number
  invoiceNumber: string
  customerName: string | null
  total: number
  createdAtUtc: string
  createdByEmail: string
}

export interface PagedResponse<T> {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface ApiProblem {
  title?: string
  detail?: string
  errors?: Record<string, string[]>
}
