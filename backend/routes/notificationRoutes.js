const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const {
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} = require('../controllers/notificationController');

const router = express.Router();

router.use(authMiddleware);
router.get('/', listNotifications);
router.patch('/read-all', markAllNotificationsRead);
router.patch('/:notificationId/read', markNotificationRead);
router.delete('/:notificationId', deleteNotification);

module.exports = router;
