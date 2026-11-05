const mongoose = require('mongoose');
const Project = require('../models/Project');
const ProjectTask = require('../models/ProjectTask');
const Task = require('../models/Task');
const TaskComment = require('../models/TaskComment');
const TaskTransferRequest = require('../models/TaskTransferRequest');
const { recordProjectTaskActivity } = require('../services/projectTaskActivityService');

const priorities = ['Low', 'Medium', 'High'];
const statuses = ['Pending', 'In Progress', 'Completed'];
const taskFields = ['title', 'description', 'priority', 'status', 'deadline'];

function validateTaskInput(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'A task object is required' };
  }

  const providedFields = taskFields.filter((field) => Object.hasOwn(body, field));

  if (partial && providedFields.length === 0) {
    return { error: 'Provide at least one task field to update' };
  }

  if (!partial && (!Object.hasOwn(body, 'title') || !Object.hasOwn(body, 'deadline'))) {
    return { error: 'Task title and deadline are required' };
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
    if (typeof body.deadline !== 'string' || !body.deadline.trim()) {
      return { error: 'Deadline is required' };
    }

    const deadline = new Date(body.deadline);

    if (
      Number.isNaN(deadline.getTime()) ||
      (/^\d{4}-\d{2}-\d{2}$/.test(body.deadline) &&
        deadline.toISOString().slice(0, 10) !== body.deadline)
    ) {
      return { error: 'Deadline must be a valid date' };
    }

    values.deadline = deadline;
  }

  return { values };
}

function isValidTaskId(id) {
  return mongoose.isValidObjectId(id) && /^[a-f\d]{24}$/i.test(id);
}

function getTaskEligibleProjectRole(project, userId) {
  const ownerId = project.ownerId?._id?.toString() ?? project.ownerId.toString();
  if (ownerId === userId.toString()) return 'owner';
  const role = project.members.find(
    (member) => (member.userId?._id?.toString() ?? member.userId.toString()) === userId.toString()
  )?.role;
  return role === 'editor' ? 'member' : role ?? null;
}

function isTaskEligibleProjectRole(role) {
  return ['owner', 'admin', 'member'].includes(role);
}

function validateTransferInput(body, permittedFields) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((field) => !permittedFields.includes(field))
  ) {
    return false;
  }
  return true;
}

function canAcceptTaskTransferRequest(request, userId, projectId, now = new Date()) {
  const taskOwnerId = request.taskOwnerId?._id?.toString() ?? request.taskOwnerId?.toString();
  const requestProjectId = request.projectId?._id?.toString() ?? request.projectId?.toString();

  return (
    taskOwnerId?.toLowerCase() === userId.toString().toLowerCase() &&
    requestProjectId?.toLowerCase() === projectId.toString().toLowerCase() &&
    request.status === 'pending' &&
    request.expiresAt > now
  );
}

function serializeTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    deadline: task.deadline.toISOString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function calculateDashboardSummary(tasks, now = new Date()) {
  const totalTasks = tasks.length;
  const pendingTasks = tasks.filter((task) => task.status === 'Pending').length;
  const completedTasks = tasks.filter((task) => task.status === 'Completed').length;
  const inProgressTasks = tasks.filter((task) => task.status === 'In Progress').length;
  const overdueTasks = tasks.filter(
    (task) => task.status !== 'Completed' && new Date(task.deadline) < now
  ).length;
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const upcomingTasks = tasks
    .filter((task) => {
      const deadline = new Date(task.deadline);
      return task.status !== 'Completed' && deadline >= now && deadline <= nextWeek;
    })
    .sort((first, second) => new Date(first.deadline) - new Date(second.deadline))
    .slice(0, 5)
    .map(serializeTask);

  return {
    summary: {
      totalTasks,
      pendingTasks,
      completedTasks,
      inProgressTasks,
      overdueTasks,
      progress: totalTasks === 0 ? 0 : Number(((completedTasks / totalTasks) * 100).toFixed(1)),
    },
    upcomingTasks,
  };
}

async function getDashboardSummary(req, res) {
  const tasks = await Task.find({ userId: req.userId });
  return res.json({ success: true, ...calculateDashboardSummary(tasks) });
}

async function createTask(req, res) {
  const validation = validateTaskInput(req.body);

  if (validation.error) {
    return res.status(400).json({ message: validation.error });
  }

  const task = await Task.create({ ...validation.values, userId: req.userId });
  return res.status(201).json({ task: serializeTask(task) });
}

