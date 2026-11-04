require('dotenv').config();

const mongoose = require('mongoose');
const ProjectTask = require('../models/ProjectTask');
const ProjectTaskActivity = require('../models/ProjectTaskActivity');
const connectDB = require('../config/db');

async function migrateProjectTaskActivity() {
  try {
    await connectDB();
    await ProjectTaskActivity.init();

    const transferredTaskIds = new Set(
      (await ProjectTaskActivity.distinct('taskId', { type: 'task_transferred' }))
        .map((taskId) => taskId.toString())
    );
    const operations = [];
    let skipped = 0;
    let inserted = 0;

    const tasks = ProjectTask.find()
      .select('_id projectId title createdBy createdAt updatedAt')
      .lean()
      .cursor();

    for await (const task of tasks) {
      if (transferredTaskIds.has(task._id.toString()) || !task.createdBy) {
        skipped += 1;
        continue;
      }

      operations.push({
        updateOne: {
          filter: { taskId: task._id, type: 'task_created' },
          update: {
            $setOnInsert: {
              projectId: task.projectId,
              taskId: task._id,
              taskTitle: task.title,
              actorId: task.createdBy,
              type: 'task_created',
              changes: [],
              createdAt: task.createdAt ?? task.updatedAt ?? new Date(),
            },
          },
          upsert: true,
        },
      });

      if (operations.length === 500) {
        const result = await ProjectTaskActivity.collection.bulkWrite(operations, { ordered: false });
        inserted += result.upsertedCount;
        skipped += operations.length - result.upsertedCount;
        operations.length = 0;
      }
    }

    if (operations.length) {
      const result = await ProjectTaskActivity.collection.bulkWrite(operations, { ordered: false });
      inserted += result.upsertedCount;
      skipped += operations.length - result.upsertedCount;
    }

    console.log(`Created ${inserted} task history entries; skipped ${skipped} task(s).`);
  } finally {
    await mongoose.disconnect();
  }
}

migrateProjectTaskActivity().catch((error) => {
  console.error('Project task activity migration failed:', error);
  process.exitCode = 1;
});
