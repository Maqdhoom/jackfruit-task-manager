const mongoose = require('mongoose');

const projectTaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      maxlength: 160,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Medium',
    },
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Completed'],
      default: 'Pending',
    },
    deadline: {
      type: Date,
      default: null,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assigneeIds: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      }],
      default: [],
    },
    commentVersion: {
      type: Number,
      default: 0,
      select: false,
    },
  },
  { timestamps: true }
);

projectTaskSchema.index({ projectId: 1, createdAt: -1 });
projectTaskSchema.index({ projectId: 1, assigneeIds: 1, status: 1 });
projectTaskSchema.index({ status: 1, deadline: 1 });

module.exports = mongoose.model('ProjectTask', projectTaskSchema);
