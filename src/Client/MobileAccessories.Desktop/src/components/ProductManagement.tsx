import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createProduct, getProducts, setProductActive, updateProduct } from '../api/products'
import { getCategories } from '../api/categories'
import { receiveStock } from '../api/stock'
import { ApiError } from '../api/client'
import type { Category, PagedResponse, Product, ProductRequest } from '../api/types'

const pageSize = 10

interface ProductManagementProps {
  onSessionExpired: () => void
}

interface ProductFields {
  name: string
  brand: string
  model: string
  sku: string
  hsnCode: string
  barcode: string
  unit: string
  purchasePrice: string
  salePrice: string
  minimumStock: string
  warrantyMonths: string
  warrantyType: string
}

const emptyFields: ProductFields = {
  name: '',
  brand: '',
  model: '',
  sku: '',
  hsnCode: '',
  barcode: '',
  unit: 'pcs',
  purchasePrice: '',
  salePrice: '',
  minimumStock: '0',
  warrantyMonths: '0',
  warrantyType: '',
}

function fieldsFromProduct(product: Product): ProductFields {
  return {
    name: product.name,
    brand: product.brand ?? '',
    model: product.model ?? '',
    sku: product.sku ?? '',
    hsnCode: product.hsnCode ?? '',
    barcode: product.barcode ?? '',
    unit: product.unit,
    purchasePrice: String(product.purchasePrice),
    salePrice: String(product.salePrice),
    minimumStock: String(product.minimumStock),
    warrantyMonths: String(product.warrantyMonths),
    warrantyType: product.warrantyType ?? '',
  }
}

function optionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function problemMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'The request could not be completed. Check the API connection and try again.'
}

