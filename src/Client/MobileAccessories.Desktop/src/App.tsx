import { useCallback, useEffect, useState } from 'react'
import { signOut, getCurrentUser } from './api/auth'
import { ApiError } from './api/client'
import type { UserSummary } from './api/types'
import './App.css'
import { LoginPage } from './components/LoginPage'
import { ProductManagement } from './components/ProductManagement'
import { CategoryManagement } from './components/CategoryManagement'
import { InvoiceManagement } from './components/InvoiceManagement'
import { BarcodeLabelPrinting } from './components/BarcodeLabelPrinting'
import { UserManagement } from './components/UserManagement'

function App() {
  const [user, setUser] = useState<UserSummary | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [adminPage, setAdminPage] = useState<'products' | 'categories' | 'invoices' | 'labels' | 'users'>('products')

  useEffect(() => {
    let isCurrent = true

    getCurrentUser()
      .then((currentUser) => {
        if (isCurrent) setUser(currentUser)
      })
      .catch((requestError: unknown) => {
        if (!isCurrent) return

        if (requestError instanceof ApiError && requestError.status === 401) {
          setUser(null)
          return
        }

        setConnectionError(
          'Could not reach the shop server. Start the API, then retry.',
        )
      })
      .finally(() => {
        if (isCurrent) setIsCheckingSession(false)
      })

    return () => {
      isCurrent = false
    }
  }, [])

  const handleSessionExpired = useCallback(() => {
    setUser(null)
  }, [])

  async function handleSignOut() {
    setLogoutError(null)
    try {
      await signOut()
      setUser(null)
    } catch {
      setLogoutError('Could not sign out. Check the API connection and try again.')
    }
  }

  if (isCheckingSession) {
    return (
      <main className="loading-screen">
        <span className="loading-mark">MA</span>
        <p>Connecting to your shop…</p>
      </main>
    )
  }

  if (connectionError && !user) {
    return (
      <main className="connection-screen">
        <span className="loading-mark">MA</span>
        <h1>Shop server unavailable</h1>
        <p>{connectionError}</p>
        <button className="primary-button" onClick={() => window.location.reload()} type="button">
          Try again
        </button>
      </main>
    )
  }

  if (!user) {
    return <LoginPage onSignedIn={setUser} />
  }

  const isAdmin = user.roles.includes('Admin')
  const currentPage = isAdmin ? adminPage : 'invoices'

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-lockup app-brand-lockup">
          <span className="brand-mark">MA</span>
          <span>Mobile Accessories</span>
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>
        <nav aria-label="Main navigation" className="side-navigation">
          {isAdmin ? <>
            <button aria-current={currentPage === 'products' ? 'page' : undefined} className={`nav-item ${currentPage === 'products' ? 'nav-item-active' : ''}`} onClick={() => setAdminPage('products')} type="button"><span aria-hidden="true">▦</span> Products</button>
            <button aria-current={currentPage === 'categories' ? 'page' : undefined} className={`nav-item ${currentPage === 'categories' ? 'nav-item-active' : ''}`} onClick={() => setAdminPage('categories')} type="button"><span aria-hidden="true">▤</span> Categories</button>
            <button aria-current={currentPage === 'invoices' ? 'page' : undefined} className={`nav-item ${currentPage === 'invoices' ? 'nav-item-active' : ''}`} onClick={() => setAdminPage('invoices')} type="button"><span aria-hidden="true">▧</span> Invoices</button>
            <button aria-current={currentPage === 'labels' ? 'page' : undefined} className={`nav-item ${currentPage === 'labels' ? 'nav-item-active' : ''}`} onClick={() => setAdminPage('labels')} type="button"><span aria-hidden="true">▥</span> Barcode labels</button>
            <button aria-current={currentPage === 'users' ? 'page' : undefined} className={`nav-item ${currentPage === 'users' ? 'nav-item-active' : ''}`} onClick={() => setAdminPage('users')} type="button"><span aria-hidden="true">♙</span> Users</button>
          </> : (
            <div aria-current="page" className="nav-item nav-item-active">
              <span aria-hidden="true">▤</span> Invoices
            </div>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-help-mark">?</div>
          <div>
            <strong>Need help?</strong>
            <span>Contact your administrator</span>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="breadcrumb">Shop workspace <span>/</span> {currentPage === 'categories' ? 'Categories' : currentPage === 'invoices' ? 'Invoices' : currentPage === 'labels' ? 'Barcode labels' : currentPage === 'users' ? 'Users' : 'Products'}</div>
          <div className="account-menu">
            <span className="account-avatar">{user.email.slice(0, 1).toUpperCase()}</span>
            <span className="account-details">
              <strong>{user.email}</strong>
              <small>{isAdmin ? 'Administrator' : 'User'}</small>
            </span>
            <button className="signout-button" onClick={() => void handleSignOut()} type="button">
              Sign out
            </button>
          </div>
        </header>

        {logoutError && <div className="global-notice" role="alert">{logoutError}</div>}

        <main className="app-workspace">
          {currentPage === 'invoices' ? (
            <InvoiceManagement onSessionExpired={handleSessionExpired} />
          ) : currentPage === 'users' ? (
            <UserManagement onSessionExpired={handleSessionExpired} />
          ) : currentPage === 'labels' ? (
            <BarcodeLabelPrinting onSessionExpired={handleSessionExpired} />
          ) : adminPage === 'categories' ? (
            <CategoryManagement onSessionExpired={handleSessionExpired} />
          ) : (
            <ProductManagement onSessionExpired={handleSessionExpired} />
          )}
          {/* old invoice placeholder removed */}
          {false && (
            <section className="page-content invoice-coming-soon">
              <p className="eyebrow">BILLING</p>
              <h1>Invoice workspace</h1>
              <p className="muted-copy">
                Invoice creation, history, and printing will be connected after the invoice API is built.
              </p>
              <div className="coming-soon-card">
                <span className="coming-soon-icon">▤</span>
                <div>
                  <strong>Your invoice workspace is being prepared</strong>
                  <p>Both Admin and User accounts will be able to create, view, and print invoices.</p>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
