const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireProjectAccess = require('../middleware/projectAccessMiddleware');
const { listProjectActivity } = require('../controllers/projectActivityController');
const {
  createProjectTaskComment,
  listProjectTaskComments,
} = require('../controllers/taskCommentController');
const {
  addProjectMember,
  createProject,
  createProjectTask,
  createTaskTransferRequest,
  deleteProjectTask,
  getProject,
  getProjectTasks,
  listProjects,
  listProjectTaskTransferRequests,
  removeProjectMember,
  updateProjectMember,
  updateProjectTask,
  cancelProjectTaskTransferRequest,
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
router.get('/:projectId/activity', requireProjectAccess(), listProjectActivity);
router.post('/:projectId/members', addProjectMember);
router.patch('/:projectId/members/:userId', updateProjectMember);
router.delete('/:projectId/members/:userId', removeProjectMember);
router.route('/:projectId/invitations').get(listProjectInvitations).post(createProjectInvitation);
router.post('/:projectId/invitations/:invitationId/resend', resendProjectInvitation);
router.delete('/:projectId/invitations/:invitationId', revokeProjectInvitation);
router.route('/:projectId/task-transfer-requests')
  .get(requireProjectAccess('admin'), listProjectTaskTransferRequests)
  .post(requireProjectAccess('admin'), createTaskTransferRequest);
router.delete(
  '/:projectId/task-transfer-requests/:requestId',
  requireProjectAccess('admin'),
  cancelProjectTaskTransferRequest
);

router.get('/:projectId/tasks', requireProjectAccess(), getProjectTasks);
router.post('/:projectId/tasks', requireProjectAccess('member'), createProjectTask);
router.patch('/:projectId/tasks/:taskId', requireProjectAccess('member'), updateProjectTask);
router.delete('/:projectId/tasks/:taskId', requireProjectAccess('admin'), deleteProjectTask);
router.route('/:projectId/tasks/:taskId/comments')
  .get(requireProjectAccess(), listProjectTaskComments)
  .post(requireProjectAccess(), createProjectTaskComment);

module.exports = router;
