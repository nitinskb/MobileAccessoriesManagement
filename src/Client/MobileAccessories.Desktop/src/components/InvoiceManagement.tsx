import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createInvoice, findInvoiceProducts, getInvoice, getInvoiceProductByBarcode, getInvoices } from '../api/invoices'
import { ApiError } from '../api/client'
import type { Invoice, InvoiceListItem, PagedResponse, Product } from '../api/types'

interface Props { onSessionExpired: () => void }
interface DraftLine { product: Product; quantity: string }
const money = (value: number) => `₹${value.toFixed(2)}`
const optional = (value: string) => value.trim() || null

function amountInWords(value: number): string {
  const small = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const underThousand = (number: number): string => {
    const words: string[] = []
    if (number >= 100) { words.push(`${small[Math.floor(number / 100)]} Hundred`); number %= 100 }
    if (number >= 20) { words.push(tens[Math.floor(number / 10)]); number %= 10 }
    if (number > 0) words.push(small[number])
    return words.join(' ')
  }
  const integerToWords = (number: number): string => {
    if (number === 0) return 'Zero'
    const groups: [number, string][] = [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand'], [1, '']]
    const words: string[] = []
    for (const [size, label] of groups) {
      const count = Math.floor(number / size)
      if (count > 0) {
        words.push(underThousand(count), label)
        number %= size
      }
    }
    return words.filter(Boolean).join(' ')
  }
  const rounded = Math.round(value * 100)
  const rupees = Math.floor(rounded / 100)
  const paise = rounded % 100
  return `Rupees ${integerToWords(rupees)}${paise ? ` and ${integerToWords(paise)} Paise` : ''} Only`
}

export function InvoiceManagement({ onSessionExpired }: Props) {
  const [invoices, setInvoices] = useState<PagedResponse<InvoiceListItem> | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setInvoices(await getInvoices(search)) }
    catch (e) { if (e instanceof ApiError && e.status === 401) onSessionExpired(); else setError(e instanceof Error ? e.message : 'Could not load invoices.') }
  }, [onSessionExpired, search])
  useEffect(() => { void load() }, [load])

  async function openInvoice(id: number) {
    setError(null)
    try { setSelected(await getInvoice(id)); setCreating(false) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open invoice.') }
  }

  async function submit(customerName: string, customerPhone: string, notes: string, lines: DraftLine[]) {
    const result = await createInvoice({ customerName: optional(customerName), customerPhone: optional(customerPhone), notes: optional(notes), lines: lines.map(line => ({ productId: line.product.id, quantity: Number(line.quantity) })) })
    setSelected(result)
    setCreating(false)
    await load()
  }

  return <section className="page-content invoice-page">
    {selected ? <InvoiceReceipt invoice={selected} onBack={() => setSelected(null)} /> : <>
      <div className="page-heading-row no-print"><div><p className="eyebrow">BILLING</p><h1>Invoices</h1><p className="muted-copy">Create, view, and print non-tax cash memos.</p></div>
        <button className="primary-button" onClick={() => setCreating(true)} type="button">＋ New invoice</button></div>
      {error && <div className="page-error" role="alert">{error}<button className="text-button" onClick={() => void load()} type="button">Retry</button></div>}
      {creating ? <InvoiceComposer onCancel={() => setCreating(false)} onSave={submit} /> : <section className="catalogue-card no-print" aria-label="Invoice history">
        <div className="catalogue-toolbar"><div><h2>Invoice history</h2><p>{invoices?.totalCount ?? 0} invoices</p></div><form className="search-form" onSubmit={e => { e.preventDefault(); setSearch((e.currentTarget.elements.namedItem('invoice-search') as HTMLInputElement).value.trim()) }}><input aria-label="Search invoices" defaultValue={search} name="invoice-search" placeholder="Search invoice or customer" /></form></div>
        <div className="table-scroll"><table className="products-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Created by</th><th>Total</th><th /></tr></thead><tbody>
          {invoices?.items.length ? invoices.items.map(invoice => <tr key={invoice.id}><td><strong>{invoice.invoiceNumber}</strong></td><td>{invoice.customerName || 'Walk-in customer'}</td><td>{new Date(invoice.createdAtUtc).toLocaleString()}</td><td>{invoice.createdByEmail}</td><td>{money(invoice.total)}</td><td><button className="text-button" onClick={() => void openInvoice(invoice.id)} type="button">View / Print</button></td></tr>) : <tr><td className="table-message" colSpan={6}>No invoices yet. Create the first invoice to begin.</td></tr>}
        </tbody></table></div>
      </section>}
    </>}
  </section>
}

