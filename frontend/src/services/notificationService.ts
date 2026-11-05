import API from '../api'

export type NotificationType = 'task_reminder_24h' | 'task_due' | 'task_overdue'

export type AppNotification = {
  id: string
  type: NotificationType
  title: string
  message: string
  task: { id: string; type: 'project'; projectId: string }
  dueAt: string
  isRead: boolean
  createdAt: string
}

export type NotificationPage = {
  notifications: AppNotification[]
  unreadCount: number
  nextCursor: string | null
}

export async function listNotifications(cursor?: string): Promise<NotificationPage> {
  const response = await API.get<NotificationPage>('/notifications', {
    params: cursor ? { cursor } : undefined,
  })
  return response.data
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await API.patch(`/notifications/${notificationId}/read`)
}

export async function markAllNotificationsRead(): Promise<number> {
  const response = await API.patch<{ modifiedCount: number }>('/notifications/read-all')
  return response.data.modifiedCount
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await API.delete(`/notifications/${notificationId}`)
}
