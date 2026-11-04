const Project = require('../models/Project');
const {
  canEditProjectTasks,
  canManageMembers,
  getProjectRole,
  isValidId,
} = require('../controllers/projectController');

function requireProjectAccess(requiredRole = 'viewer') {
  return async function projectAccessMiddleware(req, res, next) {
    if (!isValidId(req.params.projectId)) {
      return res.status(400).json({ message: 'Invalid project ID' });
    }

    const project = await Project.findOne({
      _id: req.params.projectId,
      $or: [{ ownerId: req.userId }, { 'members.userId': req.userId }],
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const role = getProjectRole(project, req.userId);

    const hasAccess = requiredRole === 'member'
      ? canEditProjectTasks(project, req.userId)
      : requiredRole === 'admin'
        ? canManageMembers(project, req.userId)
        : requiredRole === 'owner'
          ? role === 'owner'
            : ['owner', 'admin', 'member', 'viewer'].includes(role);

    if (!hasAccess) {
      return res.status(403).json({ message: 'You do not have permission to perform this action' });
    }

    req.project = project;
    req.projectRole = role;
    return next();
  };
}

module.exports = requireProjectAccess;
