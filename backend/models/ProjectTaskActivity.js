const mongoose = require('mongoose');

const taskChangeSchema = new mongoose.Schema(
  {
    field: {
      type: String,
      required: true,
    },
    from: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    to: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false }
);

const projectTaskActivitySchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    taskTitle: {
      type: String,
      required: true,
      maxlength: 160,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['task_created', 'task_updated', 'task_deleted', 'task_transferred', 'comment_added'],
      required: true,
    },
    changes: {
      type: [taskChangeSchema],
      default: [],
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

projectTaskActivitySchema.index({ projectId: 1, createdAt: -1, _id: -1 });
projectTaskActivitySchema.index(
  { taskId: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: 'task_created' } }
);

module.exports = mongoose.model('ProjectTaskActivity', projectTaskActivitySchema);
