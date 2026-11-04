import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { getErrorMessage, useAuth } from '../auth/AuthContext'
import ProjectActivityFeed from '../components/ProjectActivityFeed'
import TaskComments from '../components/TaskComments'
import {
  addProjectMember,
  createProjectInvitation,
  createProjectTaskTransferRequest,
  createProjectTask,
  deleteProjectTask,
  getProject,
  getProjectTasks,
  listProjectInvitations,
  listProjectTaskTransferRequests,
  removeProjectMember,
  cancelProjectTaskTransferRequest,
  resendProjectInvitation,
  revokeProjectInvitation,
  updateProjectMember,
  updateProjectTask,
  type MemberRole,
  type Project,
  type ProjectInvitation,
  type ProjectRole,
  type ProjectTask,
  type ProjectTaskTransferRequest,
  type ProjectTaskInput,
  type ProjectTaskStatus,
  type TaskPriority,
} from '../services/projectService'
import { notifyProjectActivityChanged } from '../services/collaborationService'

const statuses: ProjectTaskStatus[] = ['Pending', 'In Progress', 'Completed']
const emptyTask: ProjectTaskInput = {
  title: '',
  description: '',
  priority: 'Medium',
  status: 'Pending',
  deadline: null,
  assigneeIds: [],
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
  const [showAssignedToMe, setShowAssignedToMe] = useState(false)
  const [taskToComplete, setTaskToComplete] = useState<ProjectTask | null>(null)
  const [isConfirmingCompletion, setIsConfirmingCompletion] = useState(false)
  const [form, setForm] = useState<ProjectTaskInput>(emptyTask)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [commentTaskId, setCommentTaskId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [memberRole, setMemberRole] = useState<MemberRole>('member')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('member')
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([])
  const [taskTransferRequests, setTaskTransferRequests] = useState<ProjectTaskTransferRequest[]>([])
  const [transferTargetId, setTransferTargetId] = useState('')
  const [teamActionId, setTeamActionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadWorkspace = useCallback(async (showLoading = true) => {
    if (!projectId) return
    setError('')
    if (showLoading) setIsLoading(true)
    try {
      const [details, projectTasks] = await Promise.all([
        getProject(projectId),
        getProjectTasks(projectId, showAssignedToMe),
      ])
      const canManageTeam = details.role === 'owner' || details.role === 'admin'
      const [pendingInvitations, pendingTaskTransferRequests] = canManageTeam
        ? await Promise.all([
          listProjectInvitations(projectId),
          listProjectTaskTransferRequests(projectId),
        ])
        : [[], []]
      setProject(details.project)
      setRole(details.role)
      setTasks(projectTasks)
      setInvitations(pendingInvitations)
      setTaskTransferRequests(pendingTaskTransferRequests)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load this project. Try again.'))
    } finally {
      if (showLoading) setIsLoading(false)
    }
  }, [projectId, showAssignedToMe])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  if (!user) {
    return <Navigate to="/" replace />
  }

  const canEditTasks = role === 'owner' || role === 'admin' || role === 'member'
  const canManageMembers = role === 'owner' || role === 'admin'
  const canManageProjectTasks = role === 'owner' || role === 'admin'
  const canCreateTasks = canManageProjectTasks || role === 'member'
  const visibleProjectTasks = tasks
  const transferableMembers = project
    ? [
      { ...project.owner, role: 'owner' as const },
      ...project.members.filter((member) => member.role !== 'viewer'),
    ]
    : []

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
      assigneeIds: task.assignees.map((assignee) => assignee.id),
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
        notifyProjectActivityChanged(projectId)
        setNotice('Task updated.')
      } else {
        const input = { ...form }
        if (!canManageProjectTasks) delete input.assigneeIds
        await createProjectTask(projectId, input)
        notifyProjectActivityChanged(projectId)
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

    if (status === 'Completed' && task.status !== 'Completed') {
      setTaskToComplete(task)
      return
    }

    setError('')
    try {
      await updateProjectTask(projectId, task.id, { status })
      notifyProjectActivityChanged(projectId)
      await loadWorkspace(false)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to update task status. Try again.'))
    }
  }

  async function confirmTaskCompletion() {
    if (!projectId || !taskToComplete) return
    setError('')
    setIsConfirmingCompletion(true)
    try {
      await updateProjectTask(projectId, taskToComplete.id, { status: 'Completed' })
      notifyProjectActivityChanged(projectId)
      setTaskToComplete(null)
      setNotice('Task marked as completed.')
      await loadWorkspace(false)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to complete task. Try again.'))
    } finally {
      setIsConfirmingCompletion(false)
    }
  }

  async function handleDeleteTask(task: ProjectTask) {
    if (!projectId) return
    if (!window.confirm(`Delete "${task.title}" and its shared comments? The task will remain in project history. Your private notes remain private.`)) return
    setError('')
    try {
      await deleteProjectTask(projectId, task.id)
      notifyProjectActivityChanged(projectId)
      if (commentTaskId === task.id) setCommentTaskId(null)
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
    setTeamActionId('add-member')
    try {
      const updated = await addProjectMember(projectId, email, memberRole)
      setProject(updated)
      setEmail('')
      setNotice('Team member added.')
      await loadWorkspace(false)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to add team member. Try again.'))
    } finally {
      setTeamActionId(null)
    }
  }

  async function handleCreateInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectId) return
    setError('')
    setNotice('')
    setTeamActionId('create-invitation')
    try {
      const result = await createProjectInvitation(projectId, inviteEmail, inviteRole)
      setInviteEmail('')
      setNotice(result.message)
      await loadWorkspace(false)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to send the invitation. Try again.'))
    } finally {
      setTeamActionId(null)
    }
  }

  async function changeMemberRole(userId: string, nextRole: MemberRole) {
    if (!projectId) return
    setError('')
    setTeamActionId(userId)
    try {
      setProject(await updateProjectMember(projectId, userId, nextRole))
      notifyProjectActivityChanged(projectId)
      setNotice('Member role updated.')
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to update member role. Try again.'))
    } finally {
      setTeamActionId(null)
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!projectId) return
    setError('')
    setTeamActionId(userId)
    try {
      setProject(await removeProjectMember(projectId, userId))
      notifyProjectActivityChanged(projectId)
      setNotice('Member removed from the project.')
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to remove member. Try again.'))
    } finally {
      setTeamActionId(null)
    }
  }

  async function handleResendInvitation(invitation: ProjectInvitation) {
    if (!projectId) return
    setError('')
    setNotice('')
    setTeamActionId(invitation.id)
    try {
      const result = await resendProjectInvitation(projectId, invitation.id)
      setNotice(result.message)
      await loadWorkspace(false)
    } catch (requestError) {
      await loadWorkspace(false)
      setError(getErrorMessage(requestError, 'Unable to resend the invitation. Try again.'))
    } finally {
      setTeamActionId(null)
    }
  }

  async function handleRevokeInvitation(invitation: ProjectInvitation) {
    if (!projectId) return
    setError('')
    setTeamActionId(invitation.id)
    try {
      await revokeProjectInvitation(projectId, invitation.id)
      setInvitations((current) => current.filter((item) => item.id !== invitation.id))
      setNotice('Invitation revoked.')
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to revoke the invitation. Try again.'))
    } finally {
      setTeamActionId(null)
    }
  }

  async function handleRequestTaskTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectId || !transferTargetId) return
    setError('')
    setNotice('')
    setTeamActionId('task-transfer-request')
    try {
      await createProjectTaskTransferRequest(projectId, transferTargetId)
      setTransferTargetId('')
      setNotice('Task transfer request sent. The member must choose and approve a personal task before it is shared.')
      await loadWorkspace(false)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to send task transfer request.'))
    } finally {
      setTeamActionId(null)
    }
  }

  async function handleCancelTaskTransferRequest(request: ProjectTaskTransferRequest) {
    if (!projectId) return
    setError('')
    setTeamActionId(request.id)
    try {
      await cancelProjectTaskTransferRequest(projectId, request.id)
      setTaskTransferRequests((current) => current.filter((item) => item.id !== request.id))
      setNotice('Task transfer request cancelled.')
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to cancel task transfer request.'))
    } finally {
      setTeamActionId(null)
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

              {canCreateTasks && (!editingId || canManageProjectTasks) && (
                <form className="project-task-form" onSubmit={(event) => void handleSaveTask(event)}>
                  <div className="task-form-title">
                    <h2>{editingId ? 'Edit task' : 'Add a task'}</h2>
                    <p className="muted">
                      {canManageProjectTasks
                        ? 'Changes are shared with project members.'
                        : 'New tasks are automatically assigned to you. Only Owners and Admins can edit task details.'}
                    </p>
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
                  {canManageProjectTasks && (
                    <label className="assignee-field">
                      Assign to team members
                      <select
                        multiple
                        onChange={(event) => setField(
                          'assigneeIds',
                          Array.from(event.currentTarget.selectedOptions, (option) => option.value),
                        )}
                        value={form.assigneeIds ?? []}
                      >
                        <option value={project.owner.id}>{project.owner.name} (Owner)</option>
                        {project.members
                          .filter((member) => member.role !== 'viewer')
                          .map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name} ({member.role})
                            </option>
                          ))}
                      </select>
                      <span className="muted">Hold Ctrl (Windows) or Command (Mac) to select multiple members.</span>
                    </label>
                  )}
                  <div className="task-form-actions">
                    <button className="button" disabled={isSaving} type="submit">{isSaving ? 'Saving...' : editingId ? 'Save changes' : 'Add task'}</button>
                    {editingId && <button className="button button-secondary" onClick={cancelEditing} type="button">Cancel</button>}
                  </div>
                </form>
              )}

              <div className="project-task-filter">
                <p className="muted">Showing {showAssignedToMe ? 'tasks assigned to you' : 'all project tasks'}.</p>
                <button
                  aria-pressed={showAssignedToMe}
                  className="button button-secondary"
                  onClick={() => setShowAssignedToMe((current) => !current)}
                  type="button"
                >
                  {showAssignedToMe ? 'Show all tasks' : 'Assigned to me'}
                </button>
              </div>

              <section aria-label="Project task board" className="project-board">
                {statuses.map((status) => {
                  const columnTasks = visibleProjectTasks.filter((task) => task.status === status)
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
                                {canManageProjectTasks && (
                                  <div className="task-actions">
                                    <button aria-label={`Edit ${task.title}`} className="text-button" onClick={() => startEditing(task)} type="button">Edit</button>
                                    <button aria-label={`Delete ${task.title}`} className="text-button delete-button" onClick={() => void handleDeleteTask(task)} type="button">Delete</button>
                                  </div>
                                )}
                              </div>
                              <h3>{task.title}</h3>
                              {task.description && <p className="board-task-description">{task.description}</p>}
                              <div className="task-assignees" aria-label="Assigned team members">
                                {task.assignees.length
                                  ? task.assignees.map((assignee) => (
                                    <span className="task-assignee-pill" key={assignee.id}>
                                      {assignee.name || assignee.email || 'Team member'}
                                      {assignee.id === user.id ? ' (you)' : ''}
                                    </span>
                                  ))
                                  : <span className="muted">Unassigned</span>}
                              </div>
                              <div className="board-task-footer">
                                {task.deadline ? <time dateTime={task.deadline}>Due {displayDate(task.deadline)}</time> : <span>No deadline</span>}
                                {(canManageProjectTasks || (
                                  role === 'member' &&
                                  task.assignees.some((assignee) => assignee.id === user.id)
                                )) && (
                                  <select aria-label={`Move ${task.title} to`} onChange={(event) => void changeTaskStatus(task, event.target.value as ProjectTaskStatus)} value={task.status}>
                                    {statuses.map((option) => <option key={option}>{option}</option>)}
                                  </select>
                                )}
                              </div>
                              <button
                                aria-expanded={commentTaskId === task.id}
                                className="text-button task-comments-toggle"
                                onClick={() => setCommentTaskId((current) => current === task.id ? null : task.id)}
                                type="button"
                              >
                                {commentTaskId === task.id ? 'Hide comments' : 'Comments'}
                              </button>
                              {commentTaskId === task.id && (
                                <TaskComments
                                  canComment={role !== null && role !== 'viewer'}
                                  projectId={projectId}
                                  taskId={task.id}
                                />
                              )}
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

              {projectId && <ProjectActivityFeed projectId={projectId} />}

              <section aria-labelledby="members-heading" className="member-management">
                  <div className="member-management-heading">
                    <div><p className="eyebrow">COLLABORATION</p><h2 id="members-heading">Team members</h2></div>
                    <span className="task-count">{project.memberCount}</span>
                  </div>
                  {canManageMembers && (
                    <>
                      <form className="member-add-form" onSubmit={(event) => void handleAddMember(event)}>
                        <label>
                          Add a registered user by email
                          <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="teammate@example.com" required type="email" value={email} />
                        </label>
                        <label>
                          Role
                          <select onChange={(event) => setMemberRole(event.target.value as MemberRole)} value={memberRole}>
                            {role === 'owner' && <option value="admin">Admin</option>}
                            <option value="member">Member</option><option value="viewer">Viewer</option>
                          </select>
                        </label>
                        <button className="button" disabled={teamActionId === 'add-member'} type="submit">
                          {teamActionId === 'add-member' ? 'Adding...' : 'Add member'}
                        </button>
                      </form>
                      <form className="member-add-form invitation-form" onSubmit={(event) => void handleCreateInvitation(event)}>
                        <label>
                          Invite someone by email
                          <input autoComplete="email" onChange={(event) => setInviteEmail(event.target.value)} placeholder="new-teammate@example.com" required type="email" value={inviteEmail} />
                        </label>
                        <label>
                          Role
                          <select onChange={(event) => setInviteRole(event.target.value as MemberRole)} value={inviteRole}>
                            {role === 'owner' && <option value="admin">Admin</option>}
                            <option value="member">Member</option><option value="viewer">Viewer</option>
                          </select>
                        </label>
                        <button className="button" disabled={teamActionId === 'create-invitation'} type="submit">
                          {teamActionId === 'create-invitation' ? 'Sending...' : 'Send invite'}
                        </button>
                      </form>
                    </>
                  )}
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
                        {canManageMembers && (role === 'owner' || member.role !== 'admin') ? (
                          <>
                            <select
                              aria-label={`Role for ${member.name}`}
                              disabled={teamActionId === member.id}
                              onChange={(event) => void changeMemberRole(member.id, event.target.value as MemberRole)}
                              value={member.role}
                            >
                              {role === 'owner' && <option value="admin">Admin</option>}
                              <option value="member">Member</option><option value="viewer">Viewer</option>
                            </select>
                            <button
                              aria-label={`Remove ${member.name}`}
                              className="text-button delete-button"
                              disabled={teamActionId === member.id}
                              onClick={() => void handleRemoveMember(member.id)}
                              type="button"
                            >
                              Remove
                            </button>
                          </>
                        ) : <span className="role-pill">{member.role === 'admin' ? 'Admin' : member.role === 'viewer' ? 'Viewer' : 'Member'}</span>}
                      </li>
                    ))}
                  </ul>
                  {canManageMembers && (
                    <div className="pending-invitations">
                      <h3>Pending invitations</h3>
                      {invitations.length ? (
                        <ul className="member-list">
                          {invitations.map((invitation) => (
                            <li className="member-list-item" key={invitation.id}>
                              <span className="member-avatar invite-avatar" aria-hidden="true">@</span>
                              <span className="member-identity">
                                <strong>{invitation.email}</strong>
                                <small>{invitation.role} · Expires {displayDate(invitation.expiresAt)}</small>
                                <small className={invitation.deliveryStatus === 'failed' ? 'error' : 'muted'}>
                                  Email {invitation.deliveryStatus}
                                </small>
                              </span>
                              {(role === 'owner' || invitation.role !== 'admin') && (
                                <>
                                  <button
                                    className="text-button"
                                    disabled={teamActionId === invitation.id}
                                    onClick={() => void handleResendInvitation(invitation)}
                                    type="button"
                                  >
                                    Resend
                                  </button>
                                <button
                                  className="text-button delete-button"
                                  disabled={teamActionId === invitation.id}
                                  onClick={() => void handleRevokeInvitation(invitation)}
                                  type="button"
                                >
                                  Revoke
                                </button>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : <p className="muted">No pending invitations.</p>}
                    </div>
                  )}
                  {canManageMembers && (
                    <div className="pending-invitations">
                      <h3>Request a personal task</h3>
                      <p className="muted">The member chooses a task and explicitly approves before it leaves their private list.</p>
                      <form className="member-add-form invitation-form" onSubmit={(event) => void handleRequestTaskTransfer(event)}>
                        <label>
                          Project member
                          <select
                            onChange={(event) => setTransferTargetId(event.target.value)}
                            required
                            value={transferTargetId}
                          >
                            <option value="">Select a member</option>
                            {transferableMembers.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.name} ({member.role})
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="button"
                          disabled={teamActionId === 'task-transfer-request'}
                          type="submit"
                        >
                          {teamActionId === 'task-transfer-request' ? 'Sending...' : 'Request transfer'}
                        </button>
                      </form>
                      {taskTransferRequests.length > 0 ? (
                        <ul className="member-list">
                          {taskTransferRequests.map((request) => (
                            <li className="member-list-item" key={request.id}>
                              <span className="member-identity">
                                <strong>{request.member.name}</strong>
                                <small>{request.member.email} · Awaiting approval</small>
                              </span>
                              <button
                                className="text-button delete-button"
                                disabled={teamActionId === request.id}
                                onClick={() => void handleCancelTaskTransferRequest(request)}
                                type="button"
                              >
                                Cancel
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="muted">No pending task transfer requests.</p>}
                    </div>
                  )}
                </section>
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
      {taskToComplete && (
        <div className="confirmation-backdrop">
          <section
            aria-describedby="complete-task-description"
            aria-labelledby="complete-task-title"
            aria-modal="true"
            className="confirmation-dialog"
            role="alertdialog"
          >
            <h2 id="complete-task-title">Complete this task?</h2>
            <p id="complete-task-description">
              Mark <strong>{taskToComplete.title}</strong> as completed?
            </p>
            <div className="confirmation-actions">
              <button
                className="button button-secondary"
                disabled={isConfirmingCompletion}
                onClick={() => setTaskToComplete(null)}
                type="button"
              >
                No
              </button>
              <button
                className="button"
                disabled={isConfirmingCompletion}
                onClick={() => void confirmTaskCompletion()}
                type="button"
              >
                {isConfirmingCompletion ? 'Saving...' : 'Yes, complete'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