async function getTasks(req, res) {
  const tasks = await Task.find({ userId: req.userId }).sort({ createdAt: -1 });
  return res.json({ tasks: tasks.map(serializeTask) });
}

async function getCalendarTasks(req, res) {
  const projects = await Project.find({
    $or: [{ ownerId: req.userId }, { 'members.userId': req.userId }],
  }).select('_id name');
  const projectIds = projects.map((project) => project._id);
  const [personalTasks, projectTasks] = await Promise.all([
    Task.find({ userId: req.userId, deadline: { $ne: null } })
      .select('title priority status deadline')
      .lean(),
    ProjectTask.find({ projectId: { $in: projectIds }, deadline: { $ne: null } })
      .select('title priority status deadline projectId')
      .populate('projectId', 'name')
      .lean(),
  ]);
  const projectNames = new Map(projects.map((project) => [project._id.toString(), project.name]));

  return res.json({
    tasks: [
      ...personalTasks.map((task) => ({
        id: task._id.toString(),
        title: task.title,
        priority: task.priority,
        status: task.status,
        deadline: task.deadline.toISOString(),
        source: 'personal',
        project: null,
      })),
      ...projectTasks.map((task) => {
        const projectId = task.projectId?._id?.toString() ?? task.projectId?.toString();
        return {
          id: task._id.toString(),
          title: task.title,
          priority: task.priority,
          status: task.status,
          deadline: task.deadline.toISOString(),
          source: 'project',
          project: projectId
            ? { id: projectId, name: projectNames.get(projectId) ?? task.projectId.name }
            : null,
        };
      }),
    ],
  });
}

async function getTaskTransferRequests(req, res) {
  const now = new Date();
  await TaskTransferRequest.updateMany(
    { taskOwnerId: req.userId, status: 'pending', expiresAt: { $lte: now } },
    { $set: { status: 'expired', respondedAt: now } }
  );
  const requests = await TaskTransferRequest.find({
    taskOwnerId: req.userId,
    status: 'pending',
    expiresAt: { $gt: now },
  })
    .sort({ createdAt: -1 })
    .populate('projectId', 'name')
    .populate('requestedBy', 'name email');

  return res.json({
    requests: requests
      .filter((request) => request.projectId && request.requestedBy)
      .map((request) => ({
        id: request.id,
        project: {
          id: request.projectId.id,
          name: request.projectId.name,
        },
        requestedBy: {
          id: request.requestedBy.id,
          name: request.requestedBy.name,
          email: request.requestedBy.email,
        },
        expiresAt: request.expiresAt.toISOString(),
        createdAt: request.createdAt.toISOString(),
      })),
  });
}

class TaskTransferError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function transferPersonalTask(taskId, userId, projectId, requestId = null) {
  const session = await mongoose.startSession();
  let projectTaskId;

  try {
    await session.withTransaction(async () => {
      const personalTask = await Task.findOne({ _id: taskId, userId }).session(session);
      if (!personalTask) throw new TaskTransferError(404, 'Personal task not found.');

      const project = await Project.findById(projectId).session(session);
      if (!project) throw new TaskTransferError(404, 'Project not found.');

      if (!isTaskEligibleProjectRole(getTaskEligibleProjectRole(project, userId))) {
        throw new TaskTransferError(403, 'You must be an owner, admin, or member of the project to transfer a task.');
      }

      if (requestId) {
        const request = await TaskTransferRequest.findById(requestId).session(session);
        if (!request || !canAcceptTaskTransferRequest(request, userId, projectId)) {
          throw new TaskTransferError(404, 'This transfer request is no longer available.');
        }
      }

      const [projectTask] = await ProjectTask.create([{
        title: personalTask.title,
        description: personalTask.description,
        priority: personalTask.priority,
        status: personalTask.status,
        deadline: personalTask.deadline,
        projectId: project._id,
        createdBy: userId,
        assigneeIds: [userId],
      }], { session });

      await TaskComment.updateMany(
        {
          taskType: 'personal',
          taskId: personalTask._id,
          ownerId: userId,
          transferredProjectTaskId: null,
        },
        { $set: { transferredProjectTaskId: projectTask._id } },
        { session }
      );
      await recordProjectTaskActivity({
        projectId: project._id,
        taskId: projectTask._id,
        taskTitle: projectTask.title,
        actorId: userId,
        type: 'task_transferred',
        session,
      });

      const deletedTask = await Task.findOneAndDelete({ _id: personalTask._id, userId }, { session });
      if (!deletedTask) throw new TaskTransferError(409, 'The personal task changed during transfer. Please try again.');

      if (requestId) {
        const requestUpdate = await TaskTransferRequest.updateOne(
          {
            _id: requestId,
            taskOwnerId: userId,
            status: 'pending',
            expiresAt: { $gt: new Date() },
          },
          {
            $set: {
              status: 'accepted',
              respondedAt: new Date(),
              projectTaskId: projectTask._id,
            },
          },
          { session }
        );
        if (requestUpdate.modifiedCount !== 1) {
          throw new TaskTransferError(409, 'This transfer request was cancelled or already handled.');
        }
      }
      projectTaskId = projectTask.id;
    });
  } catch (error) {
    if (error instanceof TaskTransferError) {
      return { error: { status: error.status, message: error.message } };
    }
    throw error;
  } finally {
    await session.endSession();
  }

