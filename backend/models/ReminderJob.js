const mongoose = require('mongoose');

const reminderJobSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    lastRunAt: {
      type: Date,
      required: true,
    },
    hasRun: {
      type: Boolean,
      default: false,
    },
    lockId: {
      type: String,
      default: null,
    },
    lockUntil: {
      type: Date,
      default: () => new Date(0),
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReminderJob', reminderJobSchema);
