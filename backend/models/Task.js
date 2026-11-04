const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
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
      required: [true, 'Deadline is required'],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    commentVersion: {
      type: Number,
      default: 0,
      select: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', taskSchema);
