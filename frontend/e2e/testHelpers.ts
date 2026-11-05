import type { Page, Route } from '@playwright/test'

export const testUser = {
  id: '507f1f77bcf86cd799439011',
  name: 'Week Seven User',
  email: 'week7@example.test',
}

export const calendarTask = {
  id: '507f1f77bcf86cd799439012',
  title: 'Release checklist',
  priority: 'High',
  status: 'In Progress',
  deadline: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-15T12:00:00.000Z`,
  source: 'personal',
  project: null,
}

export async function mockAuthenticatedApi(page: Page) {
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/auth/me')) {
      await route.fulfill({ json: { user: testUser } })
      return
    }
    if (url.pathname.endsWith('/tasks/calendar')) {
      await route.fulfill({ json: { tasks: [calendarTask] } })
      return
    }
    if (url.pathname.endsWith('/notifications')) {
      await route.fulfill({ json: { notifications: [], unreadCount: 0, nextCursor: null } })
      return
    }
    if (url.pathname.endsWith('/tasks')) {
      await route.fulfill({ json: { tasks: [] } })
      return
    }
    if (url.pathname.endsWith('/dashboard/summary')) {
      await route.fulfill({
        json: {
          success: true,
          summary: {
            totalTasks: 0,
            pendingTasks: 0,
            completedTasks: 0,
            inProgressTasks: 0,
            overdueTasks: 0,
            progress: 0,
          },
          upcomingTasks: [],
        },
      })
      return
    }
    if (url.pathname.endsWith('/projects')) {
      await route.fulfill({ json: { projects: [] } })
      return
    }
    if (url.pathname.endsWith('/transfer-requests')) {
      await route.fulfill({ json: { requests: [] } })
      return
    }
    await route.fulfill({ json: {} })
  })
}
