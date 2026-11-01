const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireProjectAccess = require('../middleware/projectAccessMiddleware');
const {
  addProjectMember,
  createProject,
  createProjectTask,
  deleteProjectTask,
  getProject,
  getProjectTasks,
  listProjects,
  removeProjectMember,
  updateProjectMember,
  updateProjectTask,
} = require('../controllers/projectController');

const router = express.Router();

router.use(authMiddleware);
router.route('/').get(listProjects).post(createProject);
router.get('/:projectId', getProject);
router.post('/:projectId/members', addProjectMember);
router.patch('/:projectId/members/:userId', updateProjectMember);
router.delete('/:projectId/members/:userId', removeProjectMember);

router.get('/:projectId/tasks', requireProjectAccess(), getProjectTasks);
router.post('/:projectId/tasks', requireProjectAccess('editor'), createProjectTask);
router.patch('/:projectId/tasks/:taskId', requireProjectAccess('editor'), updateProjectTask);
router.delete('/:projectId/tasks/:taskId', requireProjectAccess('editor'), deleteProjectTask);

module.exports = router;
