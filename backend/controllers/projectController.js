const mongoose = require('mongoose');
const Project = require('../models/Project');
const ProjectInvitation = require('../models/ProjectInvitation');
const ProjectTask = require('../models/ProjectTask');
const Notification = require('../models/Notification');
const TaskComment = require('../models/TaskComment');
const TaskTransferRequest = require('../models/TaskTransferRequest');
const User = require('../models/User');
const { buildTaskChanges, recordProjectTaskActivity } = require('../services/projectTaskActivityService');

const taskFields = ['title', 'description', 'priority', 'status', 'deadline', 'assigneeIds'];
const priorities = ['Low', 'Medium', 'High'];
const statuses = ['Pending', 'In Progress', 'Completed'];
const roles = ['admin', 'member', 'viewer'];

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

  if (Object.hasOwn(body, 'assigneeIds')) {
    if (
      !Array.isArray(body.assigneeIds) ||
      body.assigneeIds.length > 50 ||
      body.assigneeIds.some((id) => !isValidId(id)) ||
      new Set(body.assigneeIds.map((id) => id.toLowerCase())).size !== body.assigneeIds.length
    ) {
      return { error: 'Assignees must be a list of up to 50 unique valid user IDs' };
    }

    values.assigneeIds = body.assigneeIds;
  }

  return { values };
}

function getProjectRole(project, userId) {
  const ownerId = project.ownerId?._id?.toString() ?? project.ownerId.toString();

  if (ownerId === userId.toString()) {
    return 'owner';
  }

  const memberRole = project.members.find(
    (member) => (member.userId?._id?.toString() ?? member.userId.toString()) === userId.toString()
  )?.role ?? null;

  return memberRole === 'editor' ? 'member' : memberRole;
}

function canManageMembers(project, userId) {
  return ['owner', 'admin'].includes(getProjectRole(project, userId));
}

function canAssignMemberRole(actorRole, requestedRole) {
  return ['owner', 'admin'].includes(actorRole) &&
    (actorRole === 'owner' || requestedRole !== 'admin');
}

function canManageMemberRole(actorRole, currentRole, requestedRole) {
  return ['owner', 'admin'].includes(actorRole) &&
    (actorRole === 'owner' || (currentRole !== 'admin' && requestedRole !== 'admin'));
}

function canEditProjectTasks(project, userId) {
  return ['owner', 'admin', 'member'].includes(getProjectRole(project, userId));
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
    assignees: (task.assigneeIds ?? []).filter(Boolean).map((assignee) => ({
      id: assignee?._id?.toString() ?? assignee?.toString(),
      name: assignee?.name ?? '',
      email: assignee?.email ?? '',
    })),
  };
}

function getEligibleAssigneeIds(project) {
  const projectOwnerId = (project.ownerId?._id?.toString() ?? project.ownerId.toString()).toLowerCase();
  return new Set([
    projectOwnerId,
    ...project.members
      .filter((member) => ['admin', 'member', 'editor'].includes(member.role))
      .map((member) =>
        (member.userId?._id?.toString() ?? member.userId.toString()).toLowerCase()
      ),
  ]);
}

function validateAssigneeMembership(project, assigneeIds) {
  const eligibleAssignees = getEligibleAssigneeIds(project);
  return assigneeIds.every((assigneeId) =>
    eligibleAssignees.has(assigneeId.toString().toLowerCase())
  );
}

async function clearMemberAssignments(projectId, memberUserId, actorId, session) {
  const tasks = await ProjectTask.find({
    projectId,
    assigneeIds: memberUserId,
  }).session(session);

  for (const task of tasks) {
    const assigneeIds = task.assigneeIds.filter(
      (assigneeId) => assigneeId.toString() !== memberUserId.toString()
    );
    const changes = buildTaskChanges(task, { assigneeIds });
    task.assigneeIds = assigneeIds;
    await task.save({ session });
    await recordProjectTaskActivity({
      projectId,
      taskId: task._id,
      taskTitle: task.title,
      actorId,
      type: 'task_updated',
      changes,
      session,
    });
  }

  await Notification.updateMany({
    userId: memberUserId,
    taskType: 'project',
    taskId: { $in: tasks.map((task) => task._id) },
  }, {
    $set: { deletedAt: new Date() },
  }, { session });
}

