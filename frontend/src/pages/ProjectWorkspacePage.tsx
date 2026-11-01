import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { getErrorMessage, useAuth } from '../auth/AuthContext'
import {
  addProjectMember,
  createProjectTask,
  deleteProjectTask,
  getProject,
  getProjectTasks,
  removeProjectMember,
  updateProjectMember,
  updateProjectTask,
  type MemberRole,
  type Project,
  type ProjectRole,
  type ProjectTask,
  type ProjectTaskInput,
  type ProjectTaskStatus,
  type TaskPriority,
} from '../services/projectService'

const statuses: ProjectTaskStatus[] = ['Pending', 'In Progress', 'Completed']
const emptyTask: ProjectTaskInput = {
  title: '',
  description: '',
  priority: 'Medium',
  status: 'Pending',
  deadline: null,
}

function displayDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function ProjectWorkspacePage() {
  const { projectId } = useParams()
  const { user } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [role, setRole] = useState<ProjectRole | null>(null)
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [form, setForm] = useState<ProjectTaskInput>(emptyTask)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [memberRole, setMemberRole] = useState<MemberRole>('editor')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadWorkspace = useCallback(async (showLoading = true) => {
    if (!projectId) return
    setError('')
    if (showLoading) setIsLoading(true)
    try {
      const [details, projectTasks] = await Promise.all([getProject(projectId), getProjectTasks(projectId)])
      setProject(details.project)
      setRole(details.role)
      setTasks(projectTasks)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load this project. Try again.'))
    } finally {
      if (showLoading) setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  if (!user) {
    return <Navigate to="/" replace />
  }

  const canEditTasks = role === 'owner' || role === 'editor'
  const canManageMembers = role === 'owner'

  function setField<K extends keyof ProjectTaskInput>(field: K, value: ProjectTaskInput[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function startEditing(task: ProjectTask) {
    setEditingId(task.id)
    setForm({
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      deadline: task.deadline?.slice(0, 10) ?? null,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEditing() {
    setEditingId(null)
    setForm(emptyTask)
  }

  async function handleSaveTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectId) return
    setError('')
    setNotice('')
    setIsSaving(true)
    try {
      if (editingId) {
        await updateProjectTask(projectId, editingId, form)
        setNotice('Task updated.')
      } else {
        await createProjectTask(projectId, form)
        setNotice('Task added to the project.')
      }
      cancelEditing()
      await loadWorkspace()
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to save task. Try again.'))
    } finally {
      setIsSaving(false)
    }
  }

  async function changeTaskStatus(task: ProjectTask, status: ProjectTaskStatus) {
    if (!projectId) return
    setError('')
    try {
      await updateProjectTask(projectId, task.id, { status })
      await loadWorkspace(false)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to update task status. Try again.'))
    }
  }

  async function handleDeleteTask(task: ProjectTask) {
    if (!projectId) return
    setError('')
    try {
      await deleteProjectTask(projectId, task.id)
      await loadWorkspace(false)
      setNotice('Task deleted.')
      if (editingId === task.id) cancelEditing()
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to delete task. Try again.'))
    }
  }

  async function handleAddMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectId) return
    setError('')
    setNotice('')
    try {
      const updated = await addProjectMember(projectId, email, memberRole)
      setProject(updated)
      setEmail('')
      setNotice('Team member added.')
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to add team member. Try again.'))
    }
  }

  async function changeMemberRole(userId: string, nextRole: MemberRole) {
    if (!projectId) return
    setError('')
    try {
      setProject(await updateProjectMember(projectId, userId, nextRole))
      setNotice('Member role updated.')
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to update member role. Try again.'))
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!projectId) return
    setError('')
    try {
      setProject(await removeProjectMember(projectId, userId))
      setNotice('Member removed from the project.')
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to remove member. Try again.'))
    }
  }

  return (
    <main className="projects-shell">
      <aside className="projects-sidebar">
        <Link aria-label="Task Manager home" className="brand-mark" to="/projects">
          <span aria-hidden="true" className="brand-icon">✦</span><span>Task Z</span>
        </Link>
        <div className="workspace-switcher">
          <span className="workspace-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
          <span>{user.name}&apos;s workspace</span><span aria-hidden="true">⌄</span>
        </div>
        <p className="sidebar-label">MAIN MENU</p>
        <nav aria-label="Main navigation" className="sidebar-nav">
          <Link to="/dashboard"><span aria-hidden="true">▦</span> My tasks</Link>
          <Link className="active" to="/projects"><span aria-hidden="true">◈</span> Projects</Link>
        </nav>
        <div className="sidebar-bottom">
          <Link className="button add-project-sidebar" to="/projects">← All projects</Link>
          <span className="sidebar-current-user">{user.name}</span>
        </div>
      </aside>

      <section className="projects-main">
        <header className="projects-topbar">
          <div className="projects-breadcrumb"><Link to="/projects">Projects</Link><span aria-hidden="true">/</span><strong>{project?.name ?? 'Workspace'}</strong></div>
          <span className="user-avatar" title={user.name}>{user.name.slice(0, 1).toUpperCase()}</span>
        </header>
        <div className="workspace-content">
          {error && <p className="error project-message" role="alert">{error}</p>}
          {notice && <p className="success project-message" role="status">{notice}</p>}
          {isLoading ? (
            <p className="empty-state" role="status">Loading project workspace...</p>
          ) : project ? (
            <>
              <div className="workspace-heading">
                <div>
                  <p className="eyebrow">PROJECT WORKSPACE · {role?.toUpperCase()}</p>
                  <h1>{project.name}</h1>
                  <p className="muted">{project.description || 'Shared project tasks and progress.'}</p>
                  <div className="workspace-members">
                    <span className="member-avatar owner-avatar">{project.owner.name.slice(0, 1).toUpperCase()}</span>
                    {project.members.map((member, index) => (
                      <span className={`member-avatar member-color-${index % 4}`} key={member.id} title={`${member.name} · ${member.role}`}>
                        {member.name.slice(0, 1).toUpperCase()}
                      </span>
                    ))}
                    <span className="muted">{project.memberCount} members · {project.progress}% complete</span>
                  </div>
                </div>
                <div aria-label={`${project.progress}% complete`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={project.progress} className="workspace-progress" role="progressbar">
                  <span style={{ width: `${project.progress}%` }} />
                </div>
              </div>

              {canEditTasks && (
                <form className="project-task-form" onSubmit={(event) => void handleSaveTask(event)}>
                  <div className="task-form-title">
                    <h2>{editingId ? 'Edit task' : 'Add a task'}</h2>
                    <p className="muted">Changes are shared with project members.</p>
                  </div>
                  <label>
                    Task title
                    <input maxLength={160} onChange={(event) => setField('title', event.target.value)} placeholder="What needs to get done?" required value={form.title} />
                  </label>
                  <label>
                    Description
                    <input maxLength={2000} onChange={(event) => setField('description', event.target.value)} placeholder="Optional details" value={form.description} />
                  </label>
                  <label>
                    Priority
                    <select onChange={(event) => setField('priority', event.target.value as TaskPriority)} value={form.priority}>
                      <option>Low</option><option>Medium</option><option>High</option>
                    </select>
                  </label>
                  <label>
                    Status
                    <select onChange={(event) => setField('status', event.target.value as ProjectTaskStatus)} value={form.status}>
                      {statuses.map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </label>
                  <label>
                    Deadline <span className="muted">(optional)</span>
                    <input onChange={(event) => setField('deadline', event.target.value || null)} type="date" value={form.deadline ?? ''} />
                  </label>
                  <div className="task-form-actions">
                    <button className="button" disabled={isSaving} type="submit">{isSaving ? 'Saving...' : editingId ? 'Save changes' : 'Add task'}</button>
                    {editingId && <button className="button button-secondary" onClick={cancelEditing} type="button">Cancel</button>}
                  </div>
                </form>
              )}

              <section aria-label="Project task board" className="project-board">
                {statuses.map((status) => {
                  const columnTasks = tasks.filter((task) => task.status === status)
                  return (
                    <section aria-label={`${status} tasks`} className="board-column" key={status}>
                      <div className="board-column-heading">
                        <h2><span className={`board-status-dot board-dot-${status.toLowerCase().replace(' ', '-')}`} />{status}</h2>
                        <span className="board-count">{columnTasks.length}</span>
                      </div>
                      {columnTasks.length ? (
                        <ul className="board-task-list">
                          {columnTasks.map((task) => (
                            <li className="board-task-card" key={task.id}>
                              <div className="board-task-top">
                                <span className={`task-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                                {canEditTasks && (
                                  <div className="task-actions">
                                    <button aria-label={`Edit ${task.title}`} className="text-button" onClick={() => startEditing(task)} type="button">Edit</button>
                                    <button aria-label={`Delete ${task.title}`} className="text-button delete-button" onClick={() => void handleDeleteTask(task)} type="button">Delete</button>
                                  </div>
                                )}
                              </div>
                              <h3>{task.title}</h3>
                              {task.description && <p className="board-task-description">{task.description}</p>}
                              <div className="board-task-footer">
                                {task.deadline ? <time dateTime={task.deadline}>Due {displayDate(task.deadline)}</time> : <span>No deadline</span>}
                                {canEditTasks && (
                                  <select aria-label={`Move ${task.title} to`} onChange={(event) => void changeTaskStatus(task, event.target.value as ProjectTaskStatus)} value={task.status}>
                                    {statuses.map((option) => <option key={option}>{option}</option>)}
                                  </select>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="board-empty">{canEditTasks ? 'No tasks here yet.' : 'No tasks in this column.'}</p>
                      )}
                    </section>
                  )
                })}
              </section>

              {canManageMembers && (
                <section aria-labelledby="members-heading" className="member-management">
                  <div className="member-management-heading">
                    <div><p className="eyebrow">COLLABORATION</p><h2 id="members-heading">Team members</h2></div>
                    <span className="task-count">{project.memberCount}</span>
                  </div>
                  <form className="member-add-form" onSubmit={(event) => void handleAddMember(event)}>
                    <label>
                      Add an existing account by email
                      <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="teammate@example.com" required type="email" value={email} />
                    </label>
                    <label>
                      Role
                      <select onChange={(event) => setMemberRole(event.target.value as MemberRole)} value={memberRole}>
                        <option value="editor">Editor</option><option value="viewer">Viewer</option>
                      </select>
                    </label>
                    <button className="button" type="submit">Add member</button>
                  </form>
                  <ul className="member-list">
                    <li className="member-list-item">
                      <span className="member-avatar owner-avatar">{project.owner.name.slice(0, 1).toUpperCase()}</span>
                      <span className="member-identity"><strong>{project.owner.name}{project.owner.id === user.id ? ' (you)' : ''}</strong><small>{project.owner.email}</small></span>
                      <span className="role-pill">Owner</span>
                    </li>
                    {project.members.map((member, index) => (
                      <li className="member-list-item" key={member.id}>
                        <span className={`member-avatar member-color-${index % 4}`}>{member.name.slice(0, 1).toUpperCase()}</span>
                        <span className="member-identity"><strong>{member.name}</strong><small>{member.email}</small></span>
                        <select aria-label={`Role for ${member.name}`} onChange={(event) => void changeMemberRole(member.id, event.target.value as MemberRole)} value={member.role}>
                          <option value="editor">Editor</option><option value="viewer">Viewer</option>
                        </select>
                        <button aria-label={`Remove ${member.name}`} className="text-button delete-button" onClick={() => void handleRemoveMember(member.id)} type="button">Remove</button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : (
            <div className="projects-empty">
              <h2>Project unavailable</h2>
              <p>This project may have been removed or you may no longer have access.</p>
              <button className="button button-secondary" onClick={() => void loadWorkspace()} type="button">Try again</button>
              <Link className="button" to="/projects">Back to projects</Link>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
