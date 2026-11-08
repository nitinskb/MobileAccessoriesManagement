import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import { ApiError } from '../api/client'
import { generateProductBarcode, searchProductsForLabels } from '../api/products'
import type { PagedResponse, Product } from '../api/types'

interface Props { onSessionExpired: () => void }
interface LabelSelection { product: Product; quantity: number }
interface LayoutSettings {
  orientation: 'portrait' | 'landscape'
  labelWidth: number
  labelHeight: number
  columns: number
  rows: number
  horizontalGap: number
  verticalGap: number
  marginLeft: number
  marginRight: number
  marginTop: number
  marginBottom: number
  shopName: string
  showShopName: boolean
  showBrandModel: boolean
  showSalePrice: boolean
}

const defaults: LayoutSettings = {
  orientation: 'portrait', labelWidth: 63.5, labelHeight: 38.1, columns: 3, rows: 7,
  horizontalGap: 2.5, verticalGap: 0, marginLeft: 7.25, marginRight: 7.25,
  marginTop: 15.15, marginBottom: 15.15, shopName: '', showShopName: false,
  showBrandModel: true, showSalePrice: true,
}
const settingsKey = 'mobile-accessories.barcode-label-layout.v1'
const maxLabelsPerProduct = 10000

function readSettings(): LayoutSettings {
  try {
    const stored = localStorage.getItem(settingsKey)
    if (!stored) return defaults
    return { ...defaults, ...(JSON.parse(stored) as Partial<LayoutSettings>) }
  } catch { return defaults }
}

function printableBarcode(value: string | null): value is string {
  return Boolean(value && /^[\x20-\x7E]+$/.test(value))
}

function money(value: number) { return `₹${value.toFixed(2)}` }

