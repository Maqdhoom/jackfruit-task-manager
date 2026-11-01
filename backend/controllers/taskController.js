const mongoose = require('mongoose');
const Task = require('../models/Task');

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

  const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.userId });

  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }

  return res.json({ message: 'Task deleted successfully' });
}

module.exports = {
  calculateDashboardSummary,
  createTask,
  deleteTask,
  getDashboardSummary,
  getTask,
  getTasks,
  updateTask,
};
