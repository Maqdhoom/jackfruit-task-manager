const ProjectTaskActivity = require('../models/ProjectTaskActivity');

function activityValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => item?._id?.toString() ?? item?.toString()).sort();
  }
  if (value === undefined || value === null) return null;
  return value;
}

function buildTaskChanges(task, values) {
  return Object.entries(values)
    .map(([field, nextValue]) => {
      const currentValue = task[field];
      const from = activityValue(currentValue);
      const to = activityValue(nextValue);
      return JSON.stringify(from) === JSON.stringify(to) ? null : { field, from, to };
    })
    .filter(Boolean);
}

async function recordProjectTaskActivity({
  projectId,
  taskId,
  taskTitle,
  actorId,
  type,
  changes = [],
  session,
}) {
  await ProjectTaskActivity.create(
    [{ projectId, taskId, taskTitle, actorId, type, changes }],
    { session }
  );
}

module.exports = { buildTaskChanges, recordProjectTaskActivity };