function canMemberUpdateProjectTask(task, userId, values) {
  const assigneeIds = task.assigneeIds ?? [];
  return (
    Object.keys(values).length === 1 &&
    Object.hasOwn(values, 'status') &&
    assigneeIds.some((assigneeId) =>
      (assigneeId?._id?.toString() ?? assigneeId?.toString()) === userId.toString()
    )
  );
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
      role: member.role === 'editor' ? 'member' : member.role,
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

  const callerRole = getProjectRole(project, req.userId);

  if (!['owner', 'admin'].includes(callerRole)) {
    return res.status(403).json({ message: 'Only project owners and admins can manage members' });
  }

  const { email, role } = req.body ?? {};

  if (
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body) ||
    Object.keys(req.body).some((field) => !['email', 'role'].includes(field)) ||
    typeof email !== 'string' ||
    email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    !roles.includes(role)
  ) {
    return res.status(400).json({ message: 'A valid account email and role (admin, member, or viewer) are required' });
  }

  if (!canAssignMemberRole(callerRole, role)) {
    return res.status(403).json({ message: 'Only the project owner can assign the admin role' });
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

  const pendingInvitation = await ProjectInvitation.findOne({
    projectId: project._id,
    email: user.email,
    status: 'pending',
  });

  if (callerRole !== 'owner' && pendingInvitation?.role === 'admin') {
    return res.status(403).json({ message: 'Only the project owner can manage admin invitations' });
  }

  const updatedProject = await Project.findOneAndUpdate(
    {
      _id: project._id,
      $or: [
        { ownerId: req.userId },
        { members: { $elemMatch: { userId: req.userId, role: 'admin' } } },
      ],
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

  await ProjectInvitation.updateMany(
    { projectId: project._id, email: user.email, status: 'pending' },
    { $set: { status: 'revoked', revokedAt: new Date() } }
  );

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

  const callerRole = getProjectRole(project, req.userId);

  if (!['owner', 'admin'].includes(callerRole)) {
    return res.status(403).json({ message: 'Only project owners and admins can manage members' });
  }

  if (
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body) ||
    Object.keys(req.body).length !== 1 ||
    Object.keys(req.body)[0] !== 'role' ||
    !roles.includes(req.body.role)
  ) {
    return res.status(400).json({ message: 'Role must be admin, member, or viewer' });
  }

  const member = project.members.find((item) => item.userId.id === req.params.userId);

  if (!member) {
    return res.status(404).json({ message: 'Project member not found' });
  }

  if (!canManageMemberRole(callerRole, member.role, req.body.role)) {
    return res.status(403).json({ message: 'Only the project owner can manage admin roles' });
  }

  const previousRole = member.role;
  member.role = req.body.role;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await project.save({ session });

      if (member.role === 'viewer') {
        await clearMemberAssignments(project._id, member.userId._id, req.userId, session);
        await TaskTransferRequest.updateMany(
          { projectId: project._id, taskOwnerId: member.userId._id, status: 'pending' },
          { $set: { status: 'cancelled', respondedAt: new Date() } },
          { session }
        );
      }

      if (previousRole === 'admin' && member.role !== 'admin') {
        await TaskTransferRequest.updateMany(
          { projectId: project._id, requestedBy: member.userId._id, status: 'pending' },
          { $set: { status: 'cancelled', respondedAt: new Date() } },
          { session }
        );
      }
    });
  } finally {
    await session.endSession();
  }

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

  const callerRole = getProjectRole(project, req.userId);

  if (!['owner', 'admin'].includes(callerRole)) {
    return res.status(403).json({ message: 'Only project owners and admins can manage members' });
  }

  const member = project.members.find((item) => item.userId.id === req.params.userId);

  if (!member) {
    return res.status(404).json({ message: 'Project member not found' });
  }

  if (!canManageMemberRole(callerRole, member.role)) {
    return res.status(403).json({ message: 'Only the project owner can remove admins' });
  }

  project.members = project.members.filter((item) => item.userId.id !== req.params.userId);
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await project.save({ session });
      await clearMemberAssignments(project._id, req.params.userId, req.userId, session);
      await TaskTransferRequest.updateMany(
        {
          projectId: project._id,
          $or: [{ taskOwnerId: req.params.userId }, { requestedBy: req.params.userId }],
          status: 'pending',
        },
        { $set: { status: 'cancelled', respondedAt: new Date() } },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  return res.json({ project: await serializeProjectWithTaskStats(project) });
}

