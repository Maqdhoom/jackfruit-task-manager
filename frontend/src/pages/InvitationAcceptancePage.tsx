import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { getErrorMessage, useAuth } from '../auth/AuthContext'
import { acceptProjectInvitation, getInvitationDetails, type InvitationDetails } from '../services/projectService'

export default function InvitationAcceptancePage() {
  const { token } = useParams()
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isAccepting, setIsAccepting] = useState(false)
  const [acceptedProjectId, setAcceptedProjectId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!token) {
      setError('This invitation link is invalid.')
      setIsLoading(false)
      return () => {
        active = false
      }
    }

    getInvitationDetails(token)
      .then((details) => {
        if (active) setInvitation(details)
      })
      .catch((requestError: unknown) => {
        if (active) setError(getErrorMessage(requestError, 'Unable to load this invitation.'))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [token])

  async function handleAccept() {
    if (!token) return
    setError('')
    setIsAccepting(true)
    try {
      const result = await acceptProjectInvitation(token)
      setAcceptedProjectId(result.projectId)
      setInvitation((current) => current ? { ...current, status: 'accepted' } : current)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to accept this invitation.'))
    } finally {
      setIsAccepting(false)
    }
  }

  async function handleSwitchAccount() {
    try {
      await logout()
      navigate('/', { replace: true, state: { from: location } })
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to log out. Please try again.'))
    }
  }

  const emailMatches = user && invitation && user.email.toLowerCase() === invitation.email.toLowerCase()

  return (
    <main className="auth-card">
      <p className="eyebrow">PROJECT INVITATION</p>
      {isLoading ? (
        <p className="muted" role="status">Loading invitation...</p>
      ) : error && !invitation ? (
        <>
          <h1>Invitation unavailable</h1>
          <p className="error" role="alert">{error}</p>
          <Link className="button" to="/projects">Go to projects</Link>
        </>
      ) : invitation ? (
        <>
          <h1>Join {invitation.projectName}</h1>
          <p className="muted">
            You were invited as <strong>{invitation.role}</strong> at <strong>{invitation.email}</strong>.
          </p>
          {invitation.status === 'accepted' ? (
            <>
              <p className="success" role="status">This invitation has already been accepted.</p>
              <button className="button" onClick={() => navigate(`/projects/${acceptedProjectId ?? invitation.projectId}`)} type="button">Open project</button>
            </>
          ) : invitation.status !== 'pending' ? (
            <p className="error" role="alert">This invitation is {invitation.status} and can no longer be accepted.</p>
          ) : user && !emailMatches ? (
            <>
              <p className="error" role="alert">
                You are signed in as {user.email}. Sign in with {invitation.email} to accept this invitation.
              </p>
              <button className="button" onClick={() => void handleSwitchAccount()} type="button">Switch account</button>
            </>
          ) : user ? (
            <button className="button" disabled={isAccepting} onClick={() => void handleAccept()} type="button">
              {isAccepting ? 'Accepting...' : 'Accept invitation'}
            </button>
          ) : (
            <>
              <p className="muted">Sign in or create an account using the invited email address to continue.</p>
              <div className="task-form-actions">
                <Link className="button" state={{ from: location }} to="/">Log in</Link>
                <Link className="button button-secondary" state={{ from: location }} to="/register">Create account</Link>
              </div>
            </>
          )}
          {error && invitation.status === 'pending' && <p className="error" role="alert">{error}</p>}
        </>
      ) : null}
    </main>
  )
}
