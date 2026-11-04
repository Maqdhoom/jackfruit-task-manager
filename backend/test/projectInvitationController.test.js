const assert = require('node:assert/strict');
const test = require('node:test');
const ProjectInvitation = require('../models/ProjectInvitation');
const {
  canManageInvitation,
  generateInvitationToken,
  hashInvitationToken,
  normalizeEmail,
  validateInvitationInput,
} = require('../controllers/projectInvitationController');
const ownerId = '507f1f77bcf86cd799439011';
const adminId = '507f1f77bcf86cd799439015';
const memberId = '507f1f77bcf86cd799439012';

function makeProject() {
  return {
    ownerId,
    members: [
      { userId: adminId, role: 'admin' },
      { userId: memberId, role: 'member' },
    ],
  };
}

test('validates invitation email and role while rejecting unsupported fields', () => {
  assert.deepEqual(validateInvitationInput({ email: ' New.User@example.com ', role: 'member' }), {
    values: { email: 'new.user@example.com', role: 'member' },
  });
  assert.equal(validateInvitationInput({ email: 'not-an-email', role: 'member' }).error !== undefined, true);
  assert.equal(validateInvitationInput({ email: 'valid@example.com', role: 'owner' }).error !== undefined, true);
  assert.equal(validateInvitationInput({ email: 'valid@example.com', role: 'member', invitedBy: 'client' }).error !== undefined, true);
});

test('creates high-entropy URL-safe invitation tokens and stores only a deterministic hash', () => {
  const firstToken = generateInvitationToken();
  const secondToken = generateInvitationToken();
  const firstHash = hashInvitationToken(firstToken);

  assert.match(firstToken, /^[\w-]{40,50}$/);
  assert.notEqual(firstToken, secondToken);
  assert.match(firstHash, /^[a-f\d]{64}$/);
  assert.equal(hashInvitationToken(firstToken), firstHash);
  assert.notEqual(firstHash, firstToken);
});

test('normalizes email addresses for membership and invitation matching', () => {
  assert.equal(normalizeEmail('  Person@Example.com '), 'person@example.com');
});

test('allows admins to manage regular invitations but reserves admin invitations to owners', () => {
  assert.equal(canManageInvitation(makeProject(), adminId, { role: 'member' }), true);
  assert.equal(canManageInvitation(makeProject(), adminId, { role: 'admin' }), false);
  assert.equal(canManageInvitation(makeProject(), ownerId, { role: 'admin' }), true);
  assert.equal(canManageInvitation(makeProject(), memberId, { role: 'member' }), false);
});

test('enforces unique pending invitations and indexes invitation token hashes', () => {
  const indexes = ProjectInvitation.schema.indexes();

  assert.ok(indexes.some(([fields, options]) =>
    fields.projectId === 1 &&
    fields.email === 1 &&
    options.unique === true &&
    options.partialFilterExpression?.status === 'pending'
  ));
  assert.ok(indexes.some(([fields, options]) =>
    fields.tokenHash === 1 && options.unique === true
  ));
});
