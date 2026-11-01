import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { getErrorMessage, useAuth } from '../auth/AuthContext'
import { createProject, listProjects, type Project } from '../services/projectService'

export default function ProjectsPage() {
  const { user, logout } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadProjects = useCallback(async () => {
    setError('')
    setIsLoading(true)
    try {
      setProjects(await listProjects())
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load your projects. Try again.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  if (!user) {
    return <Navigate to="/" replace />
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsCreating(true)
    try {
      const project = await createProject({ name, description })
      setProjects((current) => [project, ...current])
      setName('')
      setDescription('')
      setShowForm(false)
      setNotice('Project created. Invite your team when you are ready.')
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to create project. Try again.'))
    } finally {
      setIsCreating(false)
    }
  }

  async function handleLogout() {
    try {
      await logout()
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Logout failed. Please try again.'))
    }
  }

  return (
    <main className="projects-shell">
      <aside className="projects-sidebar">
        <Link aria-label="Task Manager home" className="brand-mark" to="/projects">
          <span aria-hidden="true" className="brand-icon">✦</span>
          <span>Task Z</span>
        </Link>
        <div className="workspace-switcher">
          <span className="workspace-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
          <span>{user.name}&apos;s workspace</span>
          <span aria-hidden="true">⌄</span>
        </div>
        <p className="sidebar-label">MAIN MENU</p>
        <nav aria-label="Main navigation" className="sidebar-nav">
          <Link to="/dashboard"><span aria-hidden="true">▦</span> My tasks</Link>
          <Link aria-current="page" className="active" to="/projects"><span aria-hidden="true">◈</span> Projects</Link>
        </nav>
        <div className="sidebar-bottom">
          <button className="button add-project-sidebar" onClick={() => setShowForm((value) => !value)} type="button">
            <span aria-hidden="true">＋</span> Add project
          </button>
          <button className="sidebar-logout" onClick={() => void handleLogout()} type="button">↪ Log out</button>
        </div>
      </aside>

      <section className="projects-main">
        <header className="projects-topbar">
          <div className="projects-breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>Projects</strong></div>
          <div className="projects-user"><span>{user.name}</span><span className="user-avatar">{user.name.slice(0, 1).toUpperCase()}</span></div>
        </header>
        <div className="projects-content">
          <div className="projects-heading">
            <div>
              <p className="eyebrow">YOUR TEAM WORKSPACES</p>
              <h1>Projects</h1>
              <p className="muted">Bring your team&apos;s work together in one shared space.</p>
            </div>
            <button className="button" onClick={() => setShowForm((value) => !value)} type="button">
              <span aria-hidden="true">＋</span> Add project
            </button>
          </div>

          {error && <p className="error project-message" role="alert">{error}</p>}
          {notice && <p className="success project-message" role="status">{notice}</p>}

          {showForm && (
            <form className="project-create-form" onSubmit={(event) => void handleCreate(event)}>
              <div>
                <h2>Create a project</h2>
                <p className="muted">Set up a shared workspace and invite your team.</p>
              </div>
              <label>
                Project name
                <input autoFocus maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="e.g. Website redesign" required value={name} />
              </label>
              <label>
                Description <span className="muted">(optional)</span>
                <textarea maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="What is this project about?" rows={3} value={description} />
              </label>
              <div className="project-form-actions">
                <button className="button" disabled={isCreating} type="submit">{isCreating ? 'Creating...' : 'Create project'}</button>
                <button className="button button-secondary" onClick={() => setShowForm(false)} type="button">Cancel</button>
              </div>
            </form>
          )}

          <div className="project-section-heading">
            <h2>All projects <span className="task-count">{projects.length}</span></h2>
            <button className="text-button" disabled={isLoading} onClick={() => void loadProjects()} type="button">
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {isLoading ? (
            <p className="empty-state" role="status">Loading your projects...</p>
          ) : projects.length ? (
            <div className="project-grid">
              {projects.map((project, index) => (
                <Link className="project-card" key={project.id} to={`/projects/${project.id}`}>
                  <div className="project-card-title">
                    <span className={`project-icon project-icon-${index % 5}`} aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span>
                    <h3>{project.name}</h3>
                    <span aria-hidden="true" className="project-card-arrow">↗</span>
                  </div>
                  <p className="project-card-description">{project.description || 'No description yet.'}</p>
                  <div className="project-card-meta">
                    <div aria-label={`${project.memberCount} project members`} className="member-stack">
                      <span className="member-avatar owner-avatar">{project.owner.name.slice(0, 1).toUpperCase()}</span>
                      {project.members.slice(0, 3).map((member, memberIndex) => (
                        <span className={`member-avatar member-color-${memberIndex % 4}`} key={member.id}>{member.name.slice(0, 1).toUpperCase()}</span>
                      ))}
                      {project.memberCount > 4 && <span className="member-overflow">+{project.memberCount - 4}</span>}
                    </div>
                    <span>{project.memberCount} {project.memberCount === 1 ? 'member' : 'members'}</span>
                  </div>
                  <div className="project-progress-heading">
                    <span>Project progress</span>
                    <strong>{project.progress}%</strong>
                  </div>
                  <div aria-label={`${project.progress}% complete`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={project.progress} className="project-progress-track" role="progressbar">
                    <span style={{ width: `${project.progress}%` }} />
                  </div>
                  <p className="project-card-footer">{project.completedTaskCount} of {project.taskCount} tasks completed</p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="projects-empty">
              <span aria-hidden="true" className="empty-project-icon">◈</span>
              <h2>Your projects start here</h2>
              <p>Create a project to plan work and collaborate with your team.</p>
              <button className="button" onClick={() => setShowForm(true)} type="button">Create your first project</button>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