export function ProductManagement({ onSessionExpired }: ProductManagementProps) {
  const [products, setProducts] = useState<PagedResponse<Product> | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [busyProductId, setBusyProductId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editorProduct, setEditorProduct] = useState<Product | null | undefined>(undefined)
  const [isSaving, setIsSaving] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [receivingProduct, setReceivingProduct] = useState<Product | null>(null)

  const loadProducts = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getProducts({ search, page, pageSize })
      setProducts(result)
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired()
        return
      }
      setError(problemMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [onSessionExpired, page, search])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

  useEffect(() => {
    getCategories().then(result => setCategories(result.items)).catch((requestError: unknown) => {
      if (requestError instanceof ApiError && requestError.status === 401) onSessionExpired()
      else setError(problemMessage(requestError))
    })
  }, [onSessionExpired])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  async function handleSave(request: ProductRequest) {
    setIsSaving(true)
    setError(null)
    try {
      if (editorProduct) {
        await updateProduct(editorProduct.id, request)
      } else {
        await createProduct(request)
      }
      setEditorProduct(undefined)
      await loadProducts()
    } catch (requestError) {
      setError(problemMessage(requestError))
      throw requestError
    } finally {
      setIsSaving(false)
    }
  }

  async function handleActiveChange(product: Product) {
    setBusyProductId(product.id)
    setError(null)
    try {
      await setProductActive(product.id, !product.isActive)
      await loadProducts()
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired()
        return
      }
      setError(problemMessage(requestError))
    } finally {
      setBusyProductId(null)
    }
  }

  async function handleReceiveStock(product: Product, quantity: number, reason: string) {
    setBusyProductId(product.id)
    setError(null)
    try {
      await receiveStock(product.id, quantity, reason)
      setReceivingProduct(null)
      await loadProducts()
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) onSessionExpired()
      setError(problemMessage(requestError))
      throw requestError
    } finally { setBusyProductId(null) }
  }

  const totalPages = Math.max(products?.totalPages ?? 0, 1)

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">CATALOGUE</p>
          <h1>Products</h1>
          <p className="muted-copy">Manage product details, pricing, barcode, and stock thresholds.</p>
        </div>
        <button className="primary-button" onClick={() => setEditorProduct(null)} type="button">
          <span aria-hidden="true">＋</span> Add product
        </button>
      </div>

      <div className="product-summary-row">
        <div className="summary-card">
          <span className="summary-icon">▦</span>
          <div>
            <span className="summary-label">Products in catalogue</span>
            <strong>{products?.totalCount ?? '—'}</strong>
          </div>
        </div>
        <div className="summary-caption">
          <span className="connection-dot" />
          Connected to the shop database
        </div>
      </div>

      <section className="catalogue-card" aria-label="Product catalogue">
        <div className="catalogue-toolbar">
          <div>
            <h2>Product catalogue</h2>
            <p>Search by name, SKU, brand, model, or barcode.</p>
          </div>
          <form className="search-form" onSubmit={handleSearch} role="search">
            <span aria-hidden="true" className="search-icon">⌕</span>
            <input
              aria-label="Search products"
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search product, SKU, or barcode"
              value={searchInput}
            />
            {searchInput && (
              <button
                aria-label="Clear search"
                className="clear-search-button"
                onClick={() => {
                  setSearchInput('')
                  setSearch('')
                  setPage(1)
                }}
                type="button"
              >
                ×
              </button>
            )}
          </form>
        </div>

        {error && (
          <div className="page-error" role="alert">
            <span>{error}</span>
            <button className="text-button" onClick={() => void loadProducts()} type="button">
              Retry
            </button>
          </div>
        )}

        <div className="table-scroll">
          <table className="products-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Barcode</th>
                <th scope="col">Category</th>
                <th scope="col">Purchase</th>
                <th scope="col">Sale price</th>
                <th scope="col">Stock</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="table-message" colSpan={8}>Loading products…</td>
                </tr>
              ) : products?.items.length ? (
                products.items.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="product-name-cell">
                        <span className="product-avatar">{product.name.slice(0, 1).toUpperCase()}</span>
                        <span>
                          <strong>{product.name}</strong>
                          <small>{[product.brand, product.model, product.sku ? `SKU ${product.sku}` : null].filter(Boolean).join(' · ') || '—'}</small>
                        </span>
                      </div>
                    </td>
                    <td className="barcode-cell">{product.barcode || '—'}</td>
                    <td>{product.categoryName}</td>
                    <td>₹{product.purchasePrice.toFixed(2)}</td>
                    <td className="price-cell">₹{product.salePrice.toFixed(2)}</td>
                    <td>
                      <span className={product.currentStock <= product.minimumStock ? 'stock-value stock-low' : 'stock-value'}>
                        {product.currentStock.toFixed(3).replace(/\.000$/, '')} {product.unit}
                      </span>
                      <small className="stock-minimum">Min. {product.minimumStock.toFixed(3).replace(/\.000$/, '')}</small>
                    </td>
                    <td>
                      <span className={product.isActive ? 'status-pill status-active' : 'status-pill status-inactive'}>
                        {product.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="text-button row-status-action" disabled={!product.isActive} onClick={() => setReceivingProduct(product)} type="button">Receive stock</button>
                        <button
                          aria-label={`Edit ${product.name}`}
                          className="icon-button"
                          onClick={() => setEditorProduct(product)}
                          title="Edit product"
                          type="button"
                        >
                          ✎
                        </button>
                        <button
                          className="text-button row-status-action"
                          disabled={busyProductId === product.id}
                          onClick={() => void handleActiveChange(product)}
                          type="button"
                        >
                          {busyProductId === product.id ? 'Saving…' : product.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="table-message empty-state" colSpan={8}>
                    <span className="empty-state-mark">⌕</span>
                    <strong>{search ? 'No matching products' : 'Your catalogue is ready'}</strong>
                    <span>{search ? 'Try another name or barcode.' : 'Add your first product to get started.'}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-footer">
          <span>
            {products?.totalCount ?? 0} product{products?.totalCount === 1 ? '' : 's'}
            {products?.totalCount ? ` · Page ${page} of ${totalPages}` : ''}
          </span>
          <div className="pagination-controls">
            <button
              className="secondary-button"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((currentPage) => Math.max(currentPage - 1, 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="secondary-button"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((currentPage) => Math.min(currentPage + 1, totalPages))}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {editorProduct !== undefined && (
        <ProductEditor
          isSaving={isSaving}
          onCancel={() => setEditorProduct(undefined)}
          onSave={handleSave}
          product={editorProduct}
          categories={categories}
        />
      )}
      {receivingProduct && <StockReceiptEditor busy={busyProductId === receivingProduct.id} onCancel={() => setReceivingProduct(null)} onSave={(quantity, reason) => handleReceiveStock(receivingProduct, quantity, reason)} product={receivingProduct} />}
    </section>
  )
}

function StockReceiptEditor({ product, busy, onCancel, onSave }: { product: Product; busy: boolean; onCancel: () => void; onSave: (quantity: number, reason: string) => Promise<void> }) {
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('Purchase / opening stock')
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0 || Number(quantity) > 999999999999999 || Number(quantity) * 1000 % 1 !== 0) { setError('Enter a positive quantity with at most three decimal places.'); return }
    try { await onSave(Number(quantity), reason.trim()) }
    catch (e) { setError(problemMessage(e)) }
  }
  return <div className="modal-backdrop"><section aria-labelledby="stock-editor-title" aria-modal="true" className="product-editor category-editor" role="dialog">
    <div className="editor-heading"><div><p className="eyebrow">INVENTORY</p><h2 id="stock-editor-title">Receive stock</h2></div><button aria-label="Close" className="icon-button" disabled={busy} onClick={onCancel} type="button">×</button></div>
    <form className="product-form" onSubmit={e => void submit(e)}><p className="muted-copy">{product.name} · Current stock {product.currentStock} {product.unit}</p><div className="form-grid stock-receipt-fields">
      <label>Quantity received <span>*</span><input autoFocus min="0.001" onChange={e => setQuantity(e.target.value)} required step="0.001" type="number" value={quantity} /></label>
      <label>Reason <span>*</span><input maxLength={250} onChange={e => setReason(e.target.value)} required value={reason} /></label>
    </div>{error && <div className="form-error" role="alert">{error}</div>}<div className="editor-actions"><button className="secondary-button" disabled={busy} onClick={onCancel} type="button">Cancel</button><button className="primary-button" disabled={busy} type="submit">{busy ? 'Saving…' : 'Receive stock'}</button></div></form>
  </section></div>
}

