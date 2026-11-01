import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getErrorMessage, useAuth } from '../auth/AuthContext'

export default function LoginPage() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Login failed. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-card">
      <p className="eyebrow">TASK MANAGER</p>
      <h1>Welcome back</h1>
      <p className="muted">Log in to continue to your workspace.</p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          autoComplete="email"
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
        <label htmlFor="password">Password</label>
        <input
          autoComplete="current-password"
          id="password"
          minLength={8}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button" disabled={isSubmitting || status === 'loading'} type="submit">
          {isSubmitting ? 'Logging in...' : status === 'loading' ? 'Checking session...' : 'Log in'}
        </button>
      </form>
      <p className="form-footer">New here? <Link to="/register">Create an account</Link></p>
    </main>
  )
}
