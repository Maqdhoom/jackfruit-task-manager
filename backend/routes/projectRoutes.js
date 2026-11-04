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
const {
  createProjectInvitation,
  listProjectInvitations,
  resendProjectInvitation,
  revokeProjectInvitation,
} = require('../controllers/projectInvitationController');

const router = express.Router();

router.use(authMiddleware);
router.route('/').get(listProjects).post(createProject);
router.get('/:projectId', getProject);
router.post('/:projectId/members', addProjectMember);
router.patch('/:projectId/members/:userId', updateProjectMember);
router.delete('/:projectId/members/:userId', removeProjectMember);
router.route('/:projectId/invitations').get(listProjectInvitations).post(createProjectInvitation);
router.post('/:projectId/invitations/:invitationId/resend', resendProjectInvitation);
router.delete('/:projectId/invitations/:invitationId', revokeProjectInvitation);

router.get('/:projectId/tasks', requireProjectAccess(), getProjectTasks);
router.post('/:projectId/tasks', requireProjectAccess('member'), createProjectTask);
router.patch('/:projectId/tasks/:taskId', requireProjectAccess('member'), updateProjectTask);
router.delete('/:projectId/tasks/:taskId', requireProjectAccess('member'), deleteProjectTask);

module.exports = router;