export function BarcodeLabelPrinting({ onSessionExpired }: Props) {
  const [settings, setSettings] = useState<LayoutSettings>(readSettings)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [results, setResults] = useState<PagedResponse<Product> | null>(null)
  const [selected, setSelected] = useState<LabelSelection[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [busyProductId, setBusyProductId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [previewPage, setPreviewPage] = useState(0)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(settingsKey, JSON.stringify(settings)) } catch { /* Layout remains usable for this session. */ }
  }, [settings])

  const loadProducts = useCallback(async () => {
    setIsSearching(true)
    setError(null)
    try { setResults(await searchProductsForLabels(search.trim(), page)) }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) onSessionExpired()
      else setError(e instanceof Error ? e.message : 'Could not search products.')
    } finally { setIsSearching(false) }
  }, [onSessionExpired, page, search])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadProducts() }, 220)
    return () => window.clearTimeout(timer)
  }, [loadProducts])

  const totalLabels = selected.reduce((total, item) => total + item.quantity, 0)
  const pageCapacity = Math.max(settings.rows * settings.columns, 1)
  const labels = useMemo(() => selected.flatMap(item => Array.from({ length: item.quantity }, () => item.product)), [selected])
  const pageCount = Math.max(1, Math.ceil(totalLabels / pageCapacity))
  const paperWidth = settings.orientation === 'portrait' ? 210 : 297
  const paperHeight = settings.orientation === 'portrait' ? 297 : 210
  const fits = settings.labelWidth > 0 && settings.labelHeight > 0 && Number.isInteger(settings.rows) && Number.isInteger(settings.columns) && settings.rows > 0 && settings.columns > 0 &&
    settings.horizontalGap >= 0 && settings.verticalGap >= 0 && settings.marginLeft >= 0 && settings.marginRight >= 0 && settings.marginTop >= 0 && settings.marginBottom >= 0 &&
    settings.marginLeft + settings.marginRight + settings.columns * settings.labelWidth + (settings.columns - 1) * settings.horizontalGap <= paperWidth + 0.001 &&
    settings.marginTop + settings.marginBottom + settings.rows * settings.labelHeight + (settings.rows - 1) * settings.verticalGap <= paperHeight + 0.001
  const missingBarcode = selected.some(item => !item.product.barcode)
  const invalidBarcode = selected.some(item => !printableBarcode(item.product.barcode))

  function updateSetting<K extends keyof LayoutSettings>(key: K, value: LayoutSettings[K]) {
    setSettings(current => ({ ...current, [key]: value }))
  }

  function setQuantity(product: Product, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxLabelsPerProduct) return
    const otherLabels = selected.filter(item => item.product.id !== product.id).reduce((sum, item) => sum + item.quantity, 0)
    if (otherLabels + quantity > 10000) { setError('A print job is limited to 10,000 labels. Split larger jobs into batches.'); return }
    setSelected(current => current.map(item => item.product.id === product.id ? { ...item, quantity } : item))
    setError(null)
  }

  function toggleProduct(product: Product) {
    if (selected.some(item => item.product.id === product.id)) {
      setSelected(current => current.filter(item => item.product.id !== product.id))
      return
    }
    if (totalLabels >= 10000) {
      setError('A print job is limited to 10,000 labels. Split larger jobs into batches.')
      return
    }
    setSelected(current => [...current, { product, quantity: 1 }])
    setError(null)
  }

  async function ensureBarcode(item: LabelSelection) {
    if (item.product.barcode) return
    setBusyProductId(item.product.id)
    setError(null)
    setNotice(null)
    try {
      const updated = await generateProductBarcode(item.product.id)
      setSelected(current => current.map(selectedItem => selectedItem.product.id === updated.id ? { ...selectedItem, product: updated } : selectedItem))
      setResults(current => current ? { ...current, items: current.items.map(product => product.id === updated.id ? updated : product) } : current)
      setNotice(`Barcode ${updated.barcode} was generated and saved for ${updated.name}.`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onSessionExpired()
      setError(e instanceof Error ? e.message : 'Could not generate a barcode.')
    } finally { setBusyProductId(null) }
  }

  function beginPreview() {
    setError(null)
    if (!fits) { setError('The label dimensions, spacing, and margins do not fit the selected A4 orientation.'); return }
    if (missingBarcode) { setError('Generate and save a barcode for each selected product before previewing.'); return }
    if (invalidBarcode) { setError('A selected barcode contains characters that Code 128 cannot encode.'); return }
    if (totalLabels > 10000) { setError('A print job is limited to 10,000 labels. Split larger jobs into batches.'); return }
    setPreviewPage(0)
    setShowPreview(true)
  }

  function resetSelection() {
    setShowPreview(false)
    setSelected([])
    setError(null)
    setNotice(null)
  }

  const pageLabels = labels.slice(previewPage * pageCapacity, (previewPage + 1) * pageCapacity)
  const layoutStyle = {
    '--sheet-width': `${paperWidth}mm`, '--sheet-height': `${paperHeight}mm`,
    '--label-width': `${settings.labelWidth}mm`, '--label-height': `${settings.labelHeight}mm`,
    '--label-columns': settings.columns, '--label-rows': settings.rows,
    '--label-gap-x': `${settings.horizontalGap}mm`, '--label-gap-y': `${settings.verticalGap}mm`,
    '--sheet-left': `${settings.marginLeft}mm`, '--sheet-right': `${settings.marginRight}mm`,
    '--sheet-top': `${settings.marginTop}mm`, '--sheet-bottom': `${settings.marginBottom}mm`,
  } as React.CSSProperties

  return <section className="page-content barcode-label-page">
    <div className="page-heading-row label-page-heading no-print"><div><p className="eyebrow">PRODUCT TOOLS</p><h1>Barcode Label Printing</h1><p className="muted-copy">Select products, set label counts, preview an A4 sheet, then print at actual size.</p></div>
      <div className="label-total-card"><span>Total labels</span><strong>{totalLabels}</strong></div>
    </div>
    {error && <div className="page-error no-print" role="alert"><span>{error}</span><button className="text-button" onClick={() => setError(null)} type="button">Dismiss</button></div>}
    {notice && <div className="label-notice no-print" role="status">{notice}</div>}

    {!showPreview ? <>
      <div className="label-workspace-grid no-print">
        <section className="catalogue-card label-picker" aria-label="Product selection">
          <div className="catalogue-toolbar"><div><h2>Find products</h2><p>Search by name, SKU, or barcode.</p></div><form className="search-form" onSubmit={e => { e.preventDefault(); setPage(1); void loadProducts() }}><input aria-label="Search product name, SKU, or barcode" onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Product, SKU, or barcode" value={search} /></form></div>
          <div className="label-product-list">{isSearching ? <p className="label-empty">Searching products…</p> : results?.items.length ? results.items.map(product => {
            const isSelected = selected.some(item => item.product.id === product.id)
            return <div className="label-product-row" key={product.id}><div className="label-product-ident"><strong>{product.name}</strong><small>{product.sku ? `SKU ${product.sku}` : 'No SKU'} · {product.barcode ? `Barcode ${product.barcode}` : 'Barcode not assigned'}</small></div><span className="label-product-price">{money(product.salePrice)}</span><button className={isSelected ? 'secondary-button' : 'primary-button'} onClick={() => toggleProduct(product)} type="button">{isSelected ? 'Remove' : 'Select'}</button></div>
          }) : <p className="label-empty">No matching products.</p>}</div>
          <div className="table-footer label-picker-footer"><span>{results?.totalCount ?? 0} products · Page {page} of {Math.max(results?.totalPages ?? 0, 1)}</span><div className="pagination-controls"><button className="secondary-button" disabled={page <= 1 || isSearching} onClick={() => setPage(value => value - 1)} type="button">Previous</button><button className="secondary-button" disabled={page >= (results?.totalPages ?? 1) || isSearching} onClick={() => setPage(value => value + 1)} type="button">Next</button></div></div>
        </section>
        <section className="catalogue-card label-selected-card" aria-label="Selected products and quantities">
          <div className="catalogue-toolbar"><div><h2>Labels to print</h2><p>Set a custom quantity for each product.</p></div><span className="selected-count">{selected.length} products</span></div>
          <div className="label-selected-list">{selected.map(item => <div className="label-selected-row" key={item.product.id}><div className="label-product-ident"><strong>{item.product.name}</strong><small>{item.product.barcode ?? 'Barcode required before printing'}</small>{!item.product.barcode && <button className="text-button generate-barcode-button" disabled={busyProductId === item.product.id} onClick={() => void ensureBarcode(item)} type="button">{busyProductId === item.product.id ? 'Generating…' : 'Generate and save barcode'}</button>}</div><div className="label-quantity-field"><label>Labels<input aria-label={`Label quantity for ${item.product.name}`} max={maxLabelsPerProduct} min="1" onChange={e => setQuantity(item.product, Number(e.target.value))} type="number" value={item.quantity} /></label><div className="label-quantity-presets">{[10, 20, 50, 100].map(count => <button key={count} onClick={() => setQuantity(item.product, count)} type="button">{count}</button>)}</div></div><button aria-label={`Remove ${item.product.name}`} className="icon-button" onClick={() => toggleProduct(item.product)} type="button">×</button></div>)}{!selected.length && <p className="label-empty">Select one or more products to build your print batch.</p>}</div>
        </section>
      </div>
      <LayoutEditor settings={settings} updateSetting={updateSetting} />
      <div className="label-page-actions no-print"><button className="secondary-button" onClick={resetSelection} type="button">Cancel</button><button className="primary-button" disabled={!selected.length} onClick={beginPreview} type="button">Preview labels</button></div>
    </> : <>
      <section className="label-preview-toolbar no-print"><div><strong>A4 print preview</strong><span>{settings.orientation} · {settings.labelWidth} × {settings.labelHeight} mm · {settings.rows} rows × {settings.columns} columns · {totalLabels} labels</span></div><div className="label-page-actions"><button className="secondary-button" onClick={() => setShowPreview(false)} type="button">Back to product selection</button><button className="secondary-button" onClick={resetSelection} type="button">Cancel</button><button className="primary-button" onClick={() => window.print()} type="button">Print labels</button></div></section>
      <div className="label-preview-pager no-print"><button className="secondary-button" disabled={previewPage <= 0} onClick={() => setPreviewPage(value => value - 1)} type="button">Previous page</button><span>Preview page {previewPage + 1} of {pageCount} · {pageLabels.length} labels on this sheet</span><button className="secondary-button" disabled={previewPage >= pageCount - 1} onClick={() => setPreviewPage(value => value + 1)} type="button">Next page</button></div>
      <div className="label-print-pages" style={layoutStyle}>{Array.from({ length: pageCount }, (_, pageIndex) => {
        const sheetLabels = labels.slice(pageIndex * pageCapacity, (pageIndex + 1) * pageCapacity)
        return <div aria-label={`A4 label sheet ${pageIndex + 1}`} className={`label-sheet ${settings.orientation === 'landscape' ? 'label-sheet-landscape' : ''} ${pageIndex === previewPage ? 'label-sheet-current' : ''}`} key={pageIndex}>
          {sheetLabels.map((product, index) => <BarcodeLabel key={`${pageIndex}-${index}`} product={product} settings={settings} />)}
        </div>
      })}</div>
      <p className="label-print-hint no-print">In the print dialog, choose A4 and 100% / Actual size. Turn off “Fit to page.” For a new label-sheet brand, print one test page on plain paper first.</p>
    </>}
  </section>
}

