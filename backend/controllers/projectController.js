const mongoose = require('mongoose');
const Project = require('../models/Project');
const ProjectTask = require('../models/ProjectTask');
const User = require('../models/User');

const taskFields = ['title', 'description', 'priority', 'status', 'deadline'];
const priorities = ['Low', 'Medium', 'High'];
const statuses = ['Pending', 'In Progress', 'Completed'];
const roles = ['editor', 'viewer'];

function isValidId(id) {
  return mongoose.isValidObjectId(id) && /^[a-f\d]{24}$/i.test(id);
}

function validateProjectInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'A project object is required' };
  }

  if (Object.keys(body).some((field) => !['name', 'description'].includes(field))) {
    return { error: 'Project contains unsupported fields' };
  }

  if (
    typeof body.name !== 'string' ||
    !body.name.trim() ||
    body.name.trim().length > 100 ||
    (body.description !== undefined &&
      (typeof body.description !== 'string' || body.description.length > 2000))
  ) {
    return { error: 'Project name must be 1-100 characters and description 2000 characters or fewer' };
  }

  return { values: { name: body.name.trim(), description: (body.description ?? '').trim() } };
}

function validateProjectTaskInput(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'A task object is required' };
  }

  if (Object.keys(body).some((field) => !taskFields.includes(field))) {
    return { error: 'Task contains unsupported fields' };
  }

  const providedFields = taskFields.filter((field) => Object.hasOwn(body, field));

  if ((partial && providedFields.length === 0) || (!partial && !Object.hasOwn(body, 'title'))) {
    return { error: partial ? 'Provide at least one task field to update' : 'Task title is required' };
  }

  const values = {};

  if (Object.hasOwn(body, 'title')) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 160) {
      return { error: 'Task title must be between 1 and 160 characters' };
    }

    values.title = body.title.trim();
  }

  if (Object.hasOwn(body, 'description')) {
    if (typeof body.description !== 'string' || body.description.length > 2000) {
      return { error: 'Description must be 2000 characters or fewer' };
    }

    values.description = body.description.trim();
  }

  if (Object.hasOwn(body, 'priority')) {
    if (!priorities.includes(body.priority)) {
      return { error: 'Priority must be Low, Medium, or High' };
    }

    values.priority = body.priority;
  }

  if (Object.hasOwn(body, 'status')) {
    if (!statuses.includes(body.status)) {
      return { error: 'Status must be Pending, In Progress, or Completed' };
    }

    values.status = body.status;
  }

  if (Object.hasOwn(body, 'deadline')) {
    if (body.deadline === null || body.deadline === '') {
      values.deadline = null;
    } else if (typeof body.deadline !== 'string' || Number.isNaN(new Date(body.deadline).getTime())) {
      return { error: 'Deadline must be a valid date' };
    } else if (
      /^\d{4}-\d{2}-\d{2}$/.test(body.deadline) &&
      new Date(body.deadline).toISOString().slice(0, 10) !== body.deadline
    ) {
      return { error: 'Deadline must be a valid date' };
    } else {
      values.deadline = new Date(body.deadline);
    }
  }

  return { values };
}

function getProjectRole(project, userId) {
  const ownerId = project.ownerId?._id?.toString() ?? project.ownerId.toString();

  if (ownerId === userId.toString()) {
    return 'owner';
  }

  return project.members.find(
    (member) => (member.userId?._id?.toString() ?? member.userId.toString()) === userId.toString()
  )?.role ?? null;
}

function serializeTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    deadline: task.deadline?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    createdBy: task.createdBy?._id?.toString() ?? task.createdBy?.toString(),
  };
}

