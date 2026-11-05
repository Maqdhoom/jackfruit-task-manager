import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { getErrorMessage, useAuth } from '../auth/AuthContext'
import NotificationBell from '../components/NotificationBell'
import { getCalendarTasks, type CalendarTask } from '../services/taskService'

const REFRESH_INTERVAL_MS = 30_000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function taskDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export default function CalendarPage() {
  const { user, logout } = useAuth()
  const [tasks, setTasks] = useState<CalendarTask[]>([])
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [error, setError] = useState('')

  const refreshTasks = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true)
    try {
      setTasks(await getCalendarTasks())
      setError('')
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to refresh calendar tasks.'))
    } finally {
      if (showLoading) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshTasks(true)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshTasks()
    }
    const timer = window.setInterval(refreshWhenVisible, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refreshTasks])

  const tasksByDate = useMemo(() => {
    const grouped = new Map<string, CalendarTask[]>()
    for (const task of tasks) {
      const key = task.deadline.slice(0, 10)
      const dayTasks = grouped.get(key) ?? []
      dayTasks.push(task)
      grouped.set(key, dayTasks)
    }
    for (const dayTasks of grouped.values()) {
      dayTasks.sort((first, second) => first.title.localeCompare(second.title))
    }
    return grouped
  }, [tasks])

  const calendarDays = useMemo(() => {
    const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1)
    const lastDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0)
    const start = new Date(firstDay)
    start.setDate(firstDay.getDate() - firstDay.getDay())
    const end = new Date(lastDay)
    end.setDate(lastDay.getDate() + (6 - lastDay.getDay()))
    const days: Date[] = []
    for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
      days.push(new Date(day))
    }
    return days
  }, [visibleMonth])

  if (!user) return <Navigate to="/" replace />

  return (
    <main className="projects-shell calendar-shell">
      <aside className="projects-sidebar">
        <Link aria-label="Task Manager home" className="brand-mark" to="/dashboard">
          <span aria-hidden="true" className="brand-icon">✦</span><span>Task Z</span>
        </Link>
        <div className="workspace-switcher">
          <span className="workspace-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
          <span>{user.name}&apos;s workspace</span><span aria-hidden="true">⌄</span>
        </div>
        <p className="sidebar-label">MAIN MENU</p>
        <nav aria-label="Main navigation" className="sidebar-nav">
          <Link to="/dashboard"><span aria-hidden="true">▦</span> My tasks</Link>
          <Link aria-current="page" className="active" to="/calendar"><span aria-hidden="true">▣</span> Calendar</Link>
          <Link to="/projects"><span aria-hidden="true">◈</span> Projects</Link>
        </nav>
        <div className="sidebar-bottom">
          <Link className="button add-project-sidebar" to="/projects">Browse projects</Link>
          <button
            className="sidebar-logout"
            disabled={isLoggingOut}
            onClick={async () => {
              setIsLoggingOut(true)
              try {
                await logout()
              } catch (requestError) {
                setError(getErrorMessage(requestError, 'Logout failed. Please try again.'))
              } finally {
                setIsLoggingOut(false)
              }
            }}
            type="button"
          >
            {isLoggingOut ? 'Logging out...' : '↪ Log out'}
          </button>
        </div>
      </aside>

      <section className="projects-main">
        <header className="projects-topbar">
          <div className="projects-breadcrumb"><Link to="/dashboard">Workspace</Link><span aria-hidden="true">/</span><strong>Calendar</strong></div>
          <div className="projects-user"><NotificationBell /><span>{user.name}</span><span className="user-avatar" title={user.name}>{user.name.slice(0, 1).toUpperCase()}</span></div>
        </header>
        <div className="projects-content calendar-content">
          <div className="calendar-heading-row">
            <div>
              <p className="eyebrow">PLAN YOUR WORK</p>
              <h1>Calendar</h1>
              <p className="muted">Organize personal and project tasks by due date.</p>
            </div>
            <div className="calendar-toolbar">
              <div className="calendar-month-navigation">
                <button
                  aria-label="Previous month"
                  className="button button-secondary calendar-nav-button"
                  onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                  type="button"
                >
                  ‹
                </button>
                <h2 aria-live="polite">{monthLabel(visibleMonth)}</h2>
                <button
                  aria-label="Next month"
                  className="button button-secondary calendar-nav-button"
                  onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                  type="button"
                >
                  ›
                </button>
              </div>
              <button
                className="button button-secondary calendar-today-button"
                onClick={() => {
                  const now = new Date()
                  setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1))
                }}
                type="button"
              >
                Today
              </button>
              <Link className="button calendar-add-task" to="/dashboard">＋ Add task</Link>
            </div>
          </div>

          {error && <p className="error project-message" role="alert">{error}</p>}
          <section aria-label="Task calendar" className="calendar-panel">
            {isLoading ? (
              <p className="empty-state" role="status">Loading calendar...</p>
            ) : (
              <div className="calendar-grid" role="grid" aria-label={monthLabel(visibleMonth)}>
                {WEEKDAYS.map((day) => (
                  <div className="calendar-weekday" key={day} role="columnheader">{day}</div>
                ))}
                {calendarDays.map((day) => {
                  const key = dateKey(day)
                  const dayTasks = tasksByDate.get(key) ?? []
                  const isCurrentMonth = day.getMonth() === visibleMonth.getMonth()
                  const isToday = key === dateKey(new Date())
                  return (
                    <section
                      aria-label={`${day.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}, ${dayTasks.length} tasks`}
                      className={`calendar-day${isCurrentMonth ? '' : ' is-outside-month'}${isToday ? ' is-today' : ''}`}
                      key={key}
                      role="gridcell"
                    >
                      <span className="calendar-day-number">{day.getDate()}</span>
                      <ul className="calendar-day-tasks">
                        {dayTasks.map((task) => (
                          <li key={`${task.source}-${task.project?.id ?? 'personal'}-${task.id}`}>
                            <Link
                              className={`calendar-task priority-${task.priority.toLowerCase()}${task.status === 'Completed' ? ' is-completed' : ''}`}
                              to={task.project ? `/projects/${task.project.id}` : '/dashboard'}
                              title={`${task.title} · Due ${taskDate(task.deadline)} · ${task.status} · ${task.priority} priority`}
                            >
                              <span className="calendar-task-title">{task.title}</span>
                              {task.project && <span className="calendar-task-project">{task.project.name}</span>}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )
                })}
              </div>
            )}
            {!isLoading && tasks.length === 0 && (
              <p className="empty-state calendar-empty">No tasks with due dates yet. Add a task or project deadline to see it here.</p>
            )}
            <p className="calendar-updated-hint">Updates automatically every 30 seconds while this page is open.</p>
          </section>
        </div>
      </section>
    </main>
  )
}
