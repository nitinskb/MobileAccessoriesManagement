import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { getCategories, saveCategory, setCategoryActive } from '../api/categories'
import { ApiError } from '../api/client'
import type { Category, CategoryRequest, PagedResponse } from '../api/types'

interface Props { onSessionExpired: () => void }

export function CategoryManagement({ onSessionExpired }: Props) {
  const [data, setData] = useState<PagedResponse<Category> | null>(null)
  const [search, setSearch] = useState('')
  const [includeInactive, setIncludeInactive] = useState(true)
  const [editing, setEditing] = useState<Category | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try { setData(await getCategories(includeInactive, search)) }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) onSessionExpired()
      else setError(e instanceof Error ? e.message : 'Could not load categories.')
    }
  }, [includeInactive, onSessionExpired, search])
  useEffect(() => { void load() }, [load])

  async function submit(request: CategoryRequest) {
    setSaving(true)
    try { await saveCategory(editing?.id ?? null, request); setEditing(undefined); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save category.'); throw e }
    finally { setSaving(false) }
  }

  async function toggle(category: Category) {
    setBusyId(category.id)
    try { await setCategoryActive(category.id, !category.isActive); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update category.') }
    finally { setBusyId(null) }
  }

  return <section className="page-content">
    <div className="page-heading-row"><div><p className="eyebrow">CATALOGUE</p><h1>Categories</h1><p className="muted-copy">Organize products into categories for the catalogue and invoices.</p></div>
      <button className="primary-button" onClick={() => setEditing(null)} type="button">＋ Add category</button></div>
    <section className="catalogue-card" aria-label="Category list">
      <div className="catalogue-toolbar"><div><h2>Product categories</h2><p>{data?.totalCount ?? 0} categories</p></div>
        <div className="category-tools"><input aria-label="Search categories" onChange={e => setSearch(e.target.value)} placeholder="Search categories" value={search} /><label><input checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} type="checkbox" /> Show inactive</label></div>
      </div>
      {error && <div className="page-error" role="alert">{error}<button className="text-button" onClick={() => void load()} type="button">Retry</button></div>}
      <div className="table-scroll"><table className="products-table"><thead><tr><th>Category</th><th>Description</th><th>Products</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {data?.items.length ? data.items.map(category => <tr key={category.id}><td><strong>{category.name}</strong></td><td>{category.description || '—'}</td><td>{category.productCount}</td><td><span className={category.isActive ? 'status-pill status-active' : 'status-pill status-inactive'}>{category.isActive ? 'Active' : 'Inactive'}</span></td><td><div className="row-actions"><button className="text-button" onClick={() => setEditing(category)} type="button">Edit</button><button className="text-button" disabled={busyId === category.id} onClick={() => void toggle(category)} type="button">{category.isActive ? 'Deactivate' : 'Activate'}</button></div></td></tr>) : <tr><td className="table-message" colSpan={5}>No categories found.</td></tr>}
      </tbody></table></div>
    </section>
    {editing !== undefined && <CategoryEditor category={editing} saving={saving} close={() => setEditing(undefined)} onSave={submit} />}
  </section>
}

function CategoryEditor({ category, saving, close, onSave }: { category: Category | null; saving: boolean; close: () => void; onSave: (request: CategoryRequest) => Promise<void> }) {
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    try { await onSave({ name: name.trim(), description: description.trim() || null, ...(category ? { rowVersion: category.rowVersion } : {}) }) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save category.') }
  }
  return <div className="modal-backdrop"><section aria-modal="true" aria-labelledby="category-editor-title" className="product-editor category-editor" role="dialog">
    <div className="editor-heading"><div><p className="eyebrow">CATALOGUE</p><h2 id="category-editor-title">{category ? 'Edit category' : 'Add category'}</h2></div><button className="icon-button" disabled={saving} onClick={close} type="button">×</button></div>
    <form className="product-form" onSubmit={e => void submit(e)}><div className="form-grid"><label className="field-wide">Category name <span>*</span><input autoFocus maxLength={100} onChange={e => setName(e.target.value)} required value={name} /></label><label className="field-wide">Description<textarea maxLength={500} onChange={e => setDescription(e.target.value)} rows={3} value={description} /></label></div>
      {error && <div className="form-error" role="alert">{error}</div>}<div className="editor-actions"><button className="secondary-button" disabled={saving} onClick={close} type="button">Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save category'}</button></div>
    </form></section></div>
}
