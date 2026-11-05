const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const {
  createPersonalTaskComment,
  listPersonalTaskComments,
  listTransferredPrivateTaskNotes,
} = require('../controllers/taskCommentController');
const {
  createTask,
  deleteTask,
  acceptTaskTransferRequest,
  declineTaskTransferRequest,
  getDashboardSummary,
  getCalendarTasks,
  getTask,
  getTasks,
  getTaskTransferRequests,
  transferOwnTaskToProject,
  updateTask,
} = require('../controllers/taskController');

const router = express.Router();

router.use(authMiddleware);
router.route('/').post(createTask).get(getTasks);
router.get('/dashboard/summary', getDashboardSummary);
router.get('/calendar', getCalendarTasks);
router.get('/transfer-requests', getTaskTransferRequests);
router.post('/transfer-requests/:requestId/accept', acceptTaskTransferRequest);
router.post('/transfer-requests/:requestId/decline', declineTaskTransferRequest);
router.get('/:id/private-notes', listTransferredPrivateTaskNotes);
router.route('/:id/comments').get(listPersonalTaskComments).post(createPersonalTaskComment);
router.post('/:id/transfer', transferOwnTaskToProject);
router.route('/:id').get(getTask).put(updateTask).delete(deleteTask);

module.exports = router;
