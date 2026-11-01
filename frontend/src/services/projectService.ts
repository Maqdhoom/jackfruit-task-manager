import API from '../api'

export type ProjectRole = 'owner' | 'editor' | 'viewer'
export type MemberRole = Exclude<ProjectRole, 'owner'>
export type ProjectTaskStatus = 'Pending' | 'In Progress' | 'Completed'
export type TaskPriority = 'Low' | 'Medium' | 'High'

export type ProjectMember = {
  id: string
  name: string
  email: string
  role: MemberRole
  joinedAt: string
}

export type Project = {
  id: string
  name: string
  description: string
  owner: { id: string; name: string; email: string }
  members: ProjectMember[]
  memberCount: number
  taskCount: number
  completedTaskCount: number
  progress: number
  createdAt: string
  updatedAt: string
}

export type ProjectTask = {
  id: string
  title: string
  description: string
  priority: TaskPriority
  status: ProjectTaskStatus
  deadline: string | null
  createdAt: string
  updatedAt: string
  createdBy: string
}

export type ProjectInput = Pick<Project, 'name' | 'description'>
export type ProjectTaskInput = Pick<ProjectTask, 'title' | 'description' | 'priority' | 'status' | 'deadline'>

export async function listProjects(): Promise<Project[]> {
  const response = await API.get<{ projects: Project[] }>('/projects')
  return response.data.projects
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const response = await API.post<{ project: Project }>('/projects', input)
  return response.data.project
}

export async function getProject(id: string): Promise<{ project: Project; role: ProjectRole }> {
  const response = await API.get<{ project: Project; role: ProjectRole }>(`/projects/${id}`)
  return response.data
}

export async function addProjectMember(
  projectId: string,
  email: string,
  role: MemberRole,
): Promise<Project> {
  const response = await API.post<{ project: Project }>(`/projects/${projectId}/members`, { email, role })
  return response.data.project
}

export async function updateProjectMember(
  projectId: string,
  userId: string,
  role: MemberRole,
): Promise<Project> {
  const response = await API.patch<{ project: Project }>(`/projects/${projectId}/members/${userId}`, { role })
  return response.data.project
}

export async function removeProjectMember(projectId: string, userId: string): Promise<Project> {
  const response = await API.delete<{ project: Project }>(`/projects/${projectId}/members/${userId}`)
  return response.data.project
}

export async function getProjectTasks(projectId: string): Promise<ProjectTask[]> {
  const response = await API.get<{ tasks: ProjectTask[] }>(`/projects/${projectId}/tasks`)
  return response.data.tasks
}

export async function createProjectTask(projectId: string, input: ProjectTaskInput): Promise<ProjectTask> {
  const response = await API.post<{ task: ProjectTask }>(`/projects/${projectId}/tasks`, input)
  return response.data.task
}

export async function updateProjectTask(
  projectId: string,
  taskId: string,
  input: Partial<ProjectTaskInput>,
): Promise<ProjectTask> {
  const response = await API.patch<{ task: ProjectTask }>(`/projects/${projectId}/tasks/${taskId}`, input)
  return response.data.task
}

export async function deleteProjectTask(projectId: string, taskId: string): Promise<void> {
  await API.delete(`/projects/${projectId}/tasks/${taskId}`)
}
