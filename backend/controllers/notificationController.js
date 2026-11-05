const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { paginateNewest } = require('../utils/paginateNewest');

function isValidNotificationId(id) {
  return mongoose.isValidObjectId(id) && /^[a-f\d]{24}$/i.test(id);
}

function serializeNotification(notification) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    task: {
      id: notification.taskId.toString(),
      type: notification.taskType,
      projectId: notification.projectId.toString(),
    },
    dueAt: notification.dueAt.toISOString(),
    isRead: Boolean(notification.readAt),
    createdAt: notification.createdAt.toISOString(),
  };
}

async function listNotifications(req, res) {
  const filter = { userId: req.userId, deletedAt: null };
  const [page, unreadCount] = await Promise.all([
    paginateNewest(Notification, filter, req.query.cursor),
    Notification.countDocuments({ ...filter, readAt: null }),
  ]);
  if (page.error) return res.status(400).json({ message: page.error });

  return res.json({
    notifications: page.records.map(serializeNotification),
    unreadCount,
    nextCursor: page.nextCursor,
  });
}

async function markNotificationRead(req, res) {
  if (!isValidNotificationId(req.params.notificationId)) {
    return res.status(400).json({ message: 'Invalid notification ID' });
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.notificationId, userId: req.userId, readAt: null, deletedAt: null },
    { $set: { readAt: new Date() } },
    { new: true }
  );
  if (!notification) {
    const existing = await Notification.exists({
      _id: req.params.notificationId,
      userId: req.userId,
      deletedAt: null,
    });
    if (!existing) return res.status(404).json({ message: 'Notification not found' });
    return res.json({ message: 'Notification is already read' });
  }

  return res.json({ notification: serializeNotification(notification) });
}

async function markAllNotificationsRead(req, res) {
  const result = await Notification.updateMany(
    { userId: req.userId, readAt: null, deletedAt: null },
    { $set: { readAt: new Date() } }
  );
  return res.json({ modifiedCount: result.modifiedCount });
}

async function deleteNotification(req, res) {
  if (!isValidNotificationId(req.params.notificationId)) {
    return res.status(400).json({ message: 'Invalid notification ID' });
  }

  const notification = await Notification.findOneAndUpdate({
    _id: req.params.notificationId,
    userId: req.userId,
    deletedAt: null,
  }, { $set: { deletedAt: new Date() } });
  if (!notification) return res.status(404).json({ message: 'Notification not found' });

  return res.json({ message: 'Notification deleted' });
}

module.exports = {
  deleteNotification,
  isValidNotificationId,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  serializeNotification,
};
