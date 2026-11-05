const crypto = require('node:crypto');
const cron = require('node-cron');
const Notification = require('../models/Notification');
const Project = require('../models/Project');
const ProjectTask = require('../models/ProjectTask');
const ReminderJob = require('../models/ReminderJob');

const JOB_ID = 'project-task-deadline-reminders';
const SCHEDULE = '* * * * *';
const LEASE_MS = 5 * 60 * 1000;
const BATCH_SIZE = 200;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = ['Pending', 'In Progress'];
const TASK_ELIGIBLE_ROLES = ['admin', 'member', 'editor'];

function getDeadlineWindows(lastRunAt, now, firstRun = false) {
  return {
    reminder24h: {
      $gte: new Date(lastRunAt.getTime() + DAY_MS),
      $lte: new Date(now.getTime() + DAY_MS),
    },
    due: { $gte: firstRun ? new Date(now.getTime() - MINUTE_MS) : lastRunAt, $lte: now },
    overdue: firstRun
      ? { $lte: new Date(now.getTime() - MINUTE_MS) }
      : {
        $gte: new Date(lastRunAt.getTime() - MINUTE_MS),
        $lte: new Date(now.getTime() - MINUTE_MS),
      },
  };
}

function makeDedupeKey(taskId, dueAt, type) {
  return `project:${taskId.toString()}:${dueAt.toISOString()}:${type}`;
}

function eligibleAssignees(task, project) {
  const activeIds = new Set([
    project.ownerId.toString(),
    ...project.members
      .filter((member) => TASK_ELIGIBLE_ROLES.includes(member.role))
      .map((member) => member.userId.toString()),
  ]);
  return [...new Set((task.assigneeIds ?? []).map((id) => id.toString()))]
    .filter((id) => activeIds.has(id));
}

function notificationContent(type, taskTitle, projectName) {
  if (type === 'task_reminder_24h') {
    return {
      title: 'Task due in 24 hours',
      message: `"${taskTitle}" is due in 24 hours in ${projectName}.`,
    };
  }
  if (type === 'task_due') {
    return {
      title: 'Task deadline reached',
      message: `"${taskTitle}" is due now in ${projectName}.`,
    };
  }
  return {
    title: 'Task overdue',
    message: `"${taskTitle}" is overdue in ${projectName}.`,
  };
}

async function acquireJob(now, lockId) {
  try {
    return await ReminderJob.findOneAndUpdate(
      {
        _id: JOB_ID,
        $or: [
          { lockUntil: { $lte: now } },
          { lockUntil: { $exists: false } },
        ],
      },
      {
        $set: { lockId, lockUntil: new Date(now.getTime() + LEASE_MS) },
        $setOnInsert: { lastRunAt: now, hasRun: false },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

async function renewJob(lockId) {
  const result = await ReminderJob.updateOne(
    { _id: JOB_ID, lockId },
    { $set: { lockUntil: new Date(Date.now() + LEASE_MS) } }
  );
  if (result.modifiedCount !== 1) {
    throw new Error('Deadline reminder job lease was lost');
  }
}

async function releaseJob(lockId, lastRunAt, successful) {
  const update = {
    $set: {
      lockId: null,
      lockUntil: new Date(0),
    },
  };
  if (successful) {
    update.$set.lastRunAt = lastRunAt;
    update.$set.hasRun = true;
  }

  await ReminderJob.updateOne({ _id: JOB_ID, lockId }, update);
}

async function emitForTask(task, project, type) {
  if (!project) return;
  const userIds = eligibleAssignees(task, project);
  if (!userIds.length) return;

  const content = notificationContent(type, task.title, project.name);
  const dueAt = new Date(task.deadline);
  await Notification.bulkWrite(
    userIds.map((userId) => ({
      updateOne: {
        filter: {
          userId,
          dedupeKey: makeDedupeKey(task._id, dueAt, type),
        },
        update: {
          $setOnInsert: {
            userId,
            type,
            ...content,
            taskType: 'project',
            taskId: task._id,
            projectId: project._id,
            dueAt,
            dedupeKey: makeDedupeKey(task._id, dueAt, type),
            readAt: null,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}

async function processWindow(window, type, lockId, firstRun = false) {
  if (!window) return;
  const query = ProjectTask.find({
    status: { $in: ACTIVE_STATUSES },
    deadline: window,
  })
    .select('_id title deadline projectId assigneeIds')
    .lean()
    .cursor();
  let batch = [];

  async function processBatch(tasks) {
    if (!tasks.length) return;
    const projectIds = [...new Set(tasks.map((task) => task.projectId.toString()))];
    const projects = await Project.find({ _id: { $in: projectIds } })
      .select('_id name ownerId members')
      .lean();
    const projectsById = new Map(projects.map((project) => [project._id.toString(), project]));

    for (const task of tasks) {
      await emitForTask(task, projectsById.get(task.projectId.toString()), type);
    }

    if (!firstRun) await renewJob(lockId);
  }

  for await (const task of query) {
    batch.push(task);
    if (batch.length >= BATCH_SIZE) {
      await processBatch(batch);
      batch = [];
    }
  }
  await processBatch(batch);
}

async function runDeadlineReminders(now = new Date()) {
  const lockId = crypto.randomUUID();
  const job = await acquireJob(now, lockId);
  if (!job) return { skipped: true };

  let successful = false;
  try {
    const windows = getDeadlineWindows(job.lastRunAt, now, !job.hasRun);
    await processWindow(windows.reminder24h, 'task_reminder_24h', lockId, !job.hasRun);
    await processWindow(windows.due, 'task_due', lockId);
    await processWindow(windows.overdue, 'task_overdue', lockId);
    successful = true;
    return { skipped: false };
  } finally {
    await releaseJob(lockId, now, successful);
  }
}

function startDeadlineReminderScheduler() {
  const scheduledTask = cron.schedule(SCHEDULE, () => {
    void runDeadlineReminders().catch((error) => {
      console.error('Deadline reminder run failed:', error);
    });
  });

  void runDeadlineReminders().catch((error) => {
    console.error('Initial deadline reminder run failed:', error);
  });

  return scheduledTask;
}

module.exports = {
  ACTIVE_STATUSES,
  BATCH_SIZE,
  DAY_MS,
  JOB_ID,
  LEASE_MS,
  MINUTE_MS,
  SCHEDULE,
  eligibleAssignees,
  getDeadlineWindows,
  makeDedupeKey,
  notificationContent,
  runDeadlineReminders,
  startDeadlineReminderScheduler,
};