function InvoiceComposer({ onCancel, onSave }: { onCancel: () => void; onSave: (name: string, phone: string, notes: string, lines: DraftLine[]) => Promise<void> }) {
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [barcode, setBarcode] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [lines, setLines] = useState<DraftLine[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [scanMessage, setScanMessage] = useState('')
  const barcodeInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setLoadingProducts(true)
      findInvoiceProducts(search).then(result => { if (active) setProducts(result.items) })
        .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not search products.') })
        .finally(() => { if (active) setLoadingProducts(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [search])

  function add(product: Product) {
    if (product.currentStock <= 0) { setError(`${product.name} is out of stock.`); setScanMessage(''); return }
    const existing = lines.find(line => line.product.id === product.id)
    if (existing) {
      const nextQuantity = Number(existing.quantity) + 1
      if (nextQuantity > product.currentStock) { setError(`Only ${product.currentStock} ${product.unit} of ${product.name} are available.`); setScanMessage(''); return }
      setLines(current => current.map(line => line.product.id === product.id ? { ...line, quantity: String(nextQuantity) } : line))
    } else {
      setLines(current => [...current, { product, quantity: '1' }])
    }
    setError('')
    setScanMessage(`${product.name} added · quantity ${existing ? Number(existing.quantity) + 1 : 1}`)
  }

  async function scanBarcode() {
    const scannedCode = barcode.trim()
    if (!scannedCode) return
    setError('')
    setScanMessage('Looking up barcode…')
    try {
      const product = await getInvoiceProductByBarcode(scannedCode)
      add(product)
      setBarcode('')
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? `No active product found for barcode “${scannedCode}”.` : e instanceof Error ? e.message : 'Could not look up that barcode.')
      setScanMessage('')
      setBarcode('')
    } finally {
      requestAnimationFrame(() => barcodeInput.current?.focus())
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!lines.length) { setError('Add at least one product.'); return }
    if (lines.some(line => !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 || Number(line.quantity) > line.product.currentStock || Number(line.quantity) * 1000 % 1 !== 0)) { setError('Each quantity must be positive, available in stock, and have at most three decimal places.'); return }
    setSaving(true)
    try { await onSave(customerName, customerPhone, notes, lines) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create invoice.') }
    finally { setSaving(false) }
  }

  const total = lines.reduce((sum, line) => sum + (Number.isFinite(Number(line.quantity)) ? Math.round(Number(line.quantity) * line.product.salePrice * 100) / 100 : 0), 0)
  return <form className="invoice-composer catalogue-card" onSubmit={e => void submit(e)}>
    <div className="catalogue-toolbar"><div><h2>New cash memo</h2><p>Prices are taken from the product catalogue. Stock is deducted when saved.</p></div><button className="text-button" onClick={onCancel} type="button">Cancel</button></div>
    <div className="invoice-composer-body">
      <div className="form-grid invoice-customer-grid">
        <label>Customer name<input maxLength={150} onChange={e => setCustomerName(e.target.value)} placeholder="Walk-in customer" value={customerName} /></label>
        <label>Phone<input maxLength={20} onChange={e => setCustomerPhone(e.target.value)} value={customerPhone} /></label>
        <label className="field-wide">Notes<input maxLength={500} onChange={e => setNotes(e.target.value)} value={notes} /></label>
      </div>
      <label className="invoice-product-search invoice-scan-field">Scan barcode<input autoComplete="off" autoFocus disabled={saving} onChange={e => setBarcode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void scanBarcode() } }} placeholder="Scan here; scanner should send Enter after the barcode" ref={barcodeInput} value={barcode} /></label>
      {scanMessage && <p aria-live="polite" className="scan-message">{scanMessage}</p>}
      <label className="invoice-product-search">Or search products by name<input autoComplete="off" onChange={e => setSearch(e.target.value)} placeholder="Type a product name" value={search} /></label>
      <div className="invoice-product-results">{loadingProducts ? <span>Searching…</span> : products.map(product => <button className="invoice-product-option" disabled={product.currentStock <= 0} key={product.id} onClick={() => add(product)} type="button"><span><strong>{product.name}</strong><small>{product.barcode || product.categoryName} · Stock {product.currentStock} {product.unit}{lines.some(line => line.product.id === product.id) ? ` · In invoice ${lines.find(line => line.product.id === product.id)?.quantity}` : ''}</small></span><b>{money(product.salePrice)} · Add 1</b></button>)}</div>
      <div className="table-scroll"><table className="products-table invoice-lines-table"><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Amount</th><th /></tr></thead><tbody>
        {lines.map(line => <tr key={line.product.id}><td>{line.product.name}<small className="stock-minimum">Available {line.product.currentStock} {line.product.unit}</small></td><td><input aria-label={`Quantity for ${line.product.name}`} max={line.product.currentStock} min="0.001" onChange={e => setLines(current => current.map(item => item.product.id === line.product.id ? { ...item, quantity: e.target.value } : item))} step="0.001" type="number" value={line.quantity} /></td><td>{money(line.product.salePrice)}</td><td>{money(Number(line.quantity) * line.product.salePrice)}</td><td><button aria-label={`Remove ${line.product.name}`} className="text-button" onClick={() => setLines(current => current.filter(item => item.product.id !== line.product.id))} type="button">Remove</button></td></tr>)}
        {!lines.length && <tr><td className="table-message" colSpan={5}>Choose products from the search results above.</td></tr>}
      </tbody></table></div>
      <div className="invoice-total-row"><span>Cash memo total</span><strong>{money(total)}</strong></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="editor-actions"><button className="secondary-button" disabled={saving} onClick={onCancel} type="button">Cancel</button><button className="primary-button" disabled={saving || !lines.length} type="submit">{saving ? 'Saving…' : 'Create invoice'}</button></div>
    </div>
  </form>
}

function InvoiceReceipt({ invoice, onBack }: { invoice: Invoice; onBack: () => void }) {
  const quantityTotal = invoice.lines.reduce((sum, line) => sum + line.quantity, 0)
  const units = [...new Set(invoice.lines.map(line => line.unit))]
  const totalQuantityLabel = `${quantityTotal} ${units.length === 1 ? units[0] : 'units'}`
  return <>
    <div className="page-heading-row no-print"><div><p className="eyebrow">INVOICE</p><h1>{invoice.invoiceNumber}</h1><p className="muted-copy">Created {new Date(invoice.createdAtUtc).toLocaleString()} by {invoice.createdByEmail}</p></div><div className="receipt-actions"><button className="secondary-button" onClick={onBack} type="button">Back to invoices</button><button className="primary-button" onClick={() => window.print()} type="button">Print cash memo</button></div></div>
    <article className="invoice-paper">
      <div className="memo-copy-label">Original Copy</div>
      <header className="receipt-title"><h2>Cash/Credit Memo</h2><strong>MOBILE ACCESSORIES</strong></header>
      <section className="receipt-details">
        <div><strong>Party Details :</strong><span>{invoice.customerName || 'Walk-in Customer'}</span>{invoice.customerPhone && <span>{invoice.customerPhone}</span>}</div>
        <div className="receipt-invoice-meta"><span><b>Invoice No.</b><b>:</b>{invoice.invoiceNumber}</span><span><b>Dated</b><b>:</b>{new Date(invoice.createdAtUtc).toLocaleString('en-IN')}</span></div>
      </section>
      <table className="receipt-table"><thead><tr><th>S.N.</th><th>Description of Goods</th><th>Qty.</th><th>Unit</th><th>Price</th><th>Amount (₹)</th></tr></thead><tbody>{invoice.lines.map((line, index) => <tr key={`${line.productId}-${index}`}><td>{index + 1}.</td><td>{line.productName}{line.barcode && <small>{line.barcode}</small>}</td><td>{line.quantity}</td><td>{line.unit}</td><td>{line.unitPrice.toFixed(2)}</td><td>{line.lineTotal.toFixed(2)}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Grand Total</th><th>{totalQuantityLabel}</th><th colSpan={2}></th><th>{invoice.total.toFixed(2)}</th></tr></tfoot></table>
      <div className="amount-in-words">{amountInWords(invoice.total)}</div>
      {invoice.notes && <p className="receipt-notes"><strong>Notes:</strong> {invoice.notes}</p>}
      <footer className="receipt-footer"><div className="receipt-terms"><strong>Terms &amp; Conditions</strong><span>E. &amp; O.E.</span><ol><li>Goods once sold will not be taken back.</li><li>Interest @ 18% p.a. will be charged if payment is not made within the stipulated time.</li><li>Subject to Uttar Pradesh jurisdiction only.</li></ol></div><div className="receipt-signatures"><span>Receiver&apos;s Signature</span><span>For Mobile Accessories<br /><b>Authorised Signatory</b></span></div></footer>
    </article>
  </>
}
