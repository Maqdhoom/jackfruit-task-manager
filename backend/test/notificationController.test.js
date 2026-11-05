const assert = require('node:assert/strict');
const test = require('node:test');
const Notification = require('../models/Notification');
const {
  deleteNotification,
  isValidNotificationId,
  listNotifications,
  markNotificationRead,
} = require('../controllers/notificationController');

const ownerId = '507f1f77bcf86cd799439011';
const otherUserId = '507f1f77bcf86cd799439012';
const notificationId = '507f1f77bcf86cd799439013';

function makeResponse() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('validates notification identifiers', () => {
  assert.equal(isValidNotificationId(notificationId), true);
  assert.equal(isValidNotificationId('invalid'), false);
});

test('notification listing scopes both records and unread count to the authenticated user', async (t) => {
  const originalFind = Notification.find;
  const originalCountDocuments = Notification.countDocuments;
  t.after(() => {
    Notification.find = originalFind;
    Notification.countDocuments = originalCountDocuments;
  });

  let listFilter;
  let countFilter;
  Notification.find = (filter) => {
    listFilter = filter;
    return {
      sort() {
        return this;
      },
      async limit() {
        return [{
          id: notificationId,
          type: 'task_due',
          title: 'Due',
          message: 'Task is due',
          taskId: '507f1f77bcf86cd799439014',
          taskType: 'project',
          projectId: '507f1f77bcf86cd799439015',
          dueAt: new Date('2026-11-05T10:00:00.000Z'),
          readAt: null,
          createdAt: new Date('2026-11-04T10:00:00.000Z'),
        }];
      },
    };
  };
  Notification.countDocuments = async (filter) => {
    countFilter = filter;
    return 1;
  };
  const response = makeResponse();

  await listNotifications({ userId: ownerId, query: {} }, response);

  assert.deepEqual(listFilter, { userId: ownerId, deletedAt: null });
  assert.deepEqual(countFilter, { userId: ownerId, deletedAt: null, readAt: null });
  assert.equal(response.body.unreadCount, 1);
  assert.equal(response.body.notifications[0].task.projectId, '507f1f77bcf86cd799439015');
});

test('mark-read query cannot mutate another user notification', async (t) => {
  const originalFindOneAndUpdate = Notification.findOneAndUpdate;
  const originalExists = Notification.exists;
  t.after(() => {
    Notification.findOneAndUpdate = originalFindOneAndUpdate;
    Notification.exists = originalExists;
  });

  let updateFilter;
  Notification.findOneAndUpdate = async (filter) => {
    updateFilter = filter;
    return null;
  };
  Notification.exists = async (filter) => {
    assert.deepEqual(filter, { _id: notificationId, userId: ownerId, deletedAt: null });
    return false;
  };
  const response = makeResponse();

  await markNotificationRead({
    params: { notificationId },
    userId: ownerId,
  }, response);

  assert.deepEqual(updateFilter, {
    _id: notificationId,
    userId: ownerId,
    readAt: null,
    deletedAt: null,
  });
  assert.equal(response.statusCode, 404);
  assert.notEqual(updateFilter.userId, otherUserId);
});

test('notification schema enforces per-user idempotency and unread queries', () => {
  const indexes = Notification.schema.indexes();
  assert.ok(indexes.some(([fields, options]) =>
    fields.userId === 1 && fields.dedupeKey === 1 && options.unique
  ));
  assert.ok(indexes.some(([fields]) => fields.userId === 1 && fields.readAt === 1));
});

test('delete notification soft-deletes only a notification owned by the authenticated user', async (t) => {
  const originalFindOneAndUpdate = Notification.findOneAndUpdate;
  t.after(() => {
    Notification.findOneAndUpdate = originalFindOneAndUpdate;
  });

  let filter;
  let update;
  Notification.findOneAndUpdate = async (query, changes) => {
    filter = query;
    update = changes;
    return { id: notificationId };
  };
  const response = makeResponse();

  await deleteNotification({
    params: { notificationId },
    userId: ownerId,
  }, response);

  assert.deepEqual(filter, {
    _id: notificationId,
    userId: ownerId,
    deletedAt: null,
  });
  assert.ok(update.$set.deletedAt instanceof Date);
  assert.equal(response.statusCode, 200);
});
