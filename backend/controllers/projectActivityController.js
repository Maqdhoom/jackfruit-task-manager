const ProjectTaskActivity = require('../models/ProjectTaskActivity');
const TaskComment = require('../models/TaskComment');
const { paginateNewest } = require('../utils/paginateNewest');

function serializeChanges(changes) {
  return changes.map((change) => {
    if (change.field === 'assigneeIds') {
      const describeCount = (value) => {
        const count = Array.isArray(value) ? value.length : 0;
        return `${count} assignee${count === 1 ? '' : 's'}`;
      };
      return { field: change.field, from: describeCount(change.from), to: describeCount(change.to) };
    }

    if (change.field === 'description' || change.field === 'title') {
      return { field: change.field, from: null, to: null };
    }
    return change;
  });
}

async function listProjectActivity(req, res) {
  const page = await paginateNewest(
    ProjectTaskActivity,
    { projectId: req.project._id },
    req.query.cursor
  );
  if (page.error) return res.status(400).json({ message: page.error });

  await ProjectTaskActivity.populate(page.records, { path: 'actorId', select: 'name' });
  const deletedTaskIds = page.records
    .filter((activity) => activity.type === 'task_deleted')
    .map((activity) => activity.taskId);
  const privateNoteTaskIds = deletedTaskIds.length
    ? await TaskComment.distinct('transferredProjectTaskId', {
      transferredProjectTaskId: { $in: deletedTaskIds },
      ownerId: req.userId,
    })
    : [];
  const privateNoteTaskIdSet = new Set(privateNoteTaskIds.map((id) => id.toString()));

  return res.json({
    activities: page.records.map((activity) => ({
      id: activity.id,
      type: activity.type,
      task: { id: activity.taskId.toString(), title: activity.taskTitle },
      actor: {
        id: activity.actorId?._id?.toString() ?? activity.actorId?.toString(),
        name: activity.actorId?.name ?? 'Former member',
      },
      changes: serializeChanges(activity.changes),
      hasPrivateNotes: privateNoteTaskIdSet.has(activity.taskId.toString()),
      createdAt: activity.createdAt.toISOString(),
    })),
    nextCursor: page.nextCursor,
  });
}

module.exports = { listProjectActivity, serializeChanges };
