const mongoose = require('mongoose');

const projectInvitationSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    role: {
      type: String,
      enum: ['admin', 'member', 'viewer'],
      required: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      select: false,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'expired', 'revoked'],
      default: 'pending',
      required: true,
    },
    deliveryStatus: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    lastSentAt: {
      type: Date,
      default: null,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

projectInvitationSchema.index(
  { projectId: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);
projectInvitationSchema.index({ tokenHash: 1 }, { unique: true });
projectInvitationSchema.index({ projectId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('ProjectInvitation', projectInvitationSchema);