function LayoutEditor({ settings, updateSetting }: { settings: LayoutSettings; updateSetting: <K extends keyof LayoutSettings>(key: K, value: LayoutSettings[K]) => void }) {
  const numberField = (label: string, key: Exclude<keyof LayoutSettings, 'orientation' | 'shopName' | 'showShopName' | 'showBrandModel' | 'showSalePrice'>, step = '1') => <label key={key}>{label}<input min="0" onChange={e => updateSetting(key, Number(e.target.value))} step={step} type="number" value={settings[key]} /></label>
  return <section className="catalogue-card label-layout-card no-print" aria-label="A4 label layout settings">
    <div className="catalogue-toolbar"><div><h2>Label sheet layout</h2><p>Preset: Avery L7160 compatible A4 sheet. Adjust for your label brand.</p></div><button className="secondary-button" onClick={() => { Object.entries(defaults).forEach(([key, value]) => updateSetting(key as keyof LayoutSettings, value as never)) }} type="button">Reset L7160 preset</button></div>
    <div className="label-layout-fields">
      <label>Orientation<select onChange={e => updateSetting('orientation', e.target.value as LayoutSettings['orientation'])} value={settings.orientation}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
      {numberField('Label width (mm)', 'labelWidth', '0.1')}{numberField('Label height (mm)', 'labelHeight', '0.1')}
      {numberField('Columns', 'columns')}{numberField('Rows', 'rows')}
      {numberField('Horizontal spacing (mm)', 'horizontalGap', '0.1')}{numberField('Vertical spacing (mm)', 'verticalGap', '0.1')}
      {numberField('Left margin (mm)', 'marginLeft', '0.1')}{numberField('Right margin (mm)', 'marginRight', '0.1')}
      {numberField('Top margin (mm)', 'marginTop', '0.1')}{numberField('Bottom margin (mm)', 'marginBottom', '0.1')}
    </div>
    <div className="label-display-options"><label className="label-shop-name-toggle"><input checked={settings.showShopName} onChange={e => updateSetting('showShopName', e.target.checked)} type="checkbox" />Show shop name<input disabled={!settings.showShopName} maxLength={80} onChange={e => updateSetting('shopName', e.target.value)} placeholder="Shop name" value={settings.shopName} /></label><label><input checked={settings.showBrandModel} onChange={e => updateSetting('showBrandModel', e.target.checked)} type="checkbox" />Show brand / model</label><label><input checked={settings.showSalePrice} onChange={e => updateSetting('showSalePrice', e.target.checked)} type="checkbox" />Show sale price</label></div>
  </section>
}

function BarcodeLabel({ product, settings }: { product: Product; settings: LayoutSettings }) {
  const svgRef = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!svgRef.current || !product.barcode) return
    try {
      JsBarcode(svgRef.current, product.barcode, { format: 'CODE128', displayValue: false, lineColor: '#000000', background: '#ffffff', width: 1.25, height: 42, margin: 13 })
    } catch { svgRef.current.replaceChildren() }
  }, [product.barcode])
  const detail = [product.brand, product.model].filter(Boolean).join(' · ')
  return <article className="barcode-label">
    {settings.showShopName && settings.shopName.trim() && <strong className="barcode-label-shop">{settings.shopName.trim()}</strong>}
    <strong className="barcode-label-name">{product.name}</strong>
    {settings.showBrandModel && detail && <span className="barcode-label-detail">{detail}</span>}
    {settings.showSalePrice && <strong className="barcode-label-price">{money(product.salePrice)}</strong>}
    <svg aria-label={`Code 128 barcode ${product.barcode}`} className="barcode-label-symbol" ref={svgRef} />
    <span className="barcode-label-value">{product.barcode}</span>
  </article>
}
