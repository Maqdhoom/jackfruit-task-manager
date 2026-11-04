const mongoose = require('mongoose');

const taskTransferRequestSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    taskOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'cancelled', 'expired'],
      default: 'pending',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    projectTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectTask',
      default: null,
    },
  },
  { timestamps: true }
);

taskTransferRequestSchema.index(
  { projectId: 1, taskOwnerId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);
taskTransferRequestSchema.index({ taskOwnerId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('TaskTransferRequest', taskTransferRequestSchema);
