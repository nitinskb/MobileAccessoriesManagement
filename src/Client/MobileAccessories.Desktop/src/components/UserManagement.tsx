import { useState } from 'react'
import type { FormEvent } from 'react'
import { createUser } from '../api/users'
import { ApiError } from '../api/client'

interface Props { onSessionExpired: () => void }

export function UserManagement({ onSessionExpired }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [createdEmail, setCreatedEmail] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setCreatedEmail(null)

    if (password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }

    setSaving(true)
    try {
      const createdUser = await createUser(email.trim(), password)
      setCreatedEmail(createdUser.email)
      setEmail('')
      setPassword('')
      setConfirmPassword('')
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired()
      } else if (requestError instanceof ApiError && requestError.status === 403) {
        setError('Only an administrator can create user accounts.')
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Could not create the user account.')
      }
    } finally {
      setSaving(false)
    }
  }

  return <section className="page-content">
    <div className="page-heading-row">
      <div>
        <p className="eyebrow">ACCESS CONTROL</p>
        <h1>User accounts</h1>
        <p className="muted-copy">Create staff accounts for invoice creation, viewing and printing.</p>
      </div>
    </div>

    <section className="catalogue-card user-create-card" aria-labelledby="create-user-heading">
      <div className="catalogue-toolbar">
        <div>
          <h2 id="create-user-heading">Create a user</h2>
          <p>New accounts receive the User role and cannot access administration features.</p>
        </div>
        <span className="status-pill status-active">User role</span>
      </div>
      <form className="product-form" onSubmit={event => void submit(event)}>
        <div className="form-grid">
          <label className="field-wide">Email address <span>*</span>
            <input autoComplete="email" maxLength={256} onChange={event => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label>Password <span>*</span>
            <input autoComplete="new-password" maxLength={128} minLength={12} onChange={event => setPassword(event.target.value)} required type="password" value={password} />
            <small>At least 12 characters with uppercase, lowercase, number and symbol.</small>
          </label>
          <label>Confirm password <span>*</span>
            <input autoComplete="new-password" maxLength={128} minLength={12} onChange={event => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} />
          </label>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {createdEmail && <div className="user-created-notice" role="status"><strong>Account created.</strong> {createdEmail} can now sign in with the User role. Share the temporary password securely.</div>}
        <div className="editor-actions">
          <button className="primary-button" disabled={saving} type="submit">{saving ? 'Creating account…' : 'Create user'}</button>
        </div>
      </form>
    </section>
  </section>
}