interface ProductEditorProps {
  product: Product | null
  categories: Category[]
  isSaving: boolean
  onCancel: () => void
  onSave: (request: ProductRequest) => Promise<void>
}

function ProductEditor({ product, categories, isSaving, onCancel, onSave }: ProductEditorProps) {
  const [fields, setFields] = useState<ProductFields>(() => product ? fieldsFromProduct(product) : emptyFields)
  const [formError, setFormError] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState(String(product?.categoryId ?? categories[0]?.id ?? ''))
  const isEditing = product !== null

  function updateField(field: keyof ProductFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const request: ProductRequest = {
      categoryId: Number(categoryId),
      name: fields.name.trim(),
      brand: optionalText(fields.brand),
      model: optionalText(fields.model),
      sku: optionalText(fields.sku),
      hsnCode: optionalText(fields.hsnCode),
      barcode: optionalText(fields.barcode),
      unit: fields.unit.trim(),
      purchasePrice: Number(fields.purchasePrice),
      salePrice: Number(fields.salePrice),
      minimumStock: Number(fields.minimumStock),
      warrantyMonths: Number(fields.warrantyMonths),
      warrantyType: optionalText(fields.warrantyType),
      ...(product ? { rowVersion: product.rowVersion } : {}),
    }

    try {
      await onSave(request)
    } catch (saveError) {
      setFormError(problemMessage(saveError))
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isSaving) onCancel()
    }}>
      <section aria-labelledby="product-editor-title" aria-modal="true" className="product-editor" role="dialog">
        <div className="editor-heading">
          <div>
            <p className="eyebrow">PRODUCT DETAILS</p>
            <h2 id="product-editor-title">{isEditing ? 'Edit product' : 'Add product'}</h2>
          </div>
          <button aria-label="Close" className="icon-button close-button" disabled={isSaving} onClick={onCancel} type="button">×</button>
        </div>

        <form className="product-form" onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <label className="field-wide" htmlFor="product-name">Product name <span>*</span>
              <input autoFocus id="product-name" maxLength={150} onChange={(event) => updateField('name', event.target.value)} required value={fields.name} />
            </label>
            <label htmlFor="product-brand">Brand
              <input id="product-brand" maxLength={100} onChange={(event) => updateField('brand', event.target.value)} value={fields.brand} />
            </label>
            <label htmlFor="product-model">Model
              <input id="product-model" maxLength={100} onChange={(event) => updateField('model', event.target.value)} value={fields.model} />
            </label>
            <label htmlFor="product-sku">SKU
              <input id="product-sku" maxLength={50} onChange={(event) => updateField('sku', event.target.value)} value={fields.sku} />
            </label>
            <label htmlFor="product-barcode">Barcode
              <input id="product-barcode" maxLength={100} onChange={(event) => updateField('barcode', event.target.value)} value={fields.barcode} />
            </label>
            <label htmlFor="product-hsn">HSN code
              <input id="product-hsn" maxLength={20} onChange={(event) => updateField('hsnCode', event.target.value)} value={fields.hsnCode} />
            </label>
            <label htmlFor="product-category">Category <span>*</span>
              <select id="product-category" onChange={(event) => setCategoryId(event.target.value)} required value={categoryId}>
                {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              {!categories.length && <small>Create an active category before adding a product.</small>}
            </label>
            <label htmlFor="product-unit">Unit <span>*</span>
              <input id="product-unit" maxLength={20} onChange={(event) => updateField('unit', event.target.value)} required value={fields.unit} />
            </label>
            <label htmlFor="product-purchase-price">Purchase price (₹) <span>*</span>
              <input id="product-purchase-price" min="0" onChange={(event) => updateField('purchasePrice', event.target.value)} required step="0.01" type="number" value={fields.purchasePrice} />
            </label>
            <label htmlFor="product-sale-price">Sale price (₹) <span>*</span>
              <input id="product-sale-price" min="0" onChange={(event) => updateField('salePrice', event.target.value)} required step="0.01" type="number" value={fields.salePrice} />
            </label>
            <label htmlFor="product-minimum-stock">Minimum stock
              <input id="product-minimum-stock" min="0" onChange={(event) => updateField('minimumStock', event.target.value)} step="0.001" type="number" value={fields.minimumStock} />
            </label>
            <label htmlFor="product-warranty-months">Warranty (months)
              <input id="product-warranty-months" max="1200" min="0" onChange={(event) => updateField('warrantyMonths', event.target.value)} step="1" type="number" value={fields.warrantyMonths} />
            </label>
            <label className="field-wide" htmlFor="product-warranty-type">Warranty type
              <input id="product-warranty-type" maxLength={50} onChange={(event) => updateField('warrantyType', event.target.value)} placeholder="Shop warranty, manufacturer warranty…" value={fields.warrantyType} />
            </label>
          </div>

          {isEditing && (
            <div className="stock-readonly-note">
              Current stock: <strong>{product.currentStock} {product.unit}</strong>. Stock is changed through stock transactions, not this form.
            </div>
          )}

          {formError && <div className="form-error" role="alert">{formError}</div>}

          <div className="editor-actions">
            <button className="secondary-button" disabled={isSaving} onClick={onCancel} type="button">Cancel</button>
            <button className="primary-button" disabled={isSaving} type="submit">
              {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create product'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
