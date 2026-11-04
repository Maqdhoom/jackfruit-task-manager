const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Project = require('../models/Project');
const ProjectInvitation = require('../models/ProjectInvitation');
const User = require('../models/User');
const {
  canAssignMemberRole,
  canManageMembers,
  getProjectRole,
  isValidId,
} = require('./projectController');
const { sendProjectInvitation } = require('../services/invitationEmailService');

const invitationRoles = ['admin', 'member', 'viewer'];
const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const resendCooldownMs = 60 * 1000;
const maxPendingInvitationsPerProject = 100;

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function validateInvitationInput(body) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((field) => !['email', 'role'].includes(field)) ||
    typeof body.email !== 'string' ||
    body.email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
    !invitationRoles.includes(body.role)
  ) {
    return { error: 'A valid email and role (admin, member, or viewer) are required' };
  }

  return { values: { email: normalizeEmail(body.email), role: body.role } };
}

function generateInvitationToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashInvitationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function serializeInvitation(invitation) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    deliveryStatus: invitation.deliveryStatus,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}

function canManageInvitation(project, userId, invitation) {
  const callerRole = getProjectRole(project, userId);

  if (!['owner', 'admin'].includes(callerRole)) {
    return false;
  }

  return callerRole === 'owner' || invitation.role !== 'admin';
}

async function getManageableProject(projectId, userId) {
  if (!isValidId(projectId)) {
    return { error: { status: 400, message: 'Invalid project ID' } };
  }

  const project = await Project.findOne({
    _id: projectId,
    $or: [{ ownerId: userId }, { 'members.userId': userId }],
  })
    .populate('ownerId', 'name email')
    .populate('members.userId', 'name email');

  if (!project) {
    return { error: { status: 404, message: 'Project not found' } };
  }

  if (!canManageMembers(project, userId)) {
    return { error: { status: 403, message: 'Only project owners and admins can manage invitations' } };
  }

  return { project };
}

async function markExpiredInvitations(projectId, now = new Date()) {
  await ProjectInvitation.updateMany(
    { projectId, status: 'pending', expiresAt: { $lte: now } },
    { $set: { status: 'expired' } }
  );
}

async function deliverInvitation(invitation, project, token, inviterName) {
  invitation.lastSentAt = new Date();
  invitation.deliveryStatus = 'pending';
  await invitation.save();

  try {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const inviteUrl = new URL(`/invitations/${encodeURIComponent(token)}`, `${frontendUrl}/`).toString();
    await sendProjectInvitation({
      email: invitation.email,
      projectName: project.name,
      inviterName,
      role: invitation.role,
      inviteUrl,
    });
  } catch (error) {
    invitation.deliveryStatus = 'failed';
    await invitation.save();
    console.error('Project invitation email failed:', error);
    return false;
  }

  invitation.deliveryStatus = 'sent';
  await invitation.save();
  return true;
}

