import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getErrorMessage } from '../auth/AuthContext'
import {
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../services/notificationService'

const REFRESH_INTERVAL_MS = 60_000

function notificationDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function notificationKind(type: AppNotification['type']): string {
  if (type === 'task_reminder_24h') return '24-hour reminder'
  if (type === 'task_due') return 'Due now'
  return 'Overdue'
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    setError('')
    try {
      const page = await listNotifications()
      setNotifications(page.notifications)
      setUnreadCount(page.unreadCount)
      setNextCursor(page.nextCursor)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load notifications.'))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, REFRESH_INTERVAL_MS)
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('mousedown', closeOnOutsideClick)
    }
  }, [refresh])

  async function handleRead(notification: AppNotification) {
    if (!notification.isRead) {
      try {
        await markNotificationRead(notification.id)
        setNotifications((current) => current.map((item) =>
          item.id === notification.id ? { ...item, isRead: true } : item
        ))
        setUnreadCount((current) => Math.max(0, current - 1))
      } catch (requestError) {
        setError(getErrorMessage(requestError, 'Unable to mark notification as read.'))
        return
      }
    }
    setIsOpen(false)
    navigate(`/projects/${notification.task.projectId}`)
  }

  async function handleMarkAllRead() {
    setError('')
    try {
      await markAllNotificationsRead()
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })))
      setUnreadCount(0)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to mark notifications as read.'))
    }
  }

  async function handleDelete(notification: AppNotification) {
    setError('')
    try {
      await deleteNotification(notification.id)
      setNotifications((current) => current.filter((item) => item.id !== notification.id))
      if (!notification.isRead) setUnreadCount((current) => Math.max(0, current - 1))
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to delete notification.'))
    }
  }

  async function loadMore() {
    if (!nextCursor) return
    setIsLoadingMore(true)
    setError('')
    try {
      const page = await listNotifications(nextCursor)
      setNotifications((current) => [...current, ...page.notifications])
      setUnreadCount(page.unreadCount)
      setNextCursor(page.nextCursor)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load older notifications.'))
    } finally {
      setIsLoadingMore(false)
    }
  }

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        className="notification-bell-button"
        onClick={() => {
          setIsOpen((current) => !current)
          if (!isOpen) {
            setIsLoading(true)
            void refresh().finally(() => setIsLoading(false))
          }
        }}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {isOpen && (
        <section aria-label="Notifications" className="notification-popover">
          <div className="notification-popover-header">
            <div>
              <h2>Notifications</h2>
              <span>{unreadCount} unread</span>
            </div>
            <button
              className="text-button"
              disabled={unreadCount === 0}
              onClick={() => void handleMarkAllRead()}
              type="button"
            >
              Mark all read
            </button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {isLoading ? <p className="notification-empty" role="status">Loading notifications...</p> : notifications.length ? (
            <ul className="notification-list">
              {notifications.map((notification) => (
                <li className={`notification-item${notification.isRead ? '' : ' is-unread'}`} key={notification.id}>
                  <button className="notification-content" onClick={() => void handleRead(notification)} type="button">
                    <span className={`notification-type-dot notification-type-${notification.type}`} aria-hidden="true" />
                    <span className="notification-text">
                      <strong>{notification.title}</strong>
                      <span className="notification-kind">{notificationKind(notification.type)}</span>
                      <span>{notification.message}</span>
                      <time dateTime={notification.createdAt}>{notificationDate(notification.createdAt)}</time>
                    </span>
                  </button>
                  <button
                    aria-label={`Delete notification: ${notification.title}`}
                    className="notification-delete"
                    onClick={() => void handleDelete(notification)}
                    type="button"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="notification-empty">You&apos;re all caught up.</p>}
          {nextCursor && (
            <button className="notification-load-more" disabled={isLoadingMore} onClick={() => void loadMore()} type="button">
              {isLoadingMore ? 'Loading...' : 'Load older notifications'}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
