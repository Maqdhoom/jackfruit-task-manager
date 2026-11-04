const assert = require('node:assert/strict');
const test = require('node:test');
const TaskTransferRequest = require('../models/TaskTransferRequest');
const {
  canAcceptTaskTransferRequest,
  calculateDashboardSummary,
  isTaskEligibleProjectRole,
} = require('../controllers/taskController');

const now = new Date('2026-10-30T12:00:00.000Z');

function makeTask(title, status, daysFromNow, priority = 'Medium') {
  const deadline = new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000);
  return {
    id: title,
    title,
    description: '',
    priority,
    status,
    deadline,
    createdAt: now,
    updatedAt: now,
  };
}

test('calculates dashboard counts and progress for the assignment sample', () => {
  const tasks = [
    makeTask('DBMS Assignment', 'Pending', 1),
    makeTask('React Project', 'In Progress', 3),
    makeTask('Python Lab', 'Completed', -1),
    makeTask('CN Assignment', 'Pending', -1),
    makeTask('ML Assignment', 'Completed', 1),
    makeTask('Documentation', 'Pending', 5),
    makeTask('Software Lab', 'Completed', -2),
    makeTask('Testing', 'In Progress', 4),
  ];

  const result = calculateDashboardSummary(tasks, now);

  assert.deepEqual(result.summary, {
    totalTasks: 8,
    pendingTasks: 3,
    completedTasks: 3,
    inProgressTasks: 2,
    overdueTasks: 1,
    progress: 37.5,
  });
  assert.deepEqual(
    result.upcomingTasks.map((task) => task.title),
    ['DBMS Assignment', 'React Project', 'Testing', 'Documentation']
  );
});

test('includes a deadline exactly now as upcoming, but not overdue', () => {
  const result = calculateDashboardSummary([makeTask('Due now', 'Pending', 0)], now);

  assert.equal(result.summary.overdueTasks, 0);
  assert.equal(result.upcomingTasks.length, 1);
});

test('does not count completed tasks with past deadlines as overdue', () => {
  const result = calculateDashboardSummary([makeTask('Finished late', 'Completed', -1)], now);

  assert.equal(result.summary.overdueTasks, 0);
  assert.equal(result.upcomingTasks.length, 0);
});

test('returns zero progress for no tasks and full progress when all are complete', () => {
  assert.equal(calculateDashboardSummary([], now).summary.progress, 0);
  assert.equal(
    calculateDashboardSummary([
      makeTask('First', 'Completed', -1),
      makeTask('Second', 'Completed', 2),
    ], now).summary.progress,
    100
  );
});

test('includes deadlines through seven days and returns no more than five', () => {
  const tasks = [
    makeTask('In seven days', 'Pending', 7),
    makeTask('In eight days', 'Pending', 8),
    ...Array.from({ length: 5 }, (_, index) => makeTask(`Soon ${index}`, 'Pending', index + 1)),
  ];

  const { upcomingTasks } = calculateDashboardSummary(tasks, now);

  assert.equal(upcomingTasks.length, 5);
  assert.equal(upcomingTasks[0].title, 'Soon 0');
  assert.ok(upcomingTasks.every((task) => task.title !== 'In eight days'));
});

test('only project owners, admins, and members can transfer personal tasks into a project', () => {
  assert.equal(isTaskEligibleProjectRole('owner'), true);
  assert.equal(isTaskEligibleProjectRole('admin'), true);
  assert.equal(isTaskEligibleProjectRole('member'), true);
  assert.equal(isTaskEligibleProjectRole('viewer'), false);
  assert.equal(isTaskEligibleProjectRole(null), false);
});

test('only the requested project member can approve an unexpired task transfer request', () => {
  const request = {
    taskOwnerId: '507f1f77bcf86cd799439011',
    projectId: '507f1f77bcf86cd799439014',
    status: 'pending',
    expiresAt: new Date('2026-11-10T00:00:00.000Z'),
  };
  const now = new Date('2026-11-04T00:00:00.000Z');

  assert.equal(canAcceptTaskTransferRequest(request, request.taskOwnerId, request.projectId, now), true);
  assert.equal(canAcceptTaskTransferRequest(request, '507f1f77bcf86cd799439012', request.projectId, now), false);
  assert.equal(canAcceptTaskTransferRequest(request, request.taskOwnerId, '507f1f77bcf86cd799439015', now), false);
  assert.equal(canAcceptTaskTransferRequest({ ...request, status: 'cancelled' }, request.taskOwnerId, request.projectId, now), false);
  assert.equal(canAcceptTaskTransferRequest({ ...request, expiresAt: now }, request.taskOwnerId, request.projectId, now), false);
});

test('task transfer requests do not store or expose private task contents', () => {
  assert.equal(TaskTransferRequest.schema.path('title'), undefined);
  assert.equal(TaskTransferRequest.schema.path('description'), undefined);
  assert.ok(TaskTransferRequest.schema.path('taskOwnerId'));
  assert.ok(TaskTransferRequest.schema.path('projectId'));
});