async function createProjectInvitation(req, res) {
  const access = await getManageableProject(req.params.projectId, req.userId);

  if (access.error) {
    return res.status(access.error.status).json({ message: access.error.message });
  }

  const validation = validateInvitationInput(req.body);

  if (validation.error) {
    return res.status(400).json({ message: validation.error });
  }

  const { project } = access;
  const { email, role } = validation.values;
  const callerRole = getProjectRole(project, req.userId);

  if (!canAssignMemberRole(callerRole, role)) {
    return res.status(403).json({ message: 'Only the project owner can invite admins' });
  }

  if (
    project.ownerId.email.toLowerCase() === email ||
    project.members.some((member) => member.userId.email.toLowerCase() === email)
  ) {
    return res.status(409).json({ message: 'This email already belongs to a project member' });
  }

  if (await User.exists({ email })) {
    return res.status(409).json({ message: 'An account already exists for this email. Add the user as a member instead.' });
  }

  const now = new Date();
  await markExpiredInvitations(project._id, now);
  const pendingInvitation = await ProjectInvitation.findOne({
    projectId: project._id,
    email,
    status: 'pending',
  });

  if (pendingInvitation) {
    return res.status(409).json({ message: 'A pending invitation already exists for this email. Resend it from the invitation list.' });
  }

  const pendingCount = await ProjectInvitation.countDocuments({
    projectId: project._id,
    status: 'pending',
    expiresAt: { $gt: now },
  });

  if (pendingCount >= maxPendingInvitationsPerProject) {
    return res.status(429).json({ message: 'This project has reached the limit of 100 pending invitations.' });
  }

  const inviter = await User.findById(req.userId).select('name');

  if (!inviter) {
    return res.status(401).json({ message: 'Your account is no longer available. Please sign in again.' });
  }

  const token = generateInvitationToken();
  let invitation;

  try {
    invitation = await ProjectInvitation.create({
      projectId: project._id,
      email,
      role,
      invitedBy: req.userId,
      tokenHash: hashInvitationToken(token),
      expiresAt: new Date(now.getTime() + invitationLifetimeMs),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A pending invitation already exists for this email.' });
    }

    throw error;
  }

  const emailSent = await deliverInvitation(invitation, project, token, inviter.name);
  return res.status(emailSent ? 201 : 202).json({
    invitation: serializeInvitation(invitation),
    emailSent,
    message: emailSent
      ? 'Invitation sent.'
      : 'Invitation was saved, but the email could not be sent. Check email settings and resend it.',
  });
}

async function listProjectInvitations(req, res) {
  const access = await getManageableProject(req.params.projectId, req.userId);

  if (access.error) {
    return res.status(access.error.status).json({ message: access.error.message });
  }

  await markExpiredInvitations(access.project._id);
  const invitations = await ProjectInvitation.find({
    projectId: access.project._id,
    status: 'pending',
  }).sort({ createdAt: -1 });

  return res.json({ invitations: invitations.map(serializeInvitation) });
}

async function resendProjectInvitation(req, res) {
  const access = await getManageableProject(req.params.projectId, req.userId);

  if (access.error) {
    return res.status(access.error.status).json({ message: access.error.message });
  }

  if (!isValidId(req.params.invitationId)) {
    return res.status(400).json({ message: 'Invalid invitation ID' });
  }

  const invitation = await ProjectInvitation.findOne({
    _id: req.params.invitationId,
    projectId: access.project._id,
    status: 'pending',
  });

  if (!invitation) {
    return res.status(404).json({ message: 'Pending invitation not found' });
  }

  if (!canManageInvitation(access.project, req.userId, invitation)) {
    return res.status(403).json({ message: 'Only the project owner can resend admin invitations' });
  }

  const now = new Date();

  if (invitation.expiresAt <= now) {
    invitation.status = 'expired';
    await invitation.save();
    return res.status(410).json({ message: 'This invitation has expired. Create a new invitation.' });
  }

  if (invitation.lastSentAt && now.getTime() - invitation.lastSentAt.getTime() < resendCooldownMs) {
    return res.status(429).json({ message: 'Please wait one minute before resending this invitation.' });
  }

  const inviter = await User.findById(req.userId).select('name');

  if (!inviter) {
    return res.status(401).json({ message: 'Your account is no longer available. Please sign in again.' });
  }

  const token = generateInvitationToken();
  const updatedInvitation = await ProjectInvitation.findOneAndUpdate(
    {
      _id: invitation._id,
      projectId: access.project._id,
      status: 'pending',
      expiresAt: { $gt: now },
      $or: [
        { lastSentAt: null },
        { lastSentAt: { $lte: new Date(now.getTime() - resendCooldownMs) } },
      ],
    },
    {
      $set: {
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(now.getTime() + invitationLifetimeMs),
        lastSentAt: now,
        deliveryStatus: 'pending',
      },
    },
    { new: true, runValidators: true }
  );

  if (!updatedInvitation) {
    return res.status(429).json({ message: 'This invitation was recently updated. Wait one minute and try again.' });
  }

  const emailSent = await deliverInvitation(updatedInvitation, access.project, token, inviter.name);

  return res.status(emailSent ? 200 : 502).json({
    invitation: serializeInvitation(updatedInvitation),
    emailSent,
    message: emailSent
      ? 'Invitation resent.'
      : 'The invitation could not be emailed. Check email settings and try again.',
  });
}

async function revokeProjectInvitation(req, res) {
  const access = await getManageableProject(req.params.projectId, req.userId);

  if (access.error) {
    return res.status(access.error.status).json({ message: access.error.message });
  }

  if (!isValidId(req.params.invitationId)) {
    return res.status(400).json({ message: 'Invalid invitation ID' });
  }

  const invitation = await ProjectInvitation.findOne({
    _id: req.params.invitationId,
    projectId: access.project._id,
    status: 'pending',
  });

  if (!invitation) {
    return res.status(404).json({ message: 'Pending invitation not found' });
  }

  if (!canManageInvitation(access.project, req.userId, invitation)) {
    return res.status(403).json({ message: 'Only the project owner can revoke admin invitations' });
  }

  invitation.status = 'revoked';
  invitation.revokedAt = new Date();
  await invitation.save();
  return res.json({ message: 'Invitation revoked.' });
}

async function getInvitationDetails(req, res) {
  res.set('Cache-Control', 'no-store');

  if (typeof req.params.token !== 'string' || !/^[\w-]{40,50}$/.test(req.params.token)) {
    return res.status(404).json({ message: 'Invitation not found.' });
  }

  const invitation = await ProjectInvitation.findOne({
    tokenHash: hashInvitationToken(req.params.token),
  }).populate('projectId', 'name');

  if (!invitation) {
    return res.status(404).json({ message: 'Invitation not found or its link is invalid.' });
  }

  if (!invitation.projectId) {
    return res.status(404).json({ message: 'The invited project no longer exists.' });
  }

  if (invitation.status === 'pending' && invitation.expiresAt <= new Date()) {
    invitation.status = 'expired';
    await invitation.save();
  }

  return res.json({
    invitation: {
      projectId: invitation.projectId.id,
      projectName: invitation.projectId.name,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
    },
  });
}

class InvitationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function acceptProjectInvitation(req, res) {
  if (typeof req.params.token !== 'string' || !/^[\w-]{40,50}$/.test(req.params.token)) {
    return res.status(404).json({ message: 'Invitation not found or its link is invalid.' });
  }

  const tokenHash = hashInvitationToken(req.params.token);
  const session = await mongoose.startSession();
  let projectId;

  try {
    await session.withTransaction(async () => {
      const invitation = await ProjectInvitation.findOne({
        tokenHash,
        status: 'pending',
        expiresAt: { $gt: new Date() },
      }).session(session);

      if (!invitation) {
        const existing = await ProjectInvitation.findOne({ tokenHash }).session(session);
        if (!existing) throw new InvitationError(404, 'Invitation not found or its link is invalid.');
        if (existing.status === 'expired' || existing.expiresAt <= new Date()) {
          throw new InvitationError(410, 'This invitation has expired.');
        }
        if (existing.status === 'revoked') {
          throw new InvitationError(410, 'This invitation has been revoked.');
        }
        throw new InvitationError(409, 'This invitation has already been accepted.');
      }

      const user = await User.findById(req.userId).session(session);

      if (!user || user.email.toLowerCase() !== invitation.email) {
        throw new InvitationError(403, 'Sign in or register with the email address this invitation was sent to.');
      }

      const project = await Project.findById(invitation.projectId).session(session);

      if (!project) {
        throw new InvitationError(404, 'The invited project no longer exists.');
      }

      const isAlreadyMember = project.ownerId.toString() === user.id ||
        project.members.some((member) => member.userId.toString() === user.id);

      if (!isAlreadyMember) {
        const updatedProject = await Project.findOneAndUpdate(
          { _id: project._id, 'members.userId': { $ne: user._id } },
          { $push: { members: { userId: user._id, role: invitation.role } } },
          { new: true, runValidators: true, session }
        );

        if (!updatedProject) {
          throw new InvitationError(409, 'You are already a project member.');
        }
      }

      invitation.status = 'accepted';
      invitation.acceptedAt = new Date();
      await invitation.save({ session });
      projectId = project.id;
    });
  } catch (error) {
    if (error instanceof InvitationError) {
      return res.status(error.status).json({ message: error.message });
    }

    throw error;
  } finally {
    await session.endSession();
  }

  return res.json({ projectId, message: 'Invitation accepted.' });
}

module.exports = {
  acceptProjectInvitation,
  canManageInvitation,
  createProjectInvitation,
  generateInvitationToken,
  getInvitationDetails,
  hashInvitationToken,
  listProjectInvitations,
  normalizeEmail,
  resendProjectInvitation,
  revokeProjectInvitation,
  validateInvitationInput,
};