function serializeProject(project, taskStats = { total: 0, completed: 0 }) {
  const owner = project.ownerId && typeof project.ownerId === 'object' && project.ownerId.name
    ? { id: project.ownerId.id, name: project.ownerId.name, email: project.ownerId.email }
    : { id: project.ownerId.toString(), name: '', email: '' };

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    owner,
    members: project.members.map((member) => ({
      id: member.userId.id,
      name: member.userId.name,
      email: member.userId.email,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
    })),
    memberCount: project.members.length + 1,
    taskCount: taskStats.total,
    completedTaskCount: taskStats.completed,
    progress: taskStats.total === 0 ? 0 : Math.round((taskStats.completed / taskStats.total) * 100),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

async function loadProject(projectId, userId) {
  const project = await Project.findOne({
    _id: projectId,
    $or: [{ ownerId: userId }, { 'members.userId': userId }],
  })
    .populate('ownerId', 'name email')
    .populate('members.userId', 'name email');

  return project;
}

async function getProjectTaskStats(projectIds) {
  const stats = await ProjectTask.aggregate([
    { $match: { projectId: { $in: projectIds } } },
    {
      $group: {
        _id: '$projectId',
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
      },
    },
  ]);

  return new Map(stats.map((item) => [item._id.toString(), item]));
}

async function serializeProjectWithTaskStats(project) {
  const stats = await getProjectTaskStats([project._id]);
  return serializeProject(project, stats.get(project.id) ?? { total: 0, completed: 0 });
}

async function listProjects(req, res) {
  const projects = await Project.find({
    $or: [{ ownerId: req.userId }, { 'members.userId': req.userId }],
  })
    .sort({ updatedAt: -1, _id: -1 })
    .populate('ownerId', 'name email')
    .populate('members.userId', 'name email');

  const stats = await getProjectTaskStats(projects.map((project) => project._id));
  return res.json({
    projects: projects.map((project) =>
      serializeProject(project, stats.get(project.id) ?? { total: 0, completed: 0 })
    ),
  });
}

async function createProject(req, res) {
  const validation = validateProjectInput(req.body);

  if (validation.error) {
    return res.status(400).json({ message: validation.error });
  }

  const project = await Project.create({ ...validation.values, ownerId: req.userId });
  await project.populate('ownerId', 'name email');
  await project.populate('members.userId', 'name email');
  return res.status(201).json({ project: serializeProject(project) });
}

async function getProject(req, res) {
  if (!isValidId(req.params.projectId)) {
    return res.status(400).json({ message: 'Invalid project ID' });
  }

  const project = await loadProject(req.params.projectId, req.userId);

  if (!project) {
    return res.status(404).json({ message: 'Project not found' });
  }

  const stats = await getProjectTaskStats([project._id]);
  return res.json({
    project: serializeProject(project, stats.get(project.id) ?? { total: 0, completed: 0 }),
    role: getProjectRole(project, req.userId),
  });
}

async function addProjectMember(req, res) {
  if (!isValidId(req.params.projectId)) {
    return res.status(400).json({ message: 'Invalid project ID' });
  }

  const project = await loadProject(req.params.projectId, req.userId);

  if (!project) {
    return res.status(404).json({ message: 'Project not found' });
  }

  if (getProjectRole(project, req.userId) !== 'owner') {
    return res.status(403).json({ message: 'Only the project owner can manage members' });
  }

  const { email, role } = req.body ?? {};

  if (
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body) ||
    Object.keys(req.body).some((field) => !['email', 'role'].includes(field)) ||
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    !roles.includes(role)
  ) {
    return res.status(400).json({ message: 'A valid account email and role (editor or viewer) are required' });
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() });

  if (!user) {
    return res.status(404).json({ message: 'No account exists for this email' });
  }

  if (user.id === project.ownerId.id) {
    return res.status(409).json({ message: 'The project owner is already a member' });
  }

  if (project.members.some((member) => member.userId.id === user.id)) {
    return res.status(409).json({ message: 'This user is already a project member' });
  }

  const updatedProject = await Project.findOneAndUpdate(
    {
      _id: project._id,
      ownerId: req.userId,
      'members.userId': { $ne: user._id },
    },
    { $push: { members: { userId: user._id, role } } },
    { new: true, runValidators: true }
  )
    .populate('ownerId', 'name email')
    .populate('members.userId', 'name email');

  if (!updatedProject) {
    return res.status(409).json({ message: 'This user is already a project member' });
  }

  return res.status(201).json({ project: await serializeProjectWithTaskStats(updatedProject) });
}

