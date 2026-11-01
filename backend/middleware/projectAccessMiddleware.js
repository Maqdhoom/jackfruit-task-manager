const Project = require('../models/Project');
const { getProjectRole, isValidId } = require('../controllers/projectController');

function requireProjectAccess(requiredRole = 'viewer') {
  const allowedRoles = requiredRole === 'editor'
    ? ['owner', 'editor']
    : requiredRole === 'owner'
      ? ['owner']
      : ['owner', 'editor', 'viewer'];

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

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action' });
    }

    req.project = project;
    req.projectRole = role;
    return next();
  };
}

module.exports = requireProjectAccess;
