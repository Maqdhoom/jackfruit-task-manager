import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getErrorMessage, useAuth } from '../auth/AuthContext'

export default function RegisterPage() {
  const { register, status } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await register(name, email, password)
      navigate('/dashboard', { replace: true })
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Registration failed. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-card">
      <p className="eyebrow">TASK MANAGER</p>
      <h1>Create your account</h1>
      <p className="muted">A few details and you can get started.</p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="name">Full name</label>
        <input
          autoComplete="name"
          id="name"
          maxLength={80}
          name="name"
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
        <label htmlFor="email">Email</label>
        <input
          autoComplete="email"
          id="email"
          maxLength={254}
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
        <label htmlFor="password">Password</label>
        <input
          autoComplete="new-password"
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
          {isSubmitting ? 'Creating account...' : status === 'loading' ? 'Checking session...' : 'Create account'}
        </button>
      </form>
      <p className="form-footer">Already registered? <Link to="/">Log in</Link></p>
    </main>
  )
}
