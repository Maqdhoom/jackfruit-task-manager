const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DAY_MS,
  MINUTE_MS,
  eligibleAssignees,
  getDeadlineWindows,
  makeDedupeKey,
  notificationContent,
} = require('../services/deadlineReminderService');

const ownerId = '507f1f77bcf86cd799439012';
const editorId = '507f1f77bcf86cd799439013';
const viewerId = '507f1f77bcf86cd799439014';
const inactiveId = '507f1f77bcf86cd799439015';

test('reminder windows recover each stage since the last successful run', () => {
  const lastRunAt = new Date('2026-11-04T10:00:00.000Z');
  const now = new Date('2026-11-04T10:05:00.000Z');
  const windows = getDeadlineWindows(lastRunAt, now);

  assert.deepEqual(windows.reminder24h, {
    $gte: new Date(lastRunAt.getTime() + DAY_MS),
    $lte: new Date(now.getTime() + DAY_MS),
  });
  assert.deepEqual(windows.due, { $gte: lastRunAt, $lte: now });
  assert.deepEqual(windows.overdue, {
    $gte: new Date(lastRunAt.getTime() - MINUTE_MS),
    $lte: new Date(now.getTime() - MINUTE_MS),
  });
});

test('first scheduler run catches the next 24-hour trigger and existing overdue tasks', () => {
  const now = new Date('2026-11-04T10:00:00.000Z');
  const windows = getDeadlineWindows(now, now, true);

  assert.deepEqual(windows.reminder24h, {
    $gte: new Date(now.getTime() + DAY_MS),
    $lte: new Date(now.getTime() + DAY_MS),
  });
  assert.deepEqual(windows.overdue, { $lte: new Date(now.getTime() - MINUTE_MS) });
});

test('only active task-eligible project assignees receive reminders', () => {
  const recipients = eligibleAssignees({
    assigneeIds: [ownerId, editorId, viewerId, inactiveId, editorId],
  }, {
    ownerId,
    members: [
      { userId: editorId, role: 'editor' },
      { userId: viewerId, role: 'viewer' },
    ],
  });

  assert.deepEqual(recipients, [ownerId, editorId]);
});

test('reminder idempotency key includes task, deadline, and stage', () => {
  const taskId = '507f1f77bcf86cd799439016';
  const deadline = new Date('2026-11-05T10:00:00.000Z');
  const first = makeDedupeKey(taskId, deadline, 'task_due');

  assert.equal(first, makeDedupeKey(taskId, deadline, 'task_due'));
  assert.notEqual(first, makeDedupeKey(taskId, deadline, 'task_overdue'));
  assert.notEqual(first, makeDedupeKey(taskId, new Date(deadline.getTime() + 1), 'task_due'));
});

test('reminder content distinguishes the 24-hour, due, and overdue stages', () => {
  assert.equal(
    notificationContent('task_reminder_24h', 'Ship v2', 'Launch').message,
    '"Ship v2" is due in 24 hours in Launch.'
  );
  assert.match(notificationContent('task_due', 'Ship v2', 'Launch').message, /due now/);
  assert.match(notificationContent('task_overdue', 'Ship v2', 'Launch').message, /overdue/);
});
