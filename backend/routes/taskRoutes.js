const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const {
  createTask,
  deleteTask,
  getDashboardSummary,
  getTask,
  getTasks,
  updateTask,
} = require('../controllers/taskController');

const router = express.Router();

router.use(authMiddleware);
router.route('/').post(createTask).get(getTasks);
router.get('/dashboard/summary', getDashboardSummary);
router.route('/:id').get(getTask).put(updateTask).delete(deleteTask);

module.exports = router;
