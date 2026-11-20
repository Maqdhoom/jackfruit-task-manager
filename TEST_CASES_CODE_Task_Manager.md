# Test Cases — Complete Source Code
## Task Manager Project

> All test code extracted directly from your project repository at `D:\task-manager`

---

| Field | Detail |
|---|---|
| **Document** | Test Cases Source Code — All Test Files |
| **Backend Runner** | Node.js built-in `node --test` |
| **Frontend Runner** | Playwright `@playwright/test` v1.64.1 (Google Chrome) |
| **Total Test Files** | 8 files (8 backend + 4 E2E + 1 helper) |
| **Total Test Cases** | 44 backend + 4 E2E = **48 test cases** |
| **All Tests** | ✅ 48/48 Passing |

---

## Table of Contents

**Backend Tests (Node.js — `backend/test/`)**
1. [deadlineReminderService.test.js](#1-deadlinereminderservicetestjs) — 5 tests
2. [notificationController.test.js](#2-notificationcontrollertestjs) — 5 tests
3. [pagination.test.js](#3-paginationtestjs) — 2 tests
4. [projectController.test.js](#4-projectcontrollertestjs) — 10 tests
5. [projectInvitationController.test.js](#5-projectinvitationcontrollertestjs) — 5 tests
6. [taskCommentController.test.js](#6-taskcommentcontrollertestjs) — 4 tests
7. [taskController.test.js](#7-taskcontrollertestjs) — 8 tests
8. [api.integration.test.js](#8-apiintegrationtestjs) — 5 test groups (HTTP integration)

**Frontend / E2E Tests (Playwright Chrome — `frontend/e2e/`)**

9. [testHelpers.ts](#9-testhelperts) — Shared fixtures & API mocks
10. [auth.spec.ts](#10-authspects) — 2 tests
11. [calendar.spec.ts](#11-calendarspects) — 1 test
12. [responsive.spec.ts](#12-responsivespects) — 1 test

---

---

## 1. `deadlineReminderService.test.js`

**Location:** [`backend/test/deadlineReminderService.test.js`](file:///d:/task-manager/backend/test/deadlineReminderService.test.js)
**Tests:** 5 | **Requirement coverage:** FR-CRON-001 to FR-CRON-009

```javascript
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

const ownerId   = '507f1f77bcf86cd799439012';
const editorId  = '507f1f77bcf86cd799439013';
const viewerId  = '507f1f77bcf86cd799439014';
const inactiveId = '507f1f77bcf86cd799439015';

// ─── TC-DRS-001 ───────────────────────────────────────────────────────────────
// Verifies that all three reminder-stage deadline windows are computed correctly
// from a last-run timestamp to a current timestamp.
test('reminder windows recover each stage since the last successful run', () => {
  const lastRunAt = new Date('2026-11-04T10:00:00.000Z');
  const now       = new Date('2026-11-04T10:05:00.000Z');
  const windows   = getDeadlineWindows(lastRunAt, now);

  // 24-hour advance window: shifted forward by one day
  assert.deepEqual(windows.reminder24h, {
    $gte: new Date(lastRunAt.getTime() + DAY_MS),
    $lte: new Date(now.getTime()       + DAY_MS),
  });
  // "Due now" window: tasks whose deadline falls within the scan interval
  assert.deepEqual(windows.due, { $gte: lastRunAt, $lte: now });
  // Overdue window: tasks that became overdue (deadline - 1 min) in this interval
  assert.deepEqual(windows.overdue, {
    $gte: new Date(lastRunAt.getTime() - MINUTE_MS),
    $lte: new Date(now.getTime()       - MINUTE_MS),
  });
});

// ─── TC-DRS-002 ───────────────────────────────────────────────────────────────
// On first run (no prior checkpoint), the 24h window is a point-in-time and
// the overdue window has no lower bound (catches all pre-existing overdue tasks).
test('first scheduler run catches the next 24-hour trigger and existing overdue tasks', () => {
  const now     = new Date('2026-11-04T10:00:00.000Z');
  const windows = getDeadlineWindows(now, now, true); // third arg = isFirstRun

  assert.deepEqual(windows.reminder24h, {
    $gte: new Date(now.getTime() + DAY_MS),
    $lte: new Date(now.getTime() + DAY_MS), // point-in-time, not a range
  });
  // No lower bound: catch all overdue tasks regardless of when they expired
  assert.deepEqual(windows.overdue, { $lte: new Date(now.getTime() - MINUTE_MS) });
});

// ─── TC-DRS-003 ───────────────────────────────────────────────────────────────
// Verifies that viewers, non-members, and duplicates are excluded from the
// eligible assignees list that receives reminder notifications.
test('only active task-eligible project assignees receive reminders', () => {
  const recipients = eligibleAssignees(
    // Task has 5 assigneeId entries: owner, editor, viewer, inactive, editor (dup)
    { assigneeIds: [ownerId, editorId, viewerId, inactiveId, editorId] },
    {
      ownerId,
      members: [
        { userId: editorId, role: 'editor' }, // legacy editor = member-level
        { userId: viewerId, role: 'viewer' }, // viewers excluded
        // inactiveId is NOT in members → excluded
      ],
    }
  );

  // Expected: owner + editor; viewer, inactive, and duplicate dropped
  assert.deepEqual(recipients, [ownerId, editorId]);
});

// ─── TC-DRS-004 ───────────────────────────────────────────────────────────────
// Deduplication key must be deterministic (same inputs → same key) and must
// change when the stage or deadline timestamp changes.
test('reminder idempotency key includes task, deadline, and stage', () => {
  const taskId   = '507f1f77bcf86cd799439016';
  const deadline = new Date('2026-11-05T10:00:00.000Z');
  const first    = makeDedupeKey(taskId, deadline, 'task_due');

  // Same inputs → identical key (deterministic)
  assert.equal(first, makeDedupeKey(taskId, deadline, 'task_due'));
  // Different stage → different key
  assert.notEqual(first, makeDedupeKey(taskId, deadline, 'task_overdue'));
  // Different deadline (even by 1ms) → different key
  assert.notEqual(first, makeDedupeKey(taskId, new Date(deadline.getTime() + 1), 'task_due'));
});

// ─── TC-DRS-005 ───────────────────────────────────────────────────────────────
// Each reminder stage produces a distinct, human-readable notification message.
test('reminder content distinguishes the 24-hour, due, and overdue stages', () => {
  assert.equal(
    notificationContent('task_reminder_24h', 'Ship v2', 'Launch').message,
    '"Ship v2" is due in 24 hours in Launch.'
  );
  assert.match(notificationContent('task_due',     'Ship v2', 'Launch').message, /due now/);
  assert.match(notificationContent('task_overdue', 'Ship v2', 'Launch').message, /overdue/);
});
```

---

## 2. `notificationController.test.js`

**Location:** [`backend/test/notificationController.test.js`](file:///d:/task-manager/backend/test/notificationController.test.js)
**Tests:** 5 | **Requirement coverage:** FR-NOTIF-001 to FR-NOTIF-007

```javascript
const assert = require('node:assert/strict');
const test   = require('node:test');
const Notification = require('../models/Notification');
const {
  deleteNotification,
  isValidNotificationId,
  listNotifications,
  markNotificationRead,
} = require('../controllers/notificationController');

const ownerId        = '507f1f77bcf86cd799439011';
const otherUserId    = '507f1f77bcf86cd799439012';
const notificationId = '507f1f77bcf86cd799439013';

// Helper: creates a mock Express response object
function makeResponse() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body)   { this.body = body;       return this; },
  };
}

// ─── TC-NOTIF-001 ─────────────────────────────────────────────────────────────
// Checks that only valid 24-hex MongoDB ObjectId strings are accepted.
test('validates notification identifiers', () => {
  assert.equal(isValidNotificationId(notificationId), true);  // valid 24-hex
  assert.equal(isValidNotificationId('invalid'),      false); // too short / invalid chars
});

// ─── TC-NOTIF-002 ─────────────────────────────────────────────────────────────
// The list endpoint must scope BOTH the query and the unread count to req.userId.
test('notification listing scopes both records and unread count to the authenticated user', async (t) => {
  const originalFind           = Notification.find;
  const originalCountDocuments = Notification.countDocuments;
  t.after(() => {
    Notification.find           = originalFind;
    Notification.countDocuments = originalCountDocuments;
  });

  let listFilter;
  let countFilter;

  // Stub: captures the filter and returns one mock notification
  Notification.find = (filter) => {
    listFilter = filter;
    return {
      sort()  { return this; },
      async limit() {
        return [{
          id:        notificationId,
          type:      'task_due',
          title:     'Due',
          message:   'Task is due',
          taskId:    '507f1f77bcf86cd799439014',
          taskType:  'project',
          projectId: '507f1f77bcf86cd799439015',
          dueAt:     new Date('2026-11-05T10:00:00.000Z'),
          readAt:    null,
          createdAt: new Date('2026-11-04T10:00:00.000Z'),
        }];
      },
    };
  };
  Notification.countDocuments = async (filter) => { countFilter = filter; return 1; };

  const response = makeResponse();
  await listNotifications({ userId: ownerId, query: {} }, response);

  // Both queries must be scoped to ownerId, not any client-supplied value
  assert.deepEqual(listFilter,  { userId: ownerId, deletedAt: null });
  assert.deepEqual(countFilter, { userId: ownerId, deletedAt: null, readAt: null });
  assert.equal(response.body.unreadCount, 1);
  assert.equal(response.body.notifications[0].task.projectId, '507f1f77bcf86cd799439015');
});

// ─── TC-NOTIF-003 ─────────────────────────────────────────────────────────────
// The mark-read update query must be scoped to userId so a user cannot mutate
// another user's notification even if they know the notification ID.
test('mark-read query cannot mutate another user notification', async (t) => {
  const originalFindOneAndUpdate = Notification.findOneAndUpdate;
  const originalExists           = Notification.exists;
  t.after(() => {
    Notification.findOneAndUpdate = originalFindOneAndUpdate;
    Notification.exists           = originalExists;
  });

  let updateFilter;
  Notification.findOneAndUpdate = async (filter) => { updateFilter = filter; return null; };
  Notification.exists = async (filter) => {
    // Confirm the existence check also uses ownerId
    assert.deepEqual(filter, { _id: notificationId, userId: ownerId, deletedAt: null });
    return false;
  };

  const response = makeResponse();
  await markNotificationRead({ params: { notificationId }, userId: ownerId }, response);

  // findOneAndUpdate must include userId: ownerId (NOT otherUserId)
  assert.deepEqual(updateFilter, {
    _id:       notificationId,
    userId:    ownerId,
    readAt:    null,
    deletedAt: null,
  });
  assert.equal(response.statusCode, 404); // notification not found → 404
  assert.notEqual(updateFilter.userId, otherUserId); // key security assertion
});

// ─── TC-NOTIF-004 ─────────────────────────────────────────────────────────────
// Schema-level: confirms the unique deduplication index and the read-status index
// are present in the Mongoose schema definition.
test('notification schema enforces per-user idempotency and unread queries', () => {
  const indexes = Notification.schema.indexes();
  // Unique compound index prevents duplicate reminder notifications
  assert.ok(indexes.some(([fields, options]) =>
    fields.userId === 1 && fields.dedupeKey === 1 && options.unique
  ));
  // Index for fast unread-count queries
  assert.ok(indexes.some(([fields]) => fields.userId === 1 && fields.readAt === 1));
});

// ─── TC-NOTIF-005 ─────────────────────────────────────────────────────────────
// Delete must soft-delete (set deletedAt) scoped to the owner only.
test('delete notification soft-deletes only a notification owned by the authenticated user', async (t) => {
  const originalFindOneAndUpdate = Notification.findOneAndUpdate;
  t.after(() => { Notification.findOneAndUpdate = originalFindOneAndUpdate; });

  let filter;
  let update;
  Notification.findOneAndUpdate = async (query, changes) => {
    filter = query;
    update = changes;
    return { id: notificationId };
  };

  const response = makeResponse();
  await deleteNotification({ params: { notificationId }, userId: ownerId }, response);

  // Query must be scoped to ownerId and exclude already-deleted records
  assert.deepEqual(filter, { _id: notificationId, userId: ownerId, deletedAt: null });
  // Soft delete sets deletedAt to a Date (not a physical remove)
  assert.ok(update.$set.deletedAt instanceof Date);
  assert.equal(response.statusCode, 200);
});
```

---

## 3. `pagination.test.js`

**Location:** [`backend/test/pagination.test.js`](file:///d:/task-manager/backend/test/pagination.test.js)
**Tests:** 2 | **Requirement coverage:** FR-ACT-005, FR-NOTIF-001

```javascript
const assert = require('node:assert/strict');
const test   = require('node:test');
const { PAGE_SIZE, paginateNewest } = require('../utils/paginateNewest');

// ─── TC-PAGE-001 ──────────────────────────────────────────────────────────────
// Cursor pagination must reject strings that are not valid MongoDB ObjectIds,
// and must reject IDs that do not correspond to records in the queried scope.
test('newest-first pagination rejects malformed and out-of-scope cursors', async () => {
  const Model = {
    findOne() { return { select: async () => null }; }, // simulates no record found
  };

  // Not a valid ObjectId
  assert.equal((await paginateNewest(Model, { projectId: 'p' }, 'not-an-id')).error,
    'Invalid pagination cursor');
  // Valid ObjectId format, but record not found in the given scope
  assert.equal(
    (await paginateNewest(Model, { projectId: 'p' }, '507f1f77bcf86cd799439011')).error,
    'Invalid pagination cursor'
  );
  // Confirm default page size constant
  assert.equal(PAGE_SIZE, 20);
});

// ─── TC-PAGE-002 ──────────────────────────────────────────────────────────────
// Verifies the cursor-pagination algorithm:
//   1. Finds the cursor record by _id + scope
//   2. Builds a compound $or query using (createdAt, _id) for stable ordering
//   3. Fetches PAGE_SIZE + 1 records (lookahead) to detect if a next page exists
//   4. Returns PAGE_SIZE records and sets nextCursor to last item's _id
test('newest-first pagination uses a stable timestamp and ID cursor with a one-record lookahead', async () => {
  const cursorId     = '507f1f77bcf86cd799439011';
  const date         = new Date('2026-11-04T00:00:00.000Z');
  const cursorRecord = { _id: cursorId, createdAt: date };

  // Create PAGE_SIZE + 1 fake records (lookahead record)
  const records = Array.from({ length: PAGE_SIZE + 1 }, (_, index) => ({
    _id: { toString: () => `507f1f77bcf86cd7994390${String(index + 20).padStart(2, '0')}` },
  }));

  let cursorQuery, pageQuery, sortOptions, limitValue;

  const Model = {
    findOne(query) {
      cursorQuery = query;
      return { select: async () => cursorRecord };
    },
    find(query) {
      pageQuery = query;
      return {
        sort(value)        { sortOptions = value; return this; },
        async limit(value) { limitValue  = value; return records; },
      };
    },
  };

  const result = await paginateNewest(Model, { projectId: 'project' }, cursorId);

  // Cursor lookup must be scoped to the same filter + cursorId
  assert.deepEqual(cursorQuery, { projectId: 'project', _id: cursorId });
  // Compound $or ensures stable sort when multiple records share a createdAt timestamp
  assert.deepEqual(pageQuery.$or, [
    { createdAt: { $lt: date } },
    { createdAt: date, _id: { $lt: cursorId } },
  ]);
  // Must sort newest-first
  assert.deepEqual(sortOptions, { createdAt: -1, _id: -1 });
  // Lookahead: fetch one extra record to detect next page
  assert.equal(limitValue, PAGE_SIZE + 1);
  // Returns exactly PAGE_SIZE records (not the lookahead record)
  assert.equal(result.records.length, PAGE_SIZE);
  // nextCursor points to last record in this page
  assert.equal(result.nextCursor, result.records.at(-1)._id.toString());
});
```

---

## 4. `projectController.test.js`

**Location:** [`backend/test/projectController.test.js`](file:///d:/task-manager/backend/test/projectController.test.js)
**Tests:** 10 | **Requirement coverage:** FR-PROJ, FR-RBAC, FR-PTASK, FR-ACT, FR-XFER

```javascript
const assert = require('node:assert/strict');
const test   = require('node:test');
const Project             = require('../models/Project');
const ProjectTask         = require('../models/ProjectTask');
const ProjectTaskActivity = require('../models/ProjectTaskActivity');
const requireProjectAccess = require('../middleware/projectAccessMiddleware');
const { buildTaskChanges } = require('../services/projectTaskActivityService');
const { serializeChanges } = require('../controllers/projectActivityController');
const {
  canEditProjectTasks,
  canManageMembers,
  canAssignMemberRole,
  canMemberUpdateProjectTask,
  canManageMemberRole,
  getProjectRole,
  serializeProject,
  validateAssigneeMembership,
  validateProjectInput,
  validateProjectTaskInput,
} = require('../controllers/projectController');

const ownerId   = '507f1f77bcf86cd799439011';
const editorId  = '507f1f77bcf86cd799439012'; // legacy 'editor' → treated as 'member'
const viewerId  = '507f1f77bcf86cd799439013';
const projectId = '507f1f77bcf86cd799439014';
const adminId   = '507f1f77bcf86cd799439015';

function makeProject() {
  return {
    _id: projectId,
    ownerId,
    members: [
      { userId: adminId,  role: 'admin'  },
      { userId: editorId, role: 'editor' }, // legacy editor
      { userId: viewerId, role: 'viewer' },
    ],
  };
}

// ─── TC-PROJ-001 ──────────────────────────────────────────────────────────────
// Project input validation: trims whitespace, enforces length limits,
// and blocks client-supplied ownerId (server must set it).
test('validates project names and rejects client-controlled ownership fields', () => {
  assert.deepEqual(validateProjectInput({ name: '  Product launch  ' }), {
    values: { name: 'Product launch', description: '' },
  });
  assert.equal(
    validateProjectInput({ name: ' ' }).error,
    'Project name must be 1-100 characters and description 2000 characters or fewer'
  );
  assert.equal(
    validateProjectInput({ name: 'Valid', ownerId }).error,
    'Project contains unsupported fields'
  );
  assert.ok(validateProjectInput({ name: 'Valid', description: 'x'.repeat(2001) }).error);
});

// ─── TC-PROJ-002 ──────────────────────────────────────────────────────────────
// Project task input validation: status enum, forbidden fields, update-mode
// empty check, and invalid date parsing.
test('validates project task fields while allowing an optional deadline', () => {
  // Valid task title is trimmed
  assert.deepEqual(validateProjectTaskInput({ title: '  Plan release  ' }).values, {
    title: 'Plan release',
  });
  // Status must be one of the three valid values
  assert.equal(
    validateProjectTaskInput({ title: 'Valid', status: 'Blocked' }).error,
    'Status must be Pending, In Progress, or Completed'
  );
  // Client cannot supply projectId — it comes from the URL param
  assert.equal(
    validateProjectTaskInput({ title: 'Valid', projectId }).error,
    'Task contains unsupported fields'
  );
  // Update mode (second arg = true) requires at least one field
  assert.equal(
    validateProjectTaskInput({}, true).error,
    'Provide at least one task field to update'
  );
  // Invalid date string
  assert.equal(validateProjectTaskInput({ deadline: 'not-a-date' }, true).error, 'Deadline must be a valid date');
  // February 31 does not exist — must be rejected
  assert.equal(validateProjectTaskInput({ deadline: '2026-02-31' }, true).error, 'Deadline must be a valid date');
});

// ─── TC-PROJ-003 ──────────────────────────────────────────────────────────────
// Role resolution and all permission helpers cover every role including
// the legacy 'editor' (which maps to 'member' permissions).
test('resolves owner, admin, member, and viewer roles including legacy editors', () => {
  // Role resolution
  assert.equal(getProjectRole(makeProject(), ownerId),  'owner');
  assert.equal(getProjectRole(makeProject(), adminId),  'admin');
  assert.equal(getProjectRole(makeProject(), editorId), 'member'); // legacy editor → member
  assert.equal(getProjectRole(makeProject(), viewerId), 'viewer');
  assert.equal(getProjectRole(makeProject(), '507f1f77bcf86cd799439016'), null); // non-member

  // Role resolution works with populated userId objects too
  assert.equal(
    getProjectRole({
      ownerId: { _id: ownerId },
      members: [{ userId: { _id: editorId }, role: 'editor' }],
    }, editorId),
    'member'
  );

  // Member management permissions
  assert.equal(canManageMembers(makeProject(), ownerId),  true);
  assert.equal(canManageMembers(makeProject(), adminId),  true);
  assert.equal(canManageMembers(makeProject(), editorId), false); // member cannot manage

  // Role assignment: only owner can assign admin
  assert.equal(canAssignMemberRole('owner', 'admin'), true);
  assert.equal(canAssignMemberRole('admin', 'admin'), false); // admin cannot promote to admin
  assert.equal(canAssignMemberRole('admin', 'member'), true);

  // Role management: admin can manage member roles but not other admins
  assert.equal(canManageMemberRole('admin', 'member', 'viewer'), true);
  assert.equal(canManageMemberRole('admin', 'admin',  'member'), false); // cannot demote admin
  assert.equal(canManageMemberRole('owner', 'admin',  'member'), true);  // owner can demote admin

  // Task editing rights
  assert.equal(canEditProjectTasks(makeProject(), editorId), true);  // member can edit
  assert.equal(canEditProjectTasks(makeProject(), viewerId), false); // viewer cannot

  // Assignee validation: only active owner/admin/member roles are valid
  assert.equal(validateAssigneeMembership(makeProject(), [ownerId, adminId, editorId]), true);
  assert.equal(validateAssigneeMembership(makeProject(), [viewerId]), false); // viewer not eligible
  assert.equal(validateAssigneeMembership(makeProject(), ['507f1f77bcf86cd799439016']), false); // non-member

  // Task input with valid assigneeIds array
  assert.equal(
    validateProjectTaskInput({ title: 'Work', assigneeIds: [editorId, adminId] }).values.assigneeIds.length,
    2
  );
  // Duplicate assigneeIds must be rejected
  assert.ok(validateProjectTaskInput({ title: 'Work', assigneeIds: [editorId, editorId] }).error);
  // Invalid ObjectId in assigneeIds must be rejected
  assert.ok(validateProjectTaskInput({ title: 'Work', assigneeIds: ['invalid'] }).error);

  // Member can only update status of tasks they are assigned to
  assert.equal(
    canMemberUpdateProjectTask({ assigneeIds: [editorId] }, editorId, { status: 'Completed' }),
    true
  );
  // Not an assignee → cannot update
  assert.equal(
    canMemberUpdateProjectTask({ assigneeIds: [adminId] }, editorId, { status: 'Completed' }),
    false
  );
  // Even if assignee, member cannot change title
  assert.equal(
    canMemberUpdateProjectTask({ assigneeIds: [editorId] }, editorId, { title: 'Escalate' }),
    false
  );
  // Mixed update (status + title) → rejected (only status is allowed for members)
  assert.equal(
    canMemberUpdateProjectTask({ assigneeIds: [editorId] }, editorId, { status: 'Completed', title: 'Escalate' }),
    false
  );
});

// ─── TC-PROJ-004 ──────────────────────────────────────────────────────────────
// serializeProject must return progress:0 when no tasks exist and count owner
// as the first team member (memberCount includes owner).
test('serializes progress as zero for projects without tasks', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const result = serializeProject({
    id: projectId, name: 'Launch', description: '',
    ownerId, members: [], createdAt, updatedAt: createdAt,
  });
  assert.equal(result.progress, 0);
  assert.equal(result.memberCount, 1); // owner counts as 1
  assert.equal(result.owner.id, ownerId);
});

// ─── TC-PROJ-005 ──────────────────────────────────────────────────────────────
// ProjectTask schema: default assigneeIds is [] and the compound index
// (projectId, assigneeIds, status) exists for assignment query performance.
test('project tasks default to no assignees and index project assignment queries', () => {
  const task    = new ProjectTask({ title: 'Release notes', projectId, createdBy: ownerId });
  const indexes = ProjectTask.schema.indexes();

  assert.deepEqual(task.assigneeIds, []);
  assert.ok(indexes.some(([fields]) =>
    fields.projectId === 1 && fields.assigneeIds === 1 && fields.status === 1
  ));
});

// ─── TC-PROJ-006 ──────────────────────────────────────────────────────────────
// ProjectTaskActivity schema: stores type and changes, and has correct indexes
// for project history (newest-first) and unique task_created events.
test('project task activity stores immutable timeline entries and indexes project history', () => {
  const activity = new ProjectTaskActivity({
    projectId,
    taskId:    projectId,
    taskTitle: 'Release notes',
    actorId:   ownerId,
    type:      'task_updated',
    changes:   [{ field: 'status', from: 'Pending', to: 'Completed' }],
  });

  assert.equal(activity.type, 'task_updated');
  assert.equal(activity.changes[0].field, 'status');

  const indexes = ProjectTaskActivity.schema.indexes();
  // Index for newest-first cursor-paginated project history feed
  assert.ok(indexes.some(([fields]) =>
    fields.projectId === 1 && fields.createdAt === -1 && fields._id === -1
  ));
  // Unique partial index: each task may only have one task_created activity record
  assert.ok(indexes.some(([fields, options]) =>
    fields.taskId === 1 &&
    fields.type   === 1 &&
    options.unique === true &&
    options.partialFilterExpression.type === 'task_created'
  ));
});

// ─── TC-PROJ-007 ──────────────────────────────────────────────────────────────
// buildTaskChanges must return only the fields that differ between before and
// after snapshots — unchanged fields must be omitted.
test('activity change snapshots include only fields whose values changed', () => {
  const task    = { title: 'Release notes', status: 'Pending', deadline: null, assigneeIds: [ownerId] };
  const changes = buildTaskChanges(task, {
    title:       'Release notes',               // UNCHANGED — must NOT appear in delta
    status:      'Completed',                   // CHANGED
    deadline:    new Date('2026-11-08T00:00:00.000Z'), // CHANGED (was null)
    assigneeIds: [ownerId],                     // UNCHANGED — must NOT appear
  });

  assert.deepEqual(changes, [
    { field: 'status',   from: 'Pending', to: 'Completed' },
    { field: 'deadline', from: null,      to: '2026-11-08T00:00:00.000Z' },
  ]);
});

// ─── TC-PROJ-008 ──────────────────────────────────────────────────────────────
// serializeChanges must:
//   - Replace assigneeIds arrays with human-readable "N assignees" strings
//   - Redact description values to null (private content)
//   - Pass through other fields unchanged
test('activity responses summarize assignment changes without exposing user IDs or descriptions', () => {
  assert.deepEqual(serializeChanges([
    { field: 'assigneeIds', from: [ownerId, editorId], to: [ownerId] },
    { field: 'description', from: 'private old text',  to: 'private new text' },
    { field: 'status',      from: 'Pending',           to: 'Completed' },
  ]), [
    { field: 'assigneeIds', from: '2 assignees', to: '1 assignee' }, // IDs → counts
    { field: 'description', from: null,          to: null },          // redacted
    { field: 'status',      from: 'Pending',     to: 'Completed' },   // unchanged
  ]);
});

// ─── TC-PROJ-009 ──────────────────────────────────────────────────────────────
// projectAccessMiddleware: viewer gets HTTP 403, legacy editor (member) passes.
// Also verifies the MongoDB query filter structure.
test('project access middleware denies viewers task edits and allows members', async (t) => {
  const originalFindOne = Project.findOne;
  t.after(() => { Project.findOne = originalFindOne; });

  let queriedFilter;
  Project.findOne = (filter) => { queriedFilter = filter; return Promise.resolve(makeProject()); };

  const response = { statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body)   { this.body = body;       return this; },
  };
  let passedToNext = false;

  // Test 1: Viewer requesting a member-required route → must be blocked
  await requireProjectAccess('member')(
    { params: { projectId }, userId: viewerId },
    response,
    () => { passedToNext = true; }
  );

  assert.equal(response.statusCode, 403);
  assert.equal(passedToNext, false);  // next() must NOT have been called
  // Verify the middleware queries by _id AND checks both owner and member arrays
  assert.equal(queriedFilter._id, projectId);
  assert.deepEqual(queriedFilter.$or, [
    { ownerId:           viewerId },
    { 'members.userId': viewerId },
  ]);

  // Test 2: Editor (legacy member) on same route → must pass through
  let editorPassed = false;
  await requireProjectAccess('member')(
    { params: { projectId }, userId: editorId },
    { status() { return this; }, json() { return this; } },
    () => { editorPassed = true; }
  );
  assert.equal(editorPassed, true); // next() must have been called
});
```

---

## 5. `projectInvitationController.test.js`

**Location:** [`backend/test/projectInvitationController.test.js`](file:///d:/task-manager/backend/test/projectInvitationController.test.js)
**Tests:** 5 | **Requirement coverage:** FR-INV-001 to FR-INV-010

```javascript
const assert = require('node:assert/strict');
const test   = require('node:test');
const ProjectInvitation = require('../models/ProjectInvitation');
const {
  canManageInvitation,
  generateInvitationToken,
  hashInvitationToken,
  normalizeEmail,
  validateInvitationInput,
} = require('../controllers/projectInvitationController');

const ownerId  = '507f1f77bcf86cd799439011';
const adminId  = '507f1f77bcf86cd799439015';
const memberId = '507f1f77bcf86cd799439012';

function makeProject() {
  return {
    ownerId,
    members: [
      { userId: adminId,  role: 'admin'  },
      { userId: memberId, role: 'member' },
    ],
  };
}

// ─── TC-INV-001 ───────────────────────────────────────────────────────────────
// Invitation input: valid input is normalized; invalid emails/roles/extra fields
// are all rejected.
test('validates invitation email and role while rejecting unsupported fields', () => {
  // Valid input → email lowercased and trimmed
  assert.deepEqual(validateInvitationInput({ email: ' New.User@example.com ', role: 'member' }), {
    values: { email: 'new.user@example.com', role: 'member' },
  });
  // Invalid email format
  assert.equal(validateInvitationInput({ email: 'not-an-email', role: 'member' }).error !== undefined, true);
  // 'owner' is not a valid invitation role
  assert.equal(validateInvitationInput({ email: 'valid@example.com', role: 'owner' }).error !== undefined, true);
  // Client-supplied invitedBy is a forbidden field
  assert.equal(
    validateInvitationInput({ email: 'valid@example.com', role: 'member', invitedBy: 'client' }).error !== undefined,
    true
  );
});

// ─── TC-INV-002 ───────────────────────────────────────────────────────────────
// Token generation: tokens must be URL-safe, high-entropy, unique across calls,
// and the stored hash must be a 64-hex SHA-256 digest (not the raw token).
test('creates high-entropy URL-safe invitation tokens and stores only a deterministic hash', () => {
  const firstToken  = generateInvitationToken();
  const secondToken = generateInvitationToken();
  const firstHash   = hashInvitationToken(firstToken);

  assert.match(firstToken, /^[\w-]{40,50}$/);       // URL-safe, 40-50 chars
  assert.notEqual(firstToken, secondToken);           // unique per call
  assert.match(firstHash, /^[a-f\d]{64}$/);           // SHA-256 → 64 hex chars
  assert.equal(hashInvitationToken(firstToken), firstHash); // deterministic
  assert.notEqual(firstHash, firstToken);             // hash ≠ raw token
});

// ─── TC-INV-003 ───────────────────────────────────────────────────────────────
// Email normalization for invitation matching.
test('normalizes email addresses for membership and invitation matching', () => {
  assert.equal(normalizeEmail('  Person@Example.com '), 'person@example.com');
});

// ─── TC-INV-004 ───────────────────────────────────────────────────────────────
// Admin can manage member/viewer invitations but NOT admin invitations.
// Only the project owner can send admin invitations.
// Regular members cannot manage any invitations.
test('allows admins to manage regular invitations but reserves admin invitations to owners', () => {
  assert.equal(canManageInvitation(makeProject(), adminId,  { role: 'member' }), true);  // admin → member invite OK
  assert.equal(canManageInvitation(makeProject(), adminId,  { role: 'admin'  }), false); // admin → admin invite BLOCKED
  assert.equal(canManageInvitation(makeProject(), ownerId,  { role: 'admin'  }), true);  // owner → admin invite OK
  assert.equal(canManageInvitation(makeProject(), memberId, { role: 'member' }), false); // member cannot invite
});

// ─── TC-INV-005 ───────────────────────────────────────────────────────────────
// Schema-level: confirms the unique partial index (1 pending per email/project)
// and the unique tokenHash index are present.
test('enforces unique pending invitations and indexes invitation token hashes', () => {
  const indexes = ProjectInvitation.schema.indexes();

  // Partial unique index: prevents two pending invitations to the same email in a project
  assert.ok(indexes.some(([fields, options]) =>
    fields.projectId === 1 &&
    fields.email     === 1 &&
    options.unique   === true &&
    options.partialFilterExpression?.status === 'pending'
  ));
  // tokenHash must be globally unique (required for secure token lookup)
  assert.ok(indexes.some(([fields, options]) =>
    fields.tokenHash === 1 && options.unique === true
  ));
});
```

---

## 6. `taskCommentController.test.js`

**Location:** [`backend/test/taskCommentController.test.js`](file:///d:/task-manager/backend/test/taskCommentController.test.js)
**Tests:** 4 | **Requirement coverage:** FR-CMT-001 to FR-CMT-007

```javascript
const assert = require('node:assert/strict');
const test   = require('node:test');
const TaskComment = require('../models/TaskComment');
const {
  canPostProjectComment,
  validateCommentInput,
} = require('../controllers/taskCommentController');

// ─── TC-CMT-001 ───────────────────────────────────────────────────────────────
// Comment validation: trims body, enforces max 5000 chars, rejects blank and
// any extra fields like authorId (which must be set server-side only).
test('validates immutable comment content and rejects unsupported properties', () => {
  // Valid body — whitespace trimmed
  assert.deepEqual(validateCommentInput({ body: '  Looks good  ' }), { value: 'Looks good' });
  // Blank body after trim → error
  assert.ok(validateCommentInput({ body: ' ' }).error);
  // Exceeds 5000 character limit
  assert.ok(validateCommentInput({ body: 'x'.repeat(5001) }).error);
  // Client-supplied authorId is forbidden (set by server from req.userId)
  assert.ok(validateCommentInput({ body: 'Valid', authorId: '507f1f77bcf86cd799439011' }).error);
  // null input
  assert.ok(validateCommentInput(null).error);
});

// ─── TC-CMT-002 ───────────────────────────────────────────────────────────────
// Only Owner, Admin, and Member roles can post to a project task.
// Viewers can read comments but must NOT be allowed to post.
test('project Viewers can read comments but only Owners, Admins, and Members may post', () => {
  assert.equal(canPostProjectComment('owner'),  true);
  assert.equal(canPostProjectComment('admin'),  true);
  assert.equal(canPostProjectComment('member'), true);
  assert.equal(canPostProjectComment('viewer'), false); // read-only
  assert.equal(canPostProjectComment(null),     false); // non-member
});

// ─── TC-CMT-003 ───────────────────────────────────────────────────────────────
// Schema indexes: timeline index for public project comments,
// separate privacy index for personal task notes (by ownerId).
test('comment schema indexes task timelines and private notes separately', () => {
  const indexes = TaskComment.schema.indexes();
  // Index for public project task comment timelines
  assert.ok(indexes.some(([fields]) =>
    fields.taskType === 1 && fields.taskId === 1 && fields.createdAt === -1
  ));
  // Index for private personal task note retrieval (by transferred task + owner)
  assert.ok(indexes.some(([fields]) =>
    fields.transferredProjectTaskId === 1 && fields.ownerId === 1
  ));
});

// ─── TC-CMT-004 ───────────────────────────────────────────────────────────────
// Schema pre-validate hooks enforce scope: personal comments require ownerId,
// project comments require projectId. Neither can be omitted.
test('comment records enforce owner scoping for private comments and project scoping for shared comments', async () => {
  // Personal comment missing ownerId → validation error on ownerId field
  const personalComment = new TaskComment({
    taskType: 'personal',
    taskId:   '507f1f77bcf86cd799439011',
    authorId: '507f1f77bcf86cd799439012',
    body:     'Private',
    // ownerId is MISSING → should trigger validation error
  });
  // Project comment missing projectId → validation error on projectId field
  const projectComment = new TaskComment({
    taskType: 'project',
    taskId:   '507f1f77bcf86cd799439013',
    authorId: '507f1f77bcf86cd799439012',
    body:     'Shared',
    // projectId is MISSING → should trigger validation error
  });

  await assert.rejects(personalComment.validate(), (error) => Boolean(error.errors.ownerId));
  await assert.rejects(projectComment.validate(),  (error) => Boolean(error.errors.projectId));
});
```

---

## 7. `taskController.test.js`

**Location:** [`backend/test/taskController.test.js`](file:///d:/task-manager/backend/test/taskController.test.js)
**Tests:** 8 | **Requirement coverage:** FR-TASK, FR-DASH, FR-XFER

```javascript
const assert = require('node:assert/strict');
const test   = require('node:test');
const TaskTransferRequest = require('../models/TaskTransferRequest');
const {
  canAcceptTaskTransferRequest,
  calculateDashboardSummary,
  isTaskEligibleProjectRole,
} = require('../controllers/taskController');

const now = new Date('2026-10-30T12:00:00.000Z');

// Helper: creates a task with deadline offset by N days from `now`
function makeTask(title, status, daysFromNow, priority = 'Medium') {
  const deadline = new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000);
  return { id: title, title, description: '', priority, status, deadline, createdAt: now, updatedAt: now };
}

// ─── TC-TASK-001 ──────────────────────────────────────────────────────────────
// Full dashboard summary: counts, overdue logic, and upcoming tasks list.
test('calculates dashboard counts and progress for the assignment sample', () => {
  const tasks = [
    makeTask('DBMS Assignment', 'Pending',     1),   // upcoming
    makeTask('React Project',   'In Progress', 3),   // upcoming
    makeTask('Python Lab',      'Completed',  -1),   // completed (past deadline, NOT overdue)
    makeTask('CN Assignment',   'Pending',    -1),   // OVERDUE (past deadline, not completed)
    makeTask('ML Assignment',   'Completed',   1),   // completed
    makeTask('Documentation',   'Pending',     5),   // upcoming
    makeTask('Software Lab',    'Completed',  -2),   // completed
    makeTask('Testing',         'In Progress', 4),   // upcoming
  ];

  const result = calculateDashboardSummary(tasks, now);

  assert.deepEqual(result.summary, {
    totalTasks:      8,
    pendingTasks:    3,  // DBMS, CN, Docs
    completedTasks:  3,  // Python, ML, SWLab
    inProgressTasks: 2,  // React, Testing
    overdueTasks:    1,  // CN Assignment (past deadline, Pending)
    progress:        37.5, // 3/8 * 100
  });
  // Upcoming: tasks due within 7 days, sorted ascending by deadline (max 5)
  assert.deepEqual(
    result.upcomingTasks.map((task) => task.title),
    ['DBMS Assignment', 'React Project', 'Testing', 'Documentation']
  );
});

// ─── TC-TASK-002 ──────────────────────────────────────────────────────────────
// Edge case: deadline exactly equal to `now` → upcoming, NOT overdue.
// Overdue is strictly "past" deadline, not "at" deadline.
test('includes a deadline exactly now as upcoming, but not overdue', () => {
  const result = calculateDashboardSummary([makeTask('Due now', 'Pending', 0)], now);

  assert.equal(result.summary.overdueTasks, 0); // not overdue at exact deadline
  assert.equal(result.upcomingTasks.length, 1); // is in the upcoming list
});

// ─── TC-TASK-003 ──────────────────────────────────────────────────────────────
// Completed tasks are NEVER overdue regardless of their deadline date.
test('does not count completed tasks with past deadlines as overdue', () => {
  const result = calculateDashboardSummary([makeTask('Finished late', 'Completed', -1)], now);

  assert.equal(result.summary.overdueTasks, 0); // completed → not overdue
  assert.equal(result.upcomingTasks.length, 0); // past deadline → not upcoming
});

// ─── TC-TASK-004 ──────────────────────────────────────────────────────────────
// Empty task list → 0% progress; all-completed → 100% progress.
test('returns zero progress for no tasks and full progress when all are complete', () => {
  assert.equal(calculateDashboardSummary([], now).summary.progress, 0);
  assert.equal(
    calculateDashboardSummary([
      makeTask('First',  'Completed', -1),
      makeTask('Second', 'Completed',  2),
    ], now).summary.progress,
    100
  );
});

// ─── TC-TASK-005 ──────────────────────────────────────────────────────────────
// Upcoming tasks: include deadlines ≤ 7 days from now, cap result at 5.
test('includes deadlines through seven days and returns no more than five', () => {
  const tasks = [
    makeTask('In seven days', 'Pending', 7), // included (boundary: exactly 7 days)
    makeTask('In eight days', 'Pending', 8), // excluded (beyond 7-day window)
    ...Array.from({ length: 5 }, (_, index) => makeTask(`Soon ${index}`, 'Pending', index + 1)),
  ];

  const { upcomingTasks } = calculateDashboardSummary(tasks, now);

  assert.equal(upcomingTasks.length, 5);     // cap at 5
  assert.equal(upcomingTasks[0].title, 'Soon 0'); // sorted by soonest deadline
  assert.ok(upcomingTasks.every((task) => task.title !== 'In eight days')); // day-8 excluded
});

// ─── TC-TASK-006 ──────────────────────────────────────────────────────────────
// Only owner, admin, and member roles can initiate task transfers into projects.
// Viewers and null/undefined roles are blocked.
test('only project owners, admins, and members can transfer personal tasks into a project', () => {
  assert.equal(isTaskEligibleProjectRole('owner'),  true);
  assert.equal(isTaskEligibleProjectRole('admin'),  true);
  assert.equal(isTaskEligibleProjectRole('member'), true);
  assert.equal(isTaskEligibleProjectRole('viewer'), false); // viewers cannot transfer
  assert.equal(isTaskEligibleProjectRole(null),     false); // non-members cannot transfer
});

// ─── TC-TASK-007 ──────────────────────────────────────────────────────────────
// canAcceptTaskTransferRequest: all 4 guard conditions tested individually.
test('only the requested project member can approve an unexpired task transfer request', () => {
  const request = {
    taskOwnerId: '507f1f77bcf86cd799439011',
    projectId:   '507f1f77bcf86cd799439014',
    status:      'pending',
    expiresAt:   new Date('2026-11-10T00:00:00.000Z'),
  };
  const checkNow = new Date('2026-11-04T00:00:00.000Z');

  // All conditions met → true
  assert.equal(canAcceptTaskTransferRequest(request, request.taskOwnerId, request.projectId, checkNow), true);
  // Wrong user → false
  assert.equal(canAcceptTaskTransferRequest(request, '507f1f77bcf86cd799439012', request.projectId, checkNow), false);
  // Wrong project → false
  assert.equal(canAcceptTaskTransferRequest(request, request.taskOwnerId, '507f1f77bcf86cd799439015', checkNow), false);
  // Non-pending status → false
  assert.equal(canAcceptTaskTransferRequest({ ...request, status: 'cancelled' }, request.taskOwnerId, request.projectId, checkNow), false);
  // Expired (expiresAt === now) → false (strict less-than comparison)
  assert.equal(canAcceptTaskTransferRequest({ ...request, expiresAt: checkNow }, request.taskOwnerId, request.projectId, checkNow), false);
});

// ─── TC-TASK-008 ──────────────────────────────────────────────────────────────
// The TaskTransferRequest schema must NOT store title or description from the
// personal task — private content must not transfer to the project context.
test('task transfer requests do not store or expose private task contents', () => {
  assert.equal(TaskTransferRequest.schema.path('title'),       undefined); // no title field
  assert.equal(TaskTransferRequest.schema.path('description'), undefined); // no description field
  assert.ok(TaskTransferRequest.schema.path('taskOwnerId'));   // owner reference present
  assert.ok(TaskTransferRequest.schema.path('projectId'));     // project reference present
});
```

---

## 8. `api.integration.test.js`

**Location:** [`backend/test/api.integration.test.js`](file:///d:/task-manager/backend/test/api.integration.test.js)
**Tests:** 5 integration groups | **Requirement coverage:** FR-AUTH, FR-TASK, FR-PROJ, FR-RBAC, FR-NOTIF, FR-CAL, NFR-SEC

> This file starts a **real HTTP server** using `http.createServer(app)`, makes genuine `fetch()` requests, and exercises the actual Express routes, controllers, auth middleware, validators, and error handlers — but replaces Mongoose model operations with **in-memory JavaScript stubs** so no database connection is required.

```javascript
const assert   = require('node:assert/strict');
const bcrypt   = require('bcryptjs');
const http     = require('node:http');
const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');
const test     = require('node:test');
const app      = require('../app');
const Notification       = require('../models/Notification');
const Project            = require('../models/Project');
const ProjectInvitation  = require('../models/ProjectInvitation');
const ProjectTask        = require('../models/ProjectTask');
const Task               = require('../models/Task');
const TaskComment        = require('../models/TaskComment');
const User               = require('../models/User');

// ─────────────────────────────────────────────────────────────────────────────
// FIXED TEST IDs — deterministic MongoDB ObjectId strings used throughout
// ─────────────────────────────────────────────────────────────────────────────
const JWT_SECRET = 'week-seven-integration-test-secret-0123456789';
const ids = {
  owner:             '507f1f77bcf86cd799439011',
  member:            '507f1f77bcf86cd799439012',
  viewer:            '507f1f77bcf86cd799439013',
  other:             '507f1f77bcf86cd799439014',
  project:           '507f1f77bcf86cd799439015',
  privateProject:    '507f1f77bcf86cd799439016',
  notification:      '507f1f77bcf86cd799439017',
  otherNotification: '507f1f77bcf86cd799439018',
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: create a fake Task object matching the Task model shape
// ─────────────────────────────────────────────────────────────────────────────
function makeTask(input) {
  const now = new Date();
  return {
    _id:         input._id ?? new mongoose.Types.ObjectId(),
    get id()     { return this._id.toString(); },
    title:       input.title,
    description: input.description ?? '',
    priority:    input.priority ?? 'Medium',
    status:      input.status   ?? 'Pending',
    deadline:    input.deadline instanceof Date ? input.deadline : new Date(input.deadline),
    createdAt:   input.createdAt ?? now,
    updatedAt:   input.updatedAt ?? now,
    userId:      input.userId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: creates a chainable Mongoose query stub resolving to `result`
// ─────────────────────────────────────────────────────────────────────────────
function makeQuery(resolve) {
  const query = {
    sort()     { return this; },
    select()   { return this; },
    populate() { return this; },
    lean()     { return this; },
    limit()    { return this; },
    session()  { return this; },
    then(onFulfilled, onRejected) {
      return Promise.resolve().then(resolve).then(onFulfilled, onRejected);
    },
  };
  return query;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN INTEGRATION TEST SUITE — a single outer test wraps all 5 groups so
// the HTTP server and model stubs share state across the sequential sub-tests.
// ─────────────────────────────────────────────────────────────────────────────
test('authenticated API workflows, access control, and input validation', async (t) => {
  // ── Environment & Server Setup ────────────────────────────────────────────
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = JWT_SECRET;
  const server = http.createServer(app);

  // In-memory data stores (replace MongoDB collections)
  const users         = [];
  const tasks         = [];
  const comments      = [];
  const createdProjects = [];
  const notifications = [];

  // ── Pre-defined project fixtures ─────────────────────────────────────────
  const ownerProject = {
    _id: new mongoose.Types.ObjectId(ids.project),
    id:  ids.project,
    name: 'Shared project', description: '',
    ownerId: { _id: new mongoose.Types.ObjectId(ids.owner), id: ids.owner, name: 'Owner', email: 'owner@example.test' },
    members: [
      { userId: { _id: new mongoose.Types.ObjectId(ids.member), id: ids.member, name: 'Member', email: 'member@example.test' }, role: 'member', joinedAt: new Date() },
      { userId: { _id: new mongoose.Types.ObjectId(ids.viewer), id: ids.viewer, name: 'Viewer', email: 'viewer@example.test' }, role: 'viewer', joinedAt: new Date() },
    ],
    createdAt: new Date(), updatedAt: new Date(),
  };
  ownerProject.populate = async () => ownerProject;

  const privateProject = {
    ...ownerProject,
    _id: new mongoose.Types.ObjectId(ids.privateProject), id: ids.privateProject,
    name: 'Private project',
    ownerId: { ...ownerProject.ownerId, _id: new mongoose.Types.ObjectId(ids.other), id: ids.other },
    members: [],
  };
  privateProject.populate = async () => privateProject;

  users.push({ _id: new mongoose.Types.ObjectId(ids.other), id: ids.other,
    name: 'Existing Colleague', email: 'colleague@example.test', password: 'not-used-in-this-test' });

  // ── Mongoose Model Stubs ──────────────────────────────────────────────────
  // Save originals for teardown
  const originals = {
    userFindOne: User.findOne,          userFindById: User.findById,          userCreate: User.create,
    taskFind: Task.find,               taskFindOne: Task.findOne,             taskCreate: Task.create,
    taskFindOneAndUpdate: Task.findOneAndUpdate, taskDeleteOne: Task.deleteOne,
    taskCommentFind: TaskComment.find,  taskCommentCreate: TaskComment.create,
    taskCommentPopulate: TaskComment.populate,   taskCommentDeleteMany: TaskComment.deleteMany,
    projectFind: Project.find,         projectFindOne: Project.findOne,       projectCreate: Project.create,
    projectFindOneAndUpdate: Project.findOneAndUpdate,
    projectInvitationFindOne: ProjectInvitation.findOne,
    projectInvitationUpdateMany: ProjectInvitation.updateMany,
    projectTaskFind: ProjectTask.find, projectTaskAggregate: ProjectTask.aggregate,
    notificationFind: Notification.find,
    notificationCountDocuments: Notification.countDocuments,
    notificationFindOneAndUpdate: Notification.findOneAndUpdate,
    notificationExists: Notification.exists,
    notificationUpdateMany: Notification.updateMany,
    startSession: mongoose.startSession,
  };

  // User stubs
  User.findOne = (filter) => makeQuery(() => users.find((u) => u.email === filter.email) ?? null);
  User.findById = async (id) => users.find((u) => u.id === id.toString()) ?? null;
  User.create   = async (input) => { const user = { id: new mongoose.Types.ObjectId().toString(), ...input }; users.push(user); return user; };

  // Task stubs
  Task.find = (filter) => makeQuery(() => tasks.filter((task) => (
    (!filter.userId  || task.userId === filter.userId.toString()) &&
    (!filter._id     || task.id    === filter._id.toString()) &&
    (!filter.projectId || filter.projectId.$in?.some((pid) => pid.toString() === task.projectId))
  )));
  Task.findOne = (filter) => makeQuery(() => tasks.find((task) =>
    task.id === filter._id.toString() && task.userId === filter.userId.toString()
  ) ?? null);
  Task.create = async (input) => { const task = makeTask(input); tasks.push(task); return task; };
  Task.findOneAndUpdate = (filter, update) => makeQuery(() => {
    const task = tasks.find((item) => item.id === filter._id.toString() && item.userId === filter.userId.toString());
    if (!task) return null;
    if (update.$inc) {
      for (const [field, amount] of Object.entries(update.$inc)) task[field] = (task[field] ?? 0) + amount;
    } else { Object.assign(task, update); }
    task.updatedAt = new Date();
    return task;
  });
  Task.deleteOne = async (filter) => {
    const index = tasks.findIndex((task) => task.id === filter._id.toString() && task.userId === filter.userId.toString());
    if (index >= 0) tasks.splice(index, 1);
    return { deletedCount: index >= 0 ? 1 : 0 };
  };

  // TaskComment stubs
  TaskComment.create = async (documents) => documents.map((document) => {
    const comment = {
      _id: new mongoose.Types.ObjectId(), ...document, createdAt: new Date(),
      get id() { return this._id.toString(); },
      async populate() {
        const author = users.find((u) => u.id === this.authorId.toString());
        if (author) this.authorId = { _id: new mongoose.Types.ObjectId(author.id), id: author.id, name: author.name };
        return this;
      },
    };
    comments.push(comment);
    return comment;
  });
  TaskComment.find = (filter) => makeQuery(() => comments.filter((c) =>
    c.taskId.toString() === filter.taskId.toString() &&
    c.taskType === filter.taskType &&
    c.ownerId?.toString() === filter.ownerId?.toString()
  ));
  TaskComment.populate = async (records) => {
    for (const comment of records) {
      const author = users.find((u) => u.id === comment.authorId.toString());
      if (author) comment.authorId = { _id: new mongoose.Types.ObjectId(author.id), id: author.id, name: author.name };
    }
    return records;
  };
  TaskComment.deleteMany = async (filter) => {
    const before = comments.length;
    for (let i = comments.length - 1; i >= 0; i -= 1) {
      const c = comments[i];
      if (c.taskId.toString() === filter.taskId.toString() && c.taskType === filter.taskType &&
          c.ownerId?.toString() === filter.ownerId?.toString()) comments.splice(i, 1);
    }
    return { deletedCount: before - comments.length };
  };

  // Project stubs
  Project.find = (filter) => makeQuery(() => {
    const userId = filter.$or[0].ownerId.toString();
    return [ownerProject, privateProject, ...createdProjects].filter((p) =>
      p.ownerId.id === userId || p.members.some((m) => m.userId.id === userId)
    );
  });
  Project.findOne = (filter) => makeQuery(() => {
    const project = [ownerProject, privateProject, ...createdProjects].find((p) => p.id === filter._id);
    if (!project) return null;
    const userId = filter.$or?.[0]?.ownerId?.toString();
    if (!userId) return project;
    return project.ownerId.id === userId || project.members.some((m) => m.userId.id === userId) ? project : null;
  });
  Project.create = async (input) => {
    const owner = users.find((u) => u.id === input.ownerId.toString());
    const pid   = new mongoose.Types.ObjectId();
    const project = {
      _id: pid, id: pid.toString(), name: input.name, description: input.description,
      ownerId: { _id: new mongoose.Types.ObjectId(owner.id), id: owner.id, name: owner.name, email: owner.email },
      members: [], createdAt: new Date(), updatedAt: new Date(),
      async populate() { return this; },
    };
    createdProjects.push(project);
    return project;
  };
  Project.findOneAndUpdate = (filter, update) => makeQuery(() => {
    const project = [ownerProject, privateProject, ...createdProjects].find((p) => p.id === filter._id.toString());
    if (!project) return null;
    const newMember = update.$push?.members;
    if (newMember) {
      const user = users.find((u) => u.id === newMember.userId.toString());
      if (!user || project.members.some((m) => m.userId.id === user.id)) return null;
      project.members.push({ userId: { _id: new mongoose.Types.ObjectId(user.id), id: user.id, name: user.name, email: user.email }, role: newMember.role, joinedAt: new Date() });
    }
    return project;
  });

  // Invitation stubs
  ProjectInvitation.findOne   = async () => null;
  ProjectInvitation.updateMany = async () => ({ modifiedCount: 0 });
  ProjectTask.find      = (filter) => makeQuery(() => filter.projectId?.$in ? [] : []);
  ProjectTask.aggregate = async () => [];

  // Notification stubs
  Notification.find = (filter) => makeQuery(() => notifications.filter((n) =>
    n.userId === filter.userId.toString() && n.deletedAt === null &&
    (!filter._id || n._id.toString() === filter._id.toString())
  ));
  Notification.countDocuments = async (filter) => notifications.filter((n) =>
    n.userId === filter.userId.toString() && n.deletedAt === null && n.readAt === null
  ).length;
  Notification.findOneAndUpdate = async (filter, update) => {
    const n = notifications.find((item) =>
      item._id.toString() === filter._id.toString() && item.userId === filter.userId.toString() &&
      item.deletedAt === null && (!Object.hasOwn(filter, 'readAt') || item.readAt === null)
    );
    if (n && update.$set) Object.assign(n, update.$set);
    return n ?? null;
  };
  Notification.exists = async (filter) => notifications.some((n) =>
    n._id.toString() === filter._id.toString() && n.userId === filter.userId.toString() && n.deletedAt === null
  );
  Notification.updateMany = async (filter, update) => {
    let modifiedCount = 0;
    for (const n of notifications) {
      if (n.userId === filter.userId.toString() && n.readAt === null) {
        Object.assign(n, update.$set);
        modifiedCount += 1;
      }
    }
    return { modifiedCount };
  };
  // Transaction stub (no-op for in-memory testing)
  mongoose.startSession = async () => ({
    withTransaction: async (op) => op(),
    endSession:      async ()   => {},
  });

  // ── Teardown ──────────────────────────────────────────────────────────────
  t.after(async () => {
    // Restore all original Mongoose methods
    User.findOne = originals.userFindOne;        User.findById = originals.userFindById;        User.create = originals.userCreate;
    Task.find = originals.taskFind;              Task.findOne = originals.taskFindOne;           Task.create = originals.taskCreate;
    Task.findOneAndUpdate = originals.taskFindOneAndUpdate; Task.deleteOne = originals.taskDeleteOne;
    TaskComment.find = originals.taskCommentFind; TaskComment.create = originals.taskCommentCreate;
    TaskComment.populate = originals.taskCommentPopulate; TaskComment.deleteMany = originals.taskCommentDeleteMany;
    Project.find = originals.projectFind;        Project.findOne = originals.projectFindOne;    Project.create = originals.projectCreate;
    Project.findOneAndUpdate = originals.projectFindOneAndUpdate;
    ProjectInvitation.findOne = originals.projectInvitationFindOne;
    ProjectInvitation.updateMany = originals.projectInvitationUpdateMany;
    ProjectTask.find = originals.projectTaskFind; ProjectTask.aggregate = originals.projectTaskAggregate;
    Notification.find = originals.notificationFind;
    Notification.countDocuments = originals.notificationCountDocuments;
    Notification.findOneAndUpdate = originals.notificationFindOneAndUpdate;
    Notification.exists = originals.notificationExists;
    Notification.updateMany = originals.notificationUpdateMany;
    mongoose.startSession = originals.startSession;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  });

  // Start server on a random available port
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl  = `http://127.0.0.1:${port}`;

  // ── HTTP request helper ───────────────────────────────────────────────────
  const request = async (method, path, { token, body, rawBody } = {}) => {
    const headers = {};
    if (token)                            headers.authorization    = `Bearer ${token}`;
    if (body !== undefined || rawBody !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${baseUrl}${path}`, {
      method, headers,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    return { response, body: await response.json() };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TC-INT-001 — Authentication lifecycle
  // ═══════════════════════════════════════════════════════════════════════════
  await t.test('authentication validates, hashes, issues and verifies JWTs; rejects expired and missing credentials', async () => {
    // Step 1: Unauthenticated request must return 401
    const missingAuth = await request('GET', '/api/tasks');
    assert.equal(missingAuth.response.status, 401);
    assert.equal(missingAuth.body.message, 'Authentication required');

    // Step 2: Invalid email format must be rejected
    const invalidEmail = await request('POST', '/api/auth/register', {
      body: { name: 'Person', email: 'bad-email', password: 'valid-password' },
    });
    assert.equal(invalidEmail.response.status, 400);

    // Step 3: Valid registration — email normalized to lowercase
    const registered = await request('POST', '/api/auth/register', {
      body: { name: ' Test User ', email: 'TEST@EXAMPLE.TEST', password: 'valid-password' },
    });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.user.email, 'test@example.test'); // normalized

    // Step 4: Response cookie must be HttpOnly
    assert.ok(registered.response.headers.get('set-cookie').includes('HttpOnly'));

    // Step 5: Stored password must be bcrypt hash, not plaintext
    const user = users.find((u) => u.email === 'test@example.test');
    assert.notEqual(user.password, 'valid-password');
    assert.equal(await bcrypt.compare('valid-password', user.password), true);

    // Step 6: JWT in cookie must be valid and encode the user's _id as sub
    const cookieToken = registered.response.headers.get('set-cookie').match(/token=([^;]+)/)?.[1];
    assert.ok(cookieToken);
    assert.equal(jwt.verify(cookieToken, JWT_SECRET).sub, user.id);

    // Step 7: Valid token allows access to protected route
    assert.equal((await request('GET', '/api/auth/me', { token: cookieToken })).response.status, 200);

    // Step 8: Login succeeds case-insensitively
    const login = await request('POST', '/api/auth/login', {
      body: { email: 'TEST@EXAMPLE.TEST', password: 'valid-password' },
    });
    assert.equal(login.response.status, 200);
    assert.equal(login.body.user.id, user.id);

    // Step 9: Wrong password must return 401
    assert.equal((await request('POST', '/api/auth/login', {
      body: { email: user.email, password: 'incorrect-password' },
    })).response.status, 401);

    // Step 10: Expired token must return 401 with standard message
    const expiredToken = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: -1 });
    const expired = await request('GET', '/api/auth/me', { token: expiredToken });
    assert.equal(expired.response.status, 401);
    assert.equal(expired.body.message, 'Invalid or expired token');

    // Step 11: Duplicate email registration must return 409
    const duplicate = await request('POST', '/api/auth/register', {
      body: { name: 'Test User', email: user.email, password: 'valid-password' },
    });
    assert.equal(duplicate.response.status, 409);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC-INT-002 — Personal Task CRUD, ownership, comments, and error sanitization
  // ═══════════════════════════════════════════════════════════════════════════
  await t.test('personal task APIs enforce validation, ownership, CRUD, and safe errors', async () => {
    const userId = users.find((u) => u.email === 'test@example.test').id;
    const token  = jwt.sign({ sub: userId }, JWT_SECRET);

    // Step 1: Blank title must be rejected
    const emptyTitle = await request('POST', '/api/tasks', { token, body: { title: '   ', deadline: '2026-11-10' } });
    assert.equal(emptyTitle.response.status, 400);

    // Step 2: Invalid date must be rejected
    const invalidDate = await request('POST', '/api/tasks', { token, body: { title: 'Invalid date', deadline: '2026-02-31' } });
    assert.equal(invalidDate.response.status, 400);

    // Step 3: Valid task creation
    const created = await request('POST', '/api/tasks', { token, body: { title: 'Week 7 API test', deadline: '2026-11-10', priority: 'High' } });
    assert.equal(created.response.status, 201);
    const taskId = created.body.task.id;
    assert.equal(created.body.task.priority, 'High');

    // Step 4: List tasks
    assert.equal((await request('GET', '/api/tasks', { token })).body.tasks.length, 1);

    // Step 5: Get single task
    assert.equal((await request('GET', `/api/tasks/${taskId}`, { token })).body.task.title, 'Week 7 API test');

    // Step 6: Update task status
    const updated = await request('PUT', `/api/tasks/${taskId}`, { token, body: { status: 'Completed' } });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.task.status, 'Completed');

    // Step 7: Comment with forbidden authorId field must be rejected
    const invalidComment = await request('POST', `/api/tasks/${taskId}/comments`, {
      token, body: { body: 'Valid text', authorId: ids.other },
    });
    assert.equal(invalidComment.response.status, 400);

    // Step 8: Valid comment creation — body trimmed, author populated from JWT
    const commentCreated = await request('POST', `/api/tasks/${taskId}/comments`, {
      token, body: { body: '  Private task note  ' },
    });
    assert.equal(commentCreated.response.status, 201);
    assert.equal(commentCreated.body.comment.body, 'Private task note'); // trimmed
    assert.equal(commentCreated.body.comment.author.name, 'Test User');  // from JWT

    // Step 9: List comments
    const commentList = await request('GET', `/api/tasks/${taskId}/comments`, { token });
    assert.equal(commentList.response.status, 200);
    assert.equal(commentList.body.comments.length, 1);
    assert.equal(commentList.body.comments[0].body, 'Private task note');

    // Step 10: Cross-user access must return 404 (not 403) to prevent task existence leak
    const anotherUserToken = jwt.sign({ sub: ids.other }, JWT_SECRET);
    const privateTask = await request('GET', `/api/tasks/${taskId}`, { token: anotherUserToken });
    assert.equal(privateTask.response.status, 404);

    // Step 11: Malformed task ID must return 400
    assert.equal((await request('PUT', '/api/tasks/not-an-id', { token, body: { status: 'Pending' } })).response.status, 400);

    // Step 12: Delete task
    assert.equal((await request('DELETE', `/api/tasks/${taskId}`, { token })).response.status, 200);

    // Step 13: Deleted task returns 404
    assert.equal((await request('GET', `/api/tasks/${taskId}`, { token })).response.status, 404);

    // Step 14: Internal server errors must be sanitized — no DB details leaked
    const savedFind = Task.find;
    Task.find = () => { throw new Error('private database connection detail'); };
    const previousError = console.error;
    console.error = () => {};
    try {
      const failed = await request('GET', '/api/tasks', { token });
      assert.equal(failed.response.status, 500);
      assert.deepEqual(failed.body, { message: 'Internal server error' }); // generic message only
      assert.equal(JSON.stringify(failed.body).includes('private database'), false); // no DB details
    } finally {
      Task.find    = savedFind;
      console.error = previousError;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC-INT-003 — Project RBAC, private project isolation, member/viewer restrictions
  // ═══════════════════════════════════════════════════════════════════════════
  await t.test('project routes hide private projects and block member/viewer management actions', async () => {
    const registeredUserId    = users.find((u) => u.email === 'test@example.test').id;
    const registeredUserToken = jwt.sign({ sub: registeredUserId }, JWT_SECRET);

    // Step 1: Client-supplied ownerId must be rejected
    const unsupportedField = await request('POST', '/api/projects', {
      token: registeredUserToken, body: { name: 'Owned Project', ownerId: ids.other },
    });
    assert.equal(unsupportedField.response.status, 400);

    // Step 2: Valid project creation — name trimmed, owner from JWT
    const createdProject = await request('POST', '/api/projects', {
      token: registeredUserToken, body: { name: '  API-owned project  ', description: 'Created through the API' },
    });
    assert.equal(createdProject.response.status, 201);
    assert.equal(createdProject.body.project.name, 'API-owned project'); // trimmed
    assert.equal(createdProject.body.project.owner.id, registeredUserId); // owner from JWT

    // Step 3: Project list includes newly created project
    const projectList = await request('GET', '/api/projects', { token: registeredUserToken });
    assert.equal(projectList.response.status, 200);
    assert.equal(projectList.body.projects.some((p) => p.id === createdProject.body.project.id), true);

    const memberToken = jwt.sign({ sub: ids.member }, JWT_SECRET);

    // Step 4: Member can view their project
    const permittedRequest = await request('GET', `/api/projects/${ids.project}`, { token: memberToken });
    assert.equal(permittedRequest.response.status, 200);

    // Step 5: Private project (not a member) returns 404 not 403 to prevent existence leak
    const hiddenProject = await request('GET', `/api/projects/${ids.privateProject}`, { token: memberToken });
    assert.equal(hiddenProject.response.status, 404);

    // Step 6: Member cannot manage project members (admin-only action)
    const forbiddenManagement = await request('POST', `/api/projects/${ids.project}/members`, {
      token: memberToken, body: { email: 'new@example.test', role: 'member' },
    });
    assert.equal(forbiddenManagement.response.status, 403);

    const ownerToken = jwt.sign({ sub: ids.owner }, JWT_SECRET);

    // Step 7: Owner can add an existing member
    const addMember = await request('POST', `/api/projects/${ids.project}/members`, {
      token: ownerToken, body: { email: 'colleague@example.test', role: 'member' },
    });
    assert.equal(addMember.response.status, 201);
    assert.equal(addMember.body.project.members.some((m) => m.email === 'colleague@example.test'), true);

    const viewerToken = jwt.sign({ sub: ids.viewer }, JWT_SECRET);

    // Step 8: Viewer cannot create project tasks
    const forbiddenTaskWrite = await request('POST', `/api/projects/${ids.project}/tasks`, {
      token: viewerToken, body: { title: 'Viewer cannot create this task' },
    });
    assert.equal(forbiddenTaskWrite.response.status, 403);

    // Step 9: Viewer cannot post task comments
    const forbiddenComment = await request('POST', `/api/projects/${ids.project}/tasks/${ids.notification}/comments`, {
      token: viewerToken, body: { body: 'Viewer cannot post' },
    });
    assert.equal(forbiddenComment.response.status, 403);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC-INT-004 — Calendar, Notifications, Security Headers, Payload Limits
  // ═══════════════════════════════════════════════════════════════════════════
  await t.test('calendar and notification APIs remain authenticated and scope data to the caller', async () => {
    const userId = users[0].id;
    const token  = jwt.sign({ sub: userId }, JWT_SECRET);

    // Add a task with a deadline to the in-memory tasks store
    tasks.push(makeTask({
      title:    'Calendar personal task',
      deadline: new Date('2026-11-12T12:00:00.000Z'),
      userId,
    }));

    // Step 1: Calendar returns personal tasks scoped to req.userId
    const calendar = await request('GET', '/api/tasks/calendar', { token });
    assert.equal(calendar.response.status, 200);
    assert.equal(calendar.body.tasks.length, 1);
    assert.equal(calendar.body.tasks[0].source, 'personal'); // correctly tagged

    // Add a mock notification to the store
    notifications.push({
      _id: new mongoose.Types.ObjectId(ids.notification), id: ids.notification,
      userId, type: 'task_due', title: 'Due now', message: 'Task deadline reached',
      taskId: new mongoose.Types.ObjectId(ids.notification), taskType: 'project',
      projectId: new mongoose.Types.ObjectId(ids.project),
      dueAt: new Date('2026-11-05T00:00:00.000Z'),
      readAt: null, deletedAt: null, createdAt: new Date(),
    });

    // Step 2: Notification list includes unread count
    const notifPage = await request('GET', '/api/notifications', { token });
    assert.equal(notifPage.response.status, 200);
    assert.equal(notifPage.body.unreadCount, 1);

    // Step 3: Cross-user mark-read must return 404 (notification belongs to different user)
    const foreignRead = await request('PATCH', `/api/notifications/${ids.otherNotification}/read`, { token });
    assert.equal(foreignRead.response.status, 404);

    // Step 4: Mark own notification as read
    const read = await request('PATCH', `/api/notifications/${ids.notification}/read`, { token });
    assert.equal(read.response.status, 200);
    assert.equal(read.body.notification.isRead, true);

    // Step 5: Delete own notification (soft-delete)
    const removed = await request('DELETE', `/api/notifications/${ids.notification}`, { token });
    assert.equal(removed.response.status, 200);

    // Step 6: Oversized JSON (> 50 KB) must be rejected with 413
    const oversizedJson = await request('POST', '/api/auth/login', {
      rawBody: JSON.stringify({ data: 'a'.repeat(51 * 1024) }),
    });
    assert.equal(oversizedJson.response.status, 413);
    assert.deepEqual(oversizedJson.body, { message: 'Request body is too large' }); // safe message

    // Step 7: Malformed JSON must return 400 with safe message
    const malformedJson = await request('POST', '/api/auth/login', { rawBody: '{"email":' });
    assert.equal(malformedJson.response.status, 400);
    assert.deepEqual(malformedJson.body, { message: 'Invalid JSON request body' }); // safe message

    // Step 8: Helmet security headers verified
    const health = await request('GET', '/api/health');
    assert.equal(health.response.status, 200);
    assert.equal(health.response.headers.get('x-powered-by'), null);            // suppressed by Helmet
    assert.equal(health.response.headers.get('x-content-type-options'), 'nosniff'); // set by Helmet
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC-INT-005 — Rate limiting: 10 login attempts per 15 min per IP
  // ═══════════════════════════════════════════════════════════════════════════
  await t.test('authentication routes throttle repeated login attempts', async () => {
    const responses = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const result = await request('POST', '/api/auth/login', {
        body: { email: 'nobody@example.test', password: 'incorrect-password' },
      });
      responses.push(result.response.status);
    }
    // First 5 attempts fail with 401 (wrong credentials)
    // Attempt 6+ hit the rate limit → 429 Too Many Requests
    assert.deepEqual(responses, [
      401, 401, 401, 401, 401,  // valid attempts (wrong password)
      429, 429, 429, 429, 429, 429, // rate-limited
    ]);
  });
});
```

---

## 9. `testHelpers.ts`

**Location:** [`frontend/e2e/testHelpers.ts`](file:///d:/task-manager/frontend/e2e/testHelpers.ts)
**Purpose:** Shared fixtures and API route interceptors for all Playwright E2E tests

```typescript
import type { Page, Route } from '@playwright/test'

// ── Shared Test Fixtures ──────────────────────────────────────────────────────

export const testUser = {
  id:    '507f1f77bcf86cd799439011',
  name:  'Week Seven User',
  email: 'week7@example.test',
}

// Calendar task with a deadline set to the 15th of the current month
export const calendarTask = {
  id:       '507f1f77bcf86cd799439012',
  title:    'Release checklist',
  priority: 'High',
  status:   'In Progress',
  deadline: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-15T12:00:00.000Z`,
  source:   'personal',
  project:  null,
}

// ── API Mock Helper ───────────────────────────────────────────────────────────
// Intercepts all /api/** requests and returns deterministic fixture responses.
// Used by calendar.spec.ts and responsive.spec.ts to simulate an authenticated
// session without a live backend.
export async function mockAuthenticatedApi(page: Page) {
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url())

    // Auth: return the test user (simulates a valid session)
    if (url.pathname.endsWith('/auth/me')) {
      await route.fulfill({ json: { user: testUser } })
      return
    }
    // Calendar: return one task on the current month
    if (url.pathname.endsWith('/tasks/calendar')) {
      await route.fulfill({ json: { tasks: [calendarTask] } })
      return
    }
    // Notifications: empty inbox, 0 unread
    if (url.pathname.endsWith('/notifications')) {
      await route.fulfill({ json: { notifications: [], unreadCount: 0, nextCursor: null } })
      return
    }
    // Personal tasks: empty list
    if (url.pathname.endsWith('/tasks')) {
      await route.fulfill({ json: { tasks: [] } })
      return
    }
    // Dashboard: all zeros
    if (url.pathname.endsWith('/dashboard/summary')) {
      await route.fulfill({
        json: {
          success: true,
          summary: { totalTasks: 0, pendingTasks: 0, completedTasks: 0, inProgressTasks: 0, overdueTasks: 0, progress: 0 },
          upcomingTasks: [],
        },
      })
      return
    }
    // Projects: empty list
    if (url.pathname.endsWith('/projects')) {
      await route.fulfill({ json: { projects: [] } })
      return
    }
    // Transfer requests: empty list
    if (url.pathname.endsWith('/transfer-requests')) {
      await route.fulfill({ json: { requests: [] } })
      return
    }
    // Default fallback: empty JSON
    await route.fulfill({ json: {} })
  })
}
```

---

## 10. `auth.spec.ts`

**Location:** [`frontend/e2e/auth.spec.ts`](file:///d:/task-manager/frontend/e2e/auth.spec.ts)
**Tests:** 2 E2E | **Requirement coverage:** FR-AUTH-012, FR-AUTH-011, NFR-SEC, UI-004

```typescript
import { expect, test } from '@playwright/test'

// ─── TC-E2E-001 ───────────────────────────────────────────────────────────────
// When /api/auth/me returns 401, navigating to /calendar must redirect to login.
// The login page must render the heading, email field, and password field.
test('protected calendar redirects unauthenticated users to login', async ({ page }) => {
  // Mock /api/auth/me to return 401 (not authenticated)
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { message: 'Authentication required' } })
  )

  await page.goto('/calendar')

  // Must redirect to the root/login route
  await expect(page).toHaveURL(/\/$/)
  // Login form elements must be visible
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
})

// ─── TC-E2E-002 ───────────────────────────────────────────────────────────────
// Login errors must be shown in a visible alert with the server's safe message.
// No internal detail (database, stack trace, secrets) must be visible on the page.
test('login errors are surfaced without leaking server details', async ({ page }) => {
  // Mock both endpoints: auth/me returns 401, login returns 401 with safe message
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { message: 'Authentication required' } })
  )
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ status: 401, json: { message: 'Invalid email or password' } })
  )

  await page.goto('/')
  await page.getByLabel('Email').fill('bad@example.test')
  await page.getByLabel('Password').fill('not-a-real-password')
  await page.getByRole('button', { name: 'Log in' }).click()

  // Safe message must be displayed in an alert role element
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
  // No text matching internal server detail patterns must appear
  await expect(page.getByText(/database|stack|secret/i)).toHaveCount(0)
})
```

---

## 11. `calendar.spec.ts`

**Location:** [`frontend/e2e/calendar.spec.ts`](file:///d:/task-manager/frontend/e2e/calendar.spec.ts)
**Tests:** 1 E2E | **Requirement coverage:** FR-CAL-001, FR-CAL-004, FR-CAL-005

```typescript
import { expect, test } from '@playwright/test'
import { calendarTask, mockAuthenticatedApi } from './testHelpers'

// ─── TC-E2E-003 ───────────────────────────────────────────────────────────────
// With an authenticated API mock returning one task, the Calendar page must:
//   1. Display the "Calendar" heading
//   2. Show the task title as a clickable link
//   3. Navigate forward to next month (heading changes)
//   4. Return to current month when "Today" is clicked
test('calendar loads due tasks and navigates between months', async ({ page }) => {
  // Set up authenticated API mocks (see testHelpers.ts)
  await mockAuthenticatedApi(page)
  await page.goto('/calendar')

  // Calendar heading must be visible
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible()
  // Task from the fixture (title: 'Release checklist') must be rendered as a link
  await expect(page.getByRole('link', { name: calendarTask.title })).toBeVisible()

  // Capture the current month heading text
  const monthHeading = page.locator('.calendar-month-navigation h2')
  const currentMonth = await monthHeading.textContent()

  // Navigate to next month → heading must change
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(monthHeading).not.toHaveText(currentMonth ?? '')

  // Click "Today" → heading must revert to current month
  await page.getByRole('button', { name: 'Today' }).click()
  await expect(monthHeading).toHaveText(currentMonth ?? '')
})
```

---

## 12. `responsive.spec.ts`

**Location:** [`frontend/e2e/responsive.spec.ts`](file:///d:/task-manager/frontend/e2e/responsive.spec.ts)
**Tests:** 1 E2E (3 viewports) | **Requirement coverage:** FR-CAL-006, NFR-RESP-001, UI-002

```typescript
import { expect, test } from '@playwright/test'
import { calendarTask, mockAuthenticatedApi } from './testHelpers'

// ─── TC-E2E-004 ───────────────────────────────────────────────────────────────
// At each viewport size (Desktop / Tablet / Mobile), verify:
//   - The calendar task link is visible
//   - Main navigation is visible
//   - "Next month" button is visible
//   - document.scrollWidth <= window.innerWidth (no horizontal overflow)
test('calendar remains navigable without horizontal overflow on desktop, tablet, and mobile', async ({ page }) => {
  await mockAuthenticatedApi(page)
  await page.goto('/calendar')

  // Test all three viewports in sequence
  for (const viewport of [
    { width: 1440, height: 900  }, // Desktop
    { width: 768,  height: 1024 }, // Tablet
    { width: 390,  height: 844  }, // Mobile (iPhone 14 Pro size)
  ]) {
    await page.setViewportSize(viewport)

    // Key UI elements must remain visible at every viewport
    await expect(page.getByRole('link',       { name: calendarTask.title })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await expect(page.getByRole('button',     { name: 'Next month'      })).toBeVisible()

    // Measure document width vs viewport width using in-page JavaScript
    const dimensions = await page.evaluate(() => ({
      documentWidth:  document.documentElement.scrollWidth,
      viewportWidth:  window.innerWidth,
      // Collect layout diagnostics for specific problem areas
      layoutBoxes: [
        ...document.querySelectorAll('#app, .app-shell, .projects-shell, .projects-sidebar, .calendar-toolbar')
      ].map((element) => {
        const bounds = element.getBoundingClientRect()
        return {
          className:   typeof element.className === 'string' ? element.className : element.id,
          left:        Math.round(bounds.left),
          right:       Math.round(bounds.right),
          width:       Math.round(bounds.width),
          scrollWidth: element.scrollWidth,
        }
      }),
      // Find any element that extends beyond the viewport width (overflow candidates)
      overflowingElements: [...document.querySelectorAll('body *')]
        .map((element) => {
          const bounds = element.getBoundingClientRect()
          return {
            tag:       element.tagName,
            className: typeof element.className === 'string' ? element.className : '',
            right:     Math.round(bounds.right),
            width:     Math.round(bounds.width),
          }
        })
        .filter((element) => element.width > 0 && element.right > window.innerWidth)
        .slice(0, 8), // limit to 8 for readable failure output
    }))

    // Core assertion: no horizontal scroll at any viewport
    // On failure, the diagnostic JSON (layoutBoxes + overflowingElements) is printed
    expect(
      dimensions.documentWidth,
      JSON.stringify({ layoutBoxes: dimensions.layoutBoxes, overflowingElements: dimensions.overflowingElements })
    ).toBeLessThanOrEqual(dimensions.viewportWidth)
  }
})
```

---

## Quick Reference — Run All Tests

```powershell
# ─── BACKEND: 44 unit + integration tests ────────────────────────────────────
Set-Location D:\task-manager\backend
npm test                   # node --test (all 8 test files)

# ─── BACKEND: Dependency security audit ──────────────────────────────────────
npm audit
npm audit --omit=dev       # production deps only → must report 0 vulns

# ─── FRONTEND: Build → E2E → Audit ───────────────────────────────────────────
Set-Location D:\task-manager\frontend
npm run build              # TypeScript + Vite production build (0 errors)
npm run test:e2e           # Playwright Chrome (4 E2E specs)
npm audit
npm audit --omit=dev
```

---

*All 48 tests pass as of November 2026. See [TEST_PLAN_Task_Manager.md](file:///d:/task-manager/TEST_PLAN_Task_Manager.md) for detailed test case analysis and [Week7_Test_Report.md](file:///d:/task-manager/Week7_Test_Report.md) for recorded test evidence.*
