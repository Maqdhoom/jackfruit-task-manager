import API from '../api'

export type ProjectRole = 'owner' | 'admin' | 'member' | 'viewer'
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

export type ProjectInvitation = {
  id: string
  email: string
  role: MemberRole
  status: 'pending'
  deliveryStatus: 'pending' | 'sent' | 'failed'
  expiresAt: string
  createdAt: string
}

export type InvitationDetails = {
  projectId: string
  projectName: string
  email: string
  role: MemberRole
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expiresAt: string
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

export async function listProjectInvitations(projectId: string): Promise<ProjectInvitation[]> {
  const response = await API.get<{ invitations: ProjectInvitation[] }>(`/projects/${projectId}/invitations`)
  return response.data.invitations
}

export async function createProjectInvitation(
  projectId: string,
  email: string,
  role: MemberRole,
): Promise<{ invitation: ProjectInvitation; emailSent: boolean; message: string }> {
  const response = await API.post<{ invitation: ProjectInvitation; emailSent: boolean; message: string }>(
    `/projects/${projectId}/invitations`,
    { email, role },
  )
  return response.data
}

export async function resendProjectInvitation(
  projectId: string,
  invitationId: string,
): Promise<{ invitation: ProjectInvitation; emailSent: boolean; message: string }> {
  const response = await API.post<{ invitation: ProjectInvitation; emailSent: boolean; message: string }>(
    `/projects/${projectId}/invitations/${invitationId}/resend`,
  )
  return response.data
}

export async function revokeProjectInvitation(projectId: string, invitationId: string): Promise<void> {
  await API.delete(`/projects/${projectId}/invitations/${invitationId}`)
}

export async function getInvitationDetails(token: string): Promise<InvitationDetails> {
  const response = await API.get<{ invitation: InvitationDetails }>(`/invitations/${encodeURIComponent(token)}`)
  return response.data.invitation
}

export async function acceptProjectInvitation(token: string): Promise<{ projectId: string; message: string }> {
  const response = await API.post<{ projectId: string; message: string }>(
    `/invitations/${encodeURIComponent(token)}/accept`,
  )
  return response.data
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
