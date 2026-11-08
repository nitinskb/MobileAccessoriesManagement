import { useState } from 'react'
import type { FormEvent } from 'react'
import { signIn } from '../api/auth'
import { ApiError } from '../api/client'
import type { UserSummary } from '../api/types'

interface LoginPageProps {
  onSignedIn: (user: UserSummary) => void
}

export function LoginPage({ onSignedIn }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const user = await signIn(email.trim(), password)
      setPassword('')
      onSignedIn(user)
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Could not connect to the server. Check that the API is running and try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-screen">
      <div className="login-card">
      <section className="login-brand-panel" aria-label="Shop management system">
        <div className="brand-lockup">
          <span className="brand-mark">MA</span>
          <span>Mobile Accessories</span>
        </div>
        <div className="login-brand-copy">
          <p className="eyebrow">RETAIL MANAGEMENT</p>
          <h1>Run your shop with confidence.</h1>
          <p className="login-intro">
            Products, billing, and daily operations in one workspace.
          </p>
        </div>
        <div className="login-panel-footer">
          <span className="connection-dot" />
          Secure shop access
        </div>
      </section>

      <section className="login-form-panel">
        <div className="login-form-wrap">
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Sign in to your account</h2>
          <p className="muted-copy">Use the account provided by your administrator.</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor="login-email">Email address</label>
            <input
              autoComplete="username"
              autoFocus
              id="login-email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@shop.com"
              required
              type="email"
              value={email}
            />

            <label htmlFor="login-password">Password</label>
            <input
              autoComplete="current-password"
              id="login-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
              type="password"
              value={password}
            />

            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}

            <button className="primary-button login-submit" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Signing in…' : 'Sign in'}
              {!isSubmitting && <span aria-hidden="true">→</span>}
            </button>
          </form>

          <p className="login-security-note">
            Your session is protected by the shop server. Sign out when you leave this device.
          </p>
        </div>
      </section>
      </div>
    </main>
  )
}
