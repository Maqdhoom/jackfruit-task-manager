const mongoose = require('mongoose');
const ProjectTask = require('../models/ProjectTask');
const Task = require('../models/Task');
const TaskComment = require('../models/TaskComment');
const { recordProjectTaskActivity } = require('../services/projectTaskActivityService');
const { paginateNewest } = require('../utils/paginateNewest');

const COMMENT_FIELDS = ['body'];

function isValidTaskId(id) {
  return mongoose.isValidObjectId(id) && /^[a-f\d]{24}$/i.test(id);
}

function validateCommentInput(body) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((field) => !COMMENT_FIELDS.includes(field))
  ) {
    return { error: 'A comment object containing only body is required' };
  }

  if (typeof body.body !== 'string' || !body.body.trim() || body.body.trim().length > 5000) {
    return { error: 'Comment must be between 1 and 5000 characters' };
  }

  return { value: body.body.trim() };
}

function canPostProjectComment(role) {
  return ['owner', 'admin', 'member'].includes(role);
}

function serializeComment(comment) {
  return {
    id: comment.id,
    body: comment.body,
    author: {
      id: comment.authorId?._id?.toString() ?? comment.authorId?.toString(),
      name: comment.authorId?.name ?? '',
    },
    createdAt: comment.createdAt.toISOString(),
  };
}

async function loadComments(filter, cursor) {
  const page = await paginateNewest(TaskComment, filter, cursor);
  if (page.error) return page;
  await TaskComment.populate(page.records, { path: 'authorId', select: 'name' });
  return {
    comments: page.records.map(serializeComment),
    nextCursor: page.nextCursor,
  };
}

async function listPersonalTaskComments(req, res) {
  if (!isValidTaskId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid task ID' });
  }

  const task = await Task.findOne({ _id: req.params.id, userId: req.userId }).select('_id');
  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }

  const page = await loadComments(
    { taskType: 'personal', taskId: req.params.id, ownerId: req.userId },
    req.query.cursor
  );
  if (page.error) return res.status(400).json({ message: page.error });

  return res.json(page);
}

async function listTransferredPrivateTaskNotes(req, res) {
  if (!isValidTaskId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid task ID' });
  }
  const page = await loadComments({
    taskType: 'personal',
    transferredProjectTaskId: req.params.id,
    ownerId: req.userId,
  }, req.query.cursor);
  if (page.error) return res.status(400).json({ message: page.error });
  return res.json(page);
}

async function createPersonalTaskComment(req, res) {
  if (!isValidTaskId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid task ID' });
  }
  const validation = validateCommentInput(req.body);
  if (validation.error) return res.status(400).json({ message: validation.error });

  const session = await mongoose.startSession();
  let comment;
  try {
    await session.withTransaction(async () => {
      comment = undefined;
      const task = await Task.findOneAndUpdate(
        { _id: req.params.id, userId: req.userId },
        { $inc: { commentVersion: 1 } },
        { new: true, session, timestamps: false }
      ).select('_id');
      if (!task) return;

      [comment] = await TaskComment.create([{
        taskType: 'personal',
        taskId: task._id,
        ownerId: req.userId,
        authorId: req.userId,
        body: validation.value,
      }], { session });
    });
  } finally {
    await session.endSession();
  }
  if (!comment) return res.status(404).json({ message: 'Task not found' });
  await comment.populate('authorId', 'name');
  return res.status(201).json({ comment: serializeComment(comment) });
}

async function listProjectTaskComments(req, res) {
  if (!isValidTaskId(req.params.taskId)) {
    return res.status(400).json({ message: 'Invalid task ID' });
  }

  const task = await ProjectTask.findOne({
    _id: req.params.taskId,
    projectId: req.project._id,
  }).select('_id');
  if (!task) return res.status(404).json({ message: 'Project task not found' });

  const [comments, privateNotes] = await Promise.all([
    loadComments(
      { taskType: 'project', taskId: task._id, projectId: req.project._id },
      req.query.cursor
    ),
    loadComments(
      { taskType: 'personal', transferredProjectTaskId: task._id, ownerId: req.userId },
      req.query.privateCursor
    ),
  ]);
  if (comments.error || privateNotes.error) {
    return res.status(400).json({ message: comments.error ?? privateNotes.error });
  }

  return res.json({ comments: comments.comments, nextCursor: comments.nextCursor, privateNotes: privateNotes.comments, privateNotesNextCursor: privateNotes.nextCursor });
}

async function createProjectTaskComment(req, res) {
  if (!isValidTaskId(req.params.taskId)) {
    return res.status(400).json({ message: 'Invalid task ID' });
  }
  if (!canPostProjectComment(req.projectRole)) {
    return res.status(403).json({ message: 'Viewers can read comments but cannot post' });
  }
  const validation = validateCommentInput(req.body);
  if (validation.error) return res.status(400).json({ message: validation.error });

  const session = await mongoose.startSession();
  let comment;
  try {
    await session.withTransaction(async () => {
      comment = undefined;
      const task = await ProjectTask.findOneAndUpdate(
        {
        _id: req.params.taskId,
        projectId: req.project._id,
        },
        { $inc: { commentVersion: 1 } },
        { new: true, session, timestamps: false }
      );
      if (!task) return;

      [comment] = await TaskComment.create([{
        taskType: 'project',
        taskId: task._id,
        projectId: req.project._id,
        authorId: req.userId,
        body: validation.value,
      }], { session });

      await recordProjectTaskActivity({
        projectId: req.project._id,
        taskId: task._id,
        taskTitle: task.title,
        actorId: req.userId,
        type: 'comment_added',
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  if (!comment) return res.status(404).json({ message: 'Project task not found' });
  await comment.populate('authorId', 'name');
  return res.status(201).json({ comment: serializeComment(comment) });
}

module.exports = {
  createPersonalTaskComment,
  createProjectTaskComment,
  isValidTaskId,
  canPostProjectComment,
  listPersonalTaskComments,
  listProjectTaskComments,
  listTransferredPrivateTaskNotes,
  serializeComment,
  validateCommentInput,
};