async function getProjectTasks(req, res) {
  const filter = { projectId: req.project._id };

  if (req.query.assignedToMe === 'true') {
    filter.assigneeIds = req.userId;
  } else if (req.query.assignedToMe !== undefined && req.query.assignedToMe !== 'false') {
    return res.status(400).json({ message: 'assignedToMe must be true or false' });
  }

  const tasks = await ProjectTask.find(filter)
    .sort({ createdAt: -1 })
    .populate('assigneeIds', 'name email');
  return res.json({ tasks: tasks.map(serializeTask) });
}

async function createProjectTask(req, res) {
  const validation = validateProjectTaskInput(req.body);

  if (validation.error) {
    return res.status(400).json({ message: validation.error });
  }

  const values = { ...validation.values };
  const role = getProjectRole(req.project, req.userId);

  if (role === 'member' || role === 'viewer') {
    if (Object.hasOwn(values, 'assigneeIds')) {
      return res.status(403).json({ message: 'Only project owners and admins can assign tasks' });
    }
    values.assigneeIds = [req.userId];
  } else {
    values.assigneeIds ??= [];

    if (!validateAssigneeMembership(req.project, values.assigneeIds)) {
      return res.status(400).json({ message: 'Every assignee must be an active, task-eligible member of this project' });
    }
  }

  const session = await mongoose.startSession();
  let task;
  try {
    await session.withTransaction(async () => {
      [task] = await ProjectTask.create([{
        ...values,
        projectId: req.project._id,
        createdBy: req.userId,
      }], { session });
      await recordProjectTaskActivity({
        projectId: req.project._id,
        taskId: task._id,
        taskTitle: task.title,
        actorId: req.userId,
        type: 'task_created',
        session,
      });
    });
  } finally {
    await session.endSession();
  }
  await task.populate('assigneeIds', 'name email');
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

  const role = getProjectRole(req.project, req.userId);
  if (!['owner', 'admin', 'member'].includes(role)) {
    return res.status(403).json({ message: 'You do not have permission to update project tasks' });
  }
  if (
    (role === 'owner' || role === 'admin') &&
    Object.hasOwn(validation.values, 'assigneeIds') &&
    !validateAssigneeMembership(req.project, validation.values.assigneeIds)
  ) {
    return res.status(400).json({ message: 'Every assignee must be an active, task-eligible member of this project' });
  }

  const session = await mongoose.startSession();
  let task;
  let forbidden = false;
  try {
    await session.withTransaction(async () => {
      task = await ProjectTask.findOne({
        _id: req.params.taskId,
        projectId: req.project._id,
      }).session(session);
      if (!task) return;

      if (role === 'member' && !canMemberUpdateProjectTask(task, req.userId, validation.values)) {
        forbidden = true;
        return;
      }

      const changes = buildTaskChanges(task, validation.values);
      if (changes.length === 0) return;
      task.set(validation.values);
      await task.save({ session });
      if (Object.hasOwn(validation.values, 'assigneeIds')) {
        await Notification.updateMany({
          taskType: 'project',
          taskId: task._id,
          userId: { $nin: task.assigneeIds },
        }, {
          $set: { deletedAt: new Date() },
        }, { session });
      }
      if (validation.values.status === 'Completed') {
        await Notification.updateMany({
          taskType: 'project',
          taskId: task._id,
          readAt: null,
        }, {
          $set: { deletedAt: new Date() },
        }, { session });
      } else if (Object.hasOwn(validation.values, 'deadline')) {
        await Notification.updateMany({
          taskType: 'project',
          taskId: task._id,
          readAt: null,
          ...(task.deadline ? { dueAt: { $ne: task.deadline } } : {}),
        }, {
          $set: { deletedAt: new Date() },
        }, { session });
      }
      await recordProjectTaskActivity({
        projectId: req.project._id,
        taskId: task._id,
        taskTitle: task.title,
        actorId: req.userId,
        type: 'task_updated',
        changes,
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  if (!task) {
    return res.status(404).json({ message: 'Project task not found' });
  }
  if (forbidden) {
    return res.status(403).json({ message: 'Members can update the status of tasks assigned to them only' });
  }

  await task.populate('assigneeIds', 'name email');
  return res.json({ task: serializeTask(task) });
}

async function deleteProjectTask(req, res) {
  if (!isValidId(req.params.taskId)) {
    return res.status(400).json({ message: 'Invalid task ID' });
  }

  const session = await mongoose.startSession();
  let task;
  try {
    await session.withTransaction(async () => {
      task = await ProjectTask.findOne({
        _id: req.params.taskId,
        projectId: req.project._id,
      }).session(session);
      if (!task) return;

      await recordProjectTaskActivity({
        projectId: req.project._id,
        taskId: task._id,
        taskTitle: task.title,
        actorId: req.userId,
        type: 'task_deleted',
        session,
      });
      await TaskComment.deleteMany({
        taskType: 'project',
        projectId: req.project._id,
        taskId: task._id,
      }, { session });
      await Notification.updateMany({
        taskType: 'project',
        taskId: task._id,
      }, {
        $set: { deletedAt: new Date() },
      }, { session });
      await ProjectTask.deleteOne({ _id: task._id, projectId: req.project._id }, { session });
    });
  } finally {
    await session.endSession();
  }

  if (!task) {
    return res.status(404).json({ message: 'Project task not found' });
  }

  return res.json({ message: 'Project task deleted successfully' });
}

async function createTaskTransferRequest(req, res) {
  if (
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body) ||
    Object.keys(req.body).length !== 1 ||
    !Object.hasOwn(req.body, 'userId') ||
    !isValidId(req.body.userId)
  ) {
    return res.status(400).json({ message: 'A valid project member ID is required' });
  }

  const callerRole = getProjectRole(req.project, req.userId);
  if (!['owner', 'admin'].includes(callerRole)) {
    return res.status(403).json({ message: 'Only project owners and admins can request a task transfer' });
  }

  const taskOwnerId = req.body.userId.toLowerCase();
  const targetRole = getProjectRole(req.project, taskOwnerId);
  if (!['owner', 'admin', 'member'].includes(targetRole)) {
    return res.status(400).json({ message: 'Choose an owner, admin, or member of this project' });
  }

  if (taskOwnerId === req.userId.toLowerCase()) {
    return res.status(400).json({ message: 'Use the personal task transfer action for your own tasks' });
  }

  const now = new Date();
  await TaskTransferRequest.updateMany(
    { projectId: req.project._id, status: 'pending', expiresAt: { $lte: now } },
    { $set: { status: 'expired', respondedAt: now } }
  );

  try {
    const request = await TaskTransferRequest.create({
      projectId: req.project._id,
      taskOwnerId,
      requestedBy: req.userId,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    });

    return res.status(201).json({
      request: {
        id: request.id,
        taskOwnerId: request.taskOwnerId.toString(),
        status: request.status,
        expiresAt: request.expiresAt.toISOString(),
      },
      message: 'The project member can now review and approve this request from their task dashboard.',
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'There is already a pending task transfer request for this member and project.' });
    }
    throw error;
  }
}

async function listProjectTaskTransferRequests(req, res) {
  const requests = await TaskTransferRequest.find({
    projectId: req.project._id,
    requestedBy: req.userId,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .populate('taskOwnerId', 'name email');

  return res.json({
    requests: requests.map((request) => ({
      id: request.id,
      member: {
        id: request.taskOwnerId.id,
        name: request.taskOwnerId.name,
        email: request.taskOwnerId.email,
      },
      expiresAt: request.expiresAt.toISOString(),
      createdAt: request.createdAt.toISOString(),
    })),
  });
}

async function cancelProjectTaskTransferRequest(req, res) {
  if (!isValidId(req.params.requestId)) {
    return res.status(400).json({ message: 'Invalid transfer request ID' });
  }

  const request = await TaskTransferRequest.findOneAndUpdate(
    {
      _id: req.params.requestId,
      projectId: req.project._id,
      requestedBy: req.userId,
      status: 'pending',
    },
    { $set: { status: 'cancelled', respondedAt: new Date() } },
    { new: true }
  );

  if (!request) {
    return res.status(404).json({ message: 'Pending transfer request not found' });
  }

  return res.json({ message: 'Task transfer request cancelled.' });
}

module.exports = {
  addProjectMember,
  canAssignMemberRole,
  canMemberUpdateProjectTask,
  canEditProjectTasks,
  canManageMemberRole,
  canManageMembers,
  createProject,
  createProjectTask,
  createTaskTransferRequest,
  deleteProjectTask,
  getProject,
  getProjectRole,
  getProjectTasks,
  listProjectTaskTransferRequests,
  isValidId,
  listProjects,
  removeProjectMember,
  serializeProject,
  serializeTask,
  validateAssigneeMembership,
  updateProjectMember,
  updateProjectTask,
  cancelProjectTaskTransferRequest,
  validateProjectInput,
  validateProjectTaskInput,
};
