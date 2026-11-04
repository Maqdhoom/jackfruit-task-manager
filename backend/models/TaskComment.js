const mongoose = require('mongoose');

const taskCommentSchema = new mongoose.Schema(
  {
    taskType: {
      type: String,
      enum: ['personal', 'project'],
      required: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    transferredProjectTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectTask',
      default: null,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
  },
  { timestamps: true }
);

taskCommentSchema.index({ taskType: 1, taskId: 1, createdAt: -1, _id: -1 });
taskCommentSchema.index({ transferredProjectTaskId: 1, ownerId: 1, createdAt: -1, _id: -1 });

taskCommentSchema.pre('validate', function validateTaskCommentScope() {
  if (this.taskType === 'personal' && !this.ownerId) {
    this.invalidate('ownerId', 'Personal task comments require an owner');
  }
  if (this.taskType === 'project' && !this.projectId) {
    this.invalidate('projectId', 'Project task comments require a project');
  }
});

module.exports = mongoose.model('TaskComment', taskCommentSchema);
