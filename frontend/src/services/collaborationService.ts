import API from '../api'

export type TaskComment = {
  id: string
  body: string
  author: { id: string; name: string }
  createdAt: string
}

export type TaskCommentPage = {
  comments: TaskComment[]
  nextCursor: string | null
  privateNotes?: TaskComment[]
  privateNotesNextCursor?: string | null
}

export type ProjectTaskActivity = {
  id: string
  type: 'task_created' | 'task_updated' | 'task_deleted' | 'task_transferred' | 'comment_added'
  task: { id: string; title: string }
  actor: { id: string; name: string }
  changes: Array<{ field: string; from: unknown; to: unknown }>
  hasPrivateNotes?: boolean
  createdAt: string
}

export type ProjectActivityPage = {
  activities: ProjectTaskActivity[]
  nextCursor: string | null
}

function cursorParams(cursor?: string, privateCursor?: string) {
  return {
    ...(cursor ? { cursor } : {}),
    ...(privateCursor ? { privateCursor } : {}),
  }
}

export async function listPersonalTaskComments(taskId: string, cursor?: string): Promise<TaskCommentPage> {
  const response = await API.get<TaskCommentPage>(`/tasks/${taskId}/comments`, {
    params: cursorParams(cursor),
  })
  return response.data
}

export async function listTransferredPrivateTaskNotes(
  taskId: string,
  cursor?: string,
): Promise<TaskCommentPage> {
  const response = await API.get<TaskCommentPage>(`/tasks/${taskId}/private-notes`, {
    params: cursorParams(cursor),
  })
  return response.data
}

export async function addPersonalTaskComment(taskId: string, body: string): Promise<TaskComment> {
  const response = await API.post<{ comment: TaskComment }>(`/tasks/${taskId}/comments`, { body })
  return response.data.comment
}

export async function listProjectTaskComments(
  projectId: string,
  taskId: string,
  cursor?: string,
  privateCursor?: string,
): Promise<TaskCommentPage> {
  const response = await API.get<TaskCommentPage>(
    `/projects/${projectId}/tasks/${taskId}/comments`,
    { params: cursorParams(cursor, privateCursor) },
  )
  return response.data
}

export async function addProjectTaskComment(
  projectId: string,
  taskId: string,
  body: string,
): Promise<TaskComment> {
  const response = await API.post<{ comment: TaskComment }>(
    `/projects/${projectId}/tasks/${taskId}/comments`,
    { body },
  )
  return response.data.comment
}

export async function listProjectActivity(
  projectId: string,
  cursor?: string,
): Promise<ProjectActivityPage> {
  const response = await API.get<ProjectActivityPage>(`/projects/${projectId}/activity`, {
    params: cursorParams(cursor),
  })
  return response.data
}

export function notifyProjectActivityChanged(projectId: string): void {
  window.dispatchEvent(new CustomEvent('project-activity-updated', { detail: { projectId } }))
}
