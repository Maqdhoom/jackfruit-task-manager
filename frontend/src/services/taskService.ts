import API from '../api'

export type TaskPriority = 'Low' | 'Medium' | 'High'
export type TaskStatus = 'Pending' | 'In Progress' | 'Completed'

export type Task = {
  id: string
  title: string
  description: string
  priority: TaskPriority
  status: TaskStatus
  deadline: string
  createdAt: string
  updatedAt: string
}

export type TaskTransferRequest = {
  id: string
  project: { id: string; name: string }
  requestedBy: { id: string; name: string; email: string }
  expiresAt: string
  createdAt: string
}

export type TaskInput = Pick<Task, 'title' | 'description' | 'priority' | 'status' | 'deadline'>

export type DashboardSummary = {
  totalTasks: number
  pendingTasks: number
  completedTasks: number
  inProgressTasks: number
  overdueTasks: number
  progress: number
}

export type DashboardData = {
  success: boolean
  summary: DashboardSummary
  upcomingTasks: Task[]
}

export type CalendarTask = {
  id: string
  title: string
  priority: TaskPriority
  status: TaskStatus
  deadline: string
  source: 'personal' | 'project'
  project: { id: string; name: string } | null
}

export async function getTasks(): Promise<Task[]> {
  const response = await API.get<{ tasks: Task[] }>('/tasks')
  return response.data.tasks
}

export async function getCalendarTasks(): Promise<CalendarTask[]> {
  const response = await API.get<{ tasks: CalendarTask[] }>('/tasks/calendar')
  return response.data.tasks
}

export async function getDashboardSummary(): Promise<DashboardData> {
  const response = await API.get<DashboardData>('/tasks/dashboard/summary')
  return response.data
}

export async function getTaskTransferRequests(): Promise<TaskTransferRequest[]> {
  const response = await API.get<{ requests: TaskTransferRequest[] }>('/tasks/transfer-requests')
  return response.data.requests
}

export async function transferTaskToProject(taskId: string, projectId: string): Promise<void> {
  await API.post(`/tasks/${taskId}/transfer`, { projectId })
}

export async function acceptTaskTransferRequest(requestId: string, taskId: string): Promise<void> {
  await API.post(`/tasks/transfer-requests/${requestId}/accept`, { taskId })
}

export async function declineTaskTransferRequest(requestId: string): Promise<void> {
  await API.post(`/tasks/transfer-requests/${requestId}/decline`)
}

export async function createTask(input: TaskInput): Promise<Task> {
  const response = await API.post<{ task: Task }>('/tasks', input)
  return response.data.task
}

export async function updateTask(id: string, input: TaskInput): Promise<Task> {
  const response = await API.put<{ task: Task }>(`/tasks/${id}`, input)
  return response.data.task
}

export async function deleteTask(id: string): Promise<void> {
  await API.delete(`/tasks/${id}`)
}