async function updateProjectMember(req, res) {
  if (!isValidId(req.params.projectId) || !isValidId(req.params.userId)) {
    return res.status(400).json({ message: 'Invalid project or member ID' });
  }

  const project = await loadProject(req.params.projectId, req.userId);

  if (!project) {
    return res.status(404).json({ message: 'Project not found' });
  }

  if (getProjectRole(project, req.userId) !== 'owner') {
    return res.status(403).json({ message: 'Only the project owner can manage members' });
  }

  if (
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body) ||
    Object.keys(req.body).length !== 1 ||
    Object.keys(req.body)[0] !== 'role' ||
    !roles.includes(req.body.role)
  ) {
    return res.status(400).json({ message: 'Role must be editor or viewer' });
  }

  const member = project.members.find((item) => item.userId.id === req.params.userId);

  if (!member) {
    return res.status(404).json({ message: 'Project member not found' });
  }

  member.role = req.body.role;
  await project.save();
  return res.json({ project: await serializeProjectWithTaskStats(project) });
}

async function removeProjectMember(req, res) {
  if (!isValidId(req.params.projectId) || !isValidId(req.params.userId)) {
    return res.status(400).json({ message: 'Invalid project or member ID' });
  }

  const project = await loadProject(req.params.projectId, req.userId);

  if (!project) {
    return res.status(404).json({ message: 'Project not found' });
  }

  if (getProjectRole(project, req.userId) !== 'owner') {
    return res.status(403).json({ message: 'Only the project owner can manage members' });
  }

  const member = project.members.find((item) => item.userId.id === req.params.userId);

  if (!member) {
    return res.status(404).json({ message: 'Project member not found' });
  }

  project.members = project.members.filter((item) => item.userId.id !== req.params.userId);
  await project.save();
  return res.json({ project: await serializeProjectWithTaskStats(project) });
}

async function getProjectTasks(req, res) {
  const tasks = await ProjectTask.find({ projectId: req.project._id }).sort({ createdAt: -1 });
  return res.json({ tasks: tasks.map(serializeTask) });
}

async function createProjectTask(req, res) {
  const validation = validateProjectTaskInput(req.body);

  if (validation.error) {
    return res.status(400).json({ message: validation.error });
  }

  const task = await ProjectTask.create({
    ...validation.values,
    projectId: req.project._id,
    createdBy: req.userId,
  });
  return res.status(201).json({ task: serializeTask(task) });
}

async function updateProjectTask(req, res) {
  if (!isValidId(req.params.taskId)) {
    return res.status(400).json({ message: 'Invalid task ID' });
  }

  const validation = validateProjectTaskInput(req.body, true);

  if (validation.error) {
    return res.status(400).json({ message: validation.error });
  }

  const task = await ProjectTask.findOneAndUpdate(
    { _id: req.params.taskId, projectId: req.project._id },
    validation.values,
    { new: true, runValidators: true }
  );

  if (!task) {
    return res.status(404).json({ message: 'Project task not found' });
  }

  return res.json({ task: serializeTask(task) });
}

async function deleteProjectTask(req, res) {
  if (!isValidId(req.params.taskId)) {
    return res.status(400).json({ message: 'Invalid task ID' });
  }

  const task = await ProjectTask.findOneAndDelete({
    _id: req.params.taskId,
    projectId: req.project._id,
  });

  if (!task) {
    return res.status(404).json({ message: 'Project task not found' });
  }

  return res.json({ message: 'Project task deleted successfully' });
}

module.exports = {
  addProjectMember,
  createProject,
  createProjectTask,
  deleteProjectTask,
  getProject,
  getProjectRole,
  getProjectTasks,
  isValidId,
  listProjects,
  removeProjectMember,
  serializeProject,
  serializeTask,
  updateProjectMember,
  updateProjectTask,
  validateProjectInput,
  validateProjectTaskInput,
};
