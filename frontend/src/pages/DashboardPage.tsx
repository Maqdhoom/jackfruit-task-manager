import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { getErrorMessage, useAuth } from '../auth/AuthContext'
import {
  createTask,
  deleteTask,
  getDashboardSummary,
  getTasks,
  type DashboardData,
  type Task,
  type TaskInput,
  type TaskPriority,
  type TaskStatus,
  updateTask,
} from '../services/taskService'

type SortOrder = 'newest' | 'oldest' | 'deadline'

const emptyForm: TaskInput = {
  title: '',
  description: '',
  priority: 'Medium',
  status: 'Pending',
  deadline: '',
}

function displayDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [form, setForm] = useState<TaskInput>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'All' | TaskPriority>('All')
  const [statusFilter, setStatusFilter] = useState<'All' | TaskStatus>('All')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const loadDashboard = useCallback(async () => {
    setError('')
    setIsLoading(true)

    try {
      const [nextTasks, nextDashboardData] = await Promise.all([
        getTasks(),
        getDashboardSummary(),
      ])
      setTasks(nextTasks)
      setDashboardData(nextDashboardData)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load dashboard. Try again.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter((task) => (
      task.title.toLowerCase().includes(search.trim().toLowerCase())
      && (priorityFilter === 'All' || task.priority === priorityFilter)
      && (statusFilter === 'All' || task.status === statusFilter)
    ))

    return filtered.sort((first, second) => {
      if (sortOrder === 'deadline') {
        return new Date(first.deadline).getTime() - new Date(second.deadline).getTime()
      }

      const difference = new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime()
      return sortOrder === 'newest' ? -difference : difference
    })
  }, [priorityFilter, search, sortOrder, statusFilter, tasks])

  if (!user) {
    return <Navigate to="/" replace />
  }

  function setField<K extends keyof TaskInput>(field: K, value: TaskInput[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function startEditing(task: Task) {
    setEditingId(task.id)
    setForm({
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      deadline: task.deadline.slice(0, 10),
    })
    setNotice('')
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEditing() {
    setEditingId(null)
    setForm(emptyForm)
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSaving(true)

    try {
      if (editingId) {
        await updateTask(editingId, form)
        setNotice('Task updated successfully.')
      } else {
        await createTask(form)
        setNotice('Task created successfully.')
      }

      cancelEditing()
      await loadDashboard()
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to save task. Try again.'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(task: Task) {
    setError('')
    setNotice('')

    try {
      await deleteTask(task.id)
      setTasks((current) => current.filter((item) => item.id !== task.id))
      setNotice('Task deleted successfully.')
      await loadDashboard()
      if (editingId === task.id) {
        cancelEditing()
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to delete task. Try again.'))
    }
  }

  async function handleLogout() {
    setError('')
    setIsLoggingOut(true)

    try {
      await logout()
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Logout failed. Please try again.'))
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <main className="dashboard-card task-dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">TASK MANAGER</p>
          <h1>Your tasks</h1>
          <p className="muted dashboard-greeting">Welcome, {user.name}</p>
        </div>
        <div className="dashboard-header-actions">
          <Link className="button button-secondary" to="/projects">Projects</Link>
          <button className="button button-secondary" disabled={isLoggingOut} onClick={() => void handleLogout()}>
            {isLoggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </header>

      <section aria-label="Task summary" className="task-stats">
        {([
          ['Total tasks', dashboardData?.summary.totalTasks ?? 0, 'All your tasks', 'total'],
          ['Pending', dashboardData?.summary.pendingTasks ?? 0, 'Waiting to start', 'pending'],
          ['Completed', dashboardData?.summary.completedTasks ?? 0, 'Successfully finished', 'completed'],
          ['Overdue', dashboardData?.summary.overdueTasks ?? 0, 'Past their deadlines', 'overdue'],
        ] as const).map(([label, count, description, kind]) => (
          <article className={`stat-card stat-${kind}`} key={kind}>
            <div className="stat-label">
              <p>{label}</p>
              <span>{kind === 'total' ? '📋' : kind === 'pending' ? '⏳' : kind === 'completed' ? '✅' : '⚠️'}</span>
            </div>
            <strong>{isLoading ? '—' : count}</strong>
            <small>{description}</small>
          </article>
        ))}
      </section>

      <section aria-label="Task completion progress and upcoming deadlines" className="dashboard-insights">
        <article className="progress-card">
          <div className="insight-heading">
            <div>
              <p className="eyebrow">YOUR PRODUCTIVITY OVERVIEW</p>
              <h2>Overall progress</h2>
            </div>
            <strong className="progress-value">
              {isLoading ? '—' : `${dashboardData?.summary.progress ?? 0}%`}
            </strong>
          </div>
          <div
            aria-label={`Task completion ${dashboardData?.summary.progress ?? 0}%`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={dashboardData?.summary.progress ?? 0}
            className="progress-track"
            role="progressbar"
          >
            <div
              className="progress-fill"
              style={{ width: `${dashboardData?.summary.progress ?? 0}%` }}
            />
          </div>
          <p>
            {isLoading
              ? 'Loading task completion...'
              : `${dashboardData?.summary.completedTasks ?? 0} of ${dashboardData?.summary.totalTasks ?? 0} tasks completed · ${dashboardData?.summary.inProgressTasks ?? 0} in progress`}
          </p>
        </article>

        <article className="upcoming-card">
          <div className="insight-heading">
            <div>
              <p className="eyebrow">PLAN AHEAD</p>
              <h2>Upcoming deadlines</h2>
            </div>
            <span className="upcoming-window">Next 7 days</span>
          </div>
          {isLoading ? (
            <p className="empty-state" role="status">Loading upcoming deadlines...</p>
          ) : dashboardData?.upcomingTasks.length ? (
            <ul className="upcoming-list">
              {dashboardData.upcomingTasks.map((task) => (
                <li className="upcoming-task" key={task.id}>
                  <div>
                    <h3>{task.title}</h3>
                    <span className={`task-priority priority-${task.priority.toLowerCase()}`}>
                      {task.priority} priority
                    </span>
                  </div>
                  <time dateTime={task.deadline}>{displayDate(task.deadline)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No upcoming deadlines in the next 7 days.</p>
          )}
        </article>
      </section>

      <section className="task-form-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{editingId ? 'UPDATE TASK' : 'GET STARTED'}</p>
            <h2>{editingId ? 'Edit task' : 'Add a task'}</h2>
          </div>
        </div>
        <form className="task-form" onSubmit={(event) => void handleSave(event)}>
          <label className="task-title-field">
            Task title
            <input
              maxLength={160}
              onChange={(event) => setField('title', event.target.value)}
              placeholder="What needs to get done?"
              required
              value={form.title}
            />
          </label>
          <label className="task-description-field">
            Description
            <textarea
              maxLength={2000}
              onChange={(event) => setField('description', event.target.value)}
              placeholder="Add a few details (optional)"
              rows={3}
              value={form.description}
            />
          </label>
          <label>
            Deadline
            <input
              onChange={(event) => setField('deadline', event.target.value)}
              required
              type="date"
              value={form.deadline}
            />
          </label>
          <label>
            Priority
            <select onChange={(event) => setField('priority', event.target.value as TaskPriority)} value={form.priority}>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>
          </label>
          <label>
            Status
            <select onChange={(event) => setField('status', event.target.value as TaskStatus)} value={form.status}>
              <option>Pending</option>
              <option>In Progress</option>
              <option>Completed</option>
            </select>
          </label>
          <div className="task-form-actions">
            <button className="button" disabled={isSaving} type="submit">
              {isSaving ? 'Saving...' : editingId ? 'Save changes' : 'Add task'}
            </button>
            {editingId && (
              <button className="button button-secondary" onClick={cancelEditing} type="button">
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      {error && <p className="error task-message" role="alert">{error}</p>}
      {notice && <p className="success task-message" role="status">{notice}</p>}

      <section className="task-list-section">
        <div className="task-list-heading">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h2>Task list <span className="task-count">{visibleTasks.length}</span></h2>
          </div>
          <button className="button button-secondary refresh-button" disabled={isLoading} onClick={() => void loadDashboard()}>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="task-filters">
          <label className="search-field">
            Search
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search task titles"
              type="search"
              value={search}
            />
          </label>
          <label>
            Priority
            <select onChange={(event) => setPriorityFilter(event.target.value as 'All' | TaskPriority)} value={priorityFilter}>
              <option>All</option>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>
          </label>
          <label>
            Status
            <select onChange={(event) => setStatusFilter(event.target.value as 'All' | TaskStatus)} value={statusFilter}>
              <option>All</option>
              <option>Pending</option>
              <option>In Progress</option>
              <option>Completed</option>
            </select>
          </label>
          <label>
            Sort
            <select onChange={(event) => setSortOrder(event.target.value as SortOrder)} value={sortOrder}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="deadline">Deadline (soonest)</option>
            </select>
          </label>
        </div>

        {isLoading ? (
          <p className="empty-state" role="status">Loading your tasks...</p>
        ) : visibleTasks.length ? (
          <ul className="task-list">
            {visibleTasks.map((task) => (
              <li className="task-item" key={task.id}>
                <div className="task-item-main">
                  <div className="task-item-title-row">
                    <h3>{task.title}</h3>
                    <span className={`task-status status-${task.status.toLowerCase().replace(' ', '-')}`}>{task.status}</span>
                  </div>
                  {task.description && <p className="task-description">{task.description}</p>}
                  <div className="task-meta">
                    <span className={`task-priority priority-${task.priority.toLowerCase()}`}>{task.priority} priority</span>
                    <span>Due {displayDate(task.deadline)}</span>
                  </div>
                </div>
                <div className="task-actions">
                  <button className="text-button" onClick={() => startEditing(task)} type="button">Edit</button>
                  <button className="text-button delete-button" onClick={() => void handleDelete(task)} type="button">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">
            {tasks.length ? 'No tasks match your search or filters.' : 'No tasks yet. Add one above to get started.'}
          </p>
        )}
      </section>
    </main>
  )
}