  return { projectTaskId };
}

async function transferOwnTaskToProject(req, res) {
  if (!isValidTaskId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid task ID' });
  }
  if (!validateTransferInput(req.body, ['projectId']) || !isValidTaskId(req.body.projectId)) {
    return res.status(400).json({ message: 'A valid destination project ID is required' });
  }

  const result = await transferPersonalTask(req.params.id, req.userId, req.body.projectId);
  if (result.error) {
    return res.status(result.error.status).json({ message: result.error.message });
  }
  return res.json({ projectTaskId: result.projectTaskId, message: 'Personal task moved into the project.' });
}

async function acceptTaskTransferRequest(req, res) {
  if (
    !isValidTaskId(req.params.requestId) ||
    !validateTransferInput(req.body, ['taskId']) ||
    !isValidTaskId(req.body.taskId)
  ) {
    return res.status(400).json({ message: 'A valid transfer request and personal task ID are required' });
  }

  const request = await TaskTransferRequest.findOne({
    _id: req.params.requestId,
    taskOwnerId: req.userId,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  });
  if (!request) {
    return res.status(404).json({ message: 'Pending transfer request not found or expired.' });
  }

  const result = await transferPersonalTask(
    req.body.taskId,
    req.userId,
    request.projectId,
    request.id
  );
  if (result.error) {
    return res.status(result.error.status).json({ message: result.error.message });
  }
  return res.json({ projectTaskId: result.projectTaskId, message: 'Task transferred to the project.' });
}

async function declineTaskTransferRequest(req, res) {
  if (!isValidTaskId(req.params.requestId)) {
    return res.status(400).json({ message: 'Invalid transfer request ID' });
  }
  const request = await TaskTransferRequest.findOneAndUpdate(
    {
      _id: req.params.requestId,
      taskOwnerId: req.userId,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    },
    { $set: { status: 'declined', respondedAt: new Date() } },
    { new: true }
  );
  if (!request) {
    return res.status(404).json({ message: 'Pending transfer request not found or expired.' });
  }
  return res.json({ message: 'Task transfer request declined.' });
}

async function getTask(req, res) {
  if (!isValidTaskId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid task ID' });
  }

  const task = await Task.findOne({ _id: req.params.id, userId: req.userId });

  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }

  return res.json({ task: serializeTask(task) });
}

async function updateTask(req, res) {
  if (!isValidTaskId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid task ID' });
  }

  const validation = validateTaskInput(req.body, true);

  if (validation.error) {
    return res.status(400).json({ message: validation.error });
  }

  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    validation.values,
    { new: true, runValidators: true }
  );

  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }

  return res.json({ task: serializeTask(task) });
}

async function deleteTask(req, res) {
  if (!isValidTaskId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid task ID' });
  }

  const session = await mongoose.startSession();
  let task;
  try {
    await session.withTransaction(async () => {
      task = await Task.findOne({ _id: req.params.id, userId: req.userId }).session(session);
      if (!task) return;
      await TaskComment.deleteMany({
        taskType: 'personal',
        taskId: task._id,
        ownerId: req.userId,
      }, { session });
      await Task.deleteOne({ _id: task._id, userId: req.userId }, { session });
    });
  } finally {
    await session.endSession();
  }

  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }

  return res.json({ message: 'Task deleted successfully' });
}

module.exports = {
  acceptTaskTransferRequest,
  calculateDashboardSummary,
  canAcceptTaskTransferRequest,
  createTask,
  deleteTask,
  declineTaskTransferRequest,
  getDashboardSummary,
  getCalendarTasks,
  getTask,
  getTasks,
  getTaskTransferRequests,
  isTaskEligibleProjectRole,
  transferOwnTaskToProject,
  updateTask,
};
