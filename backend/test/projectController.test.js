const assert = require('node:assert/strict');
const test = require('node:test');
const Project = require('../models/Project');
const ProjectTask = require('../models/ProjectTask');
const requireProjectAccess = require('../middleware/projectAccessMiddleware');
const {
  canEditProjectTasks,
  canManageMembers,
  canAssignMemberRole,
  canMemberUpdateProjectTask,
  canManageMemberRole,
  getProjectRole,
  serializeProject,
  validateAssigneeMembership,
  validateProjectInput,
  validateProjectTaskInput,
} = require('../controllers/projectController');

const ownerId = '507f1f77bcf86cd799439011';
const editorId = '507f1f77bcf86cd799439012';
const viewerId = '507f1f77bcf86cd799439013';
const projectId = '507f1f77bcf86cd799439014';
const adminId = '507f1f77bcf86cd799439015';

function makeProject() {
  return {
    _id: projectId,
    ownerId,
    members: [
      { userId: adminId, role: 'admin' },
      { userId: editorId, role: 'editor' },
      { userId: viewerId, role: 'viewer' },
    ],
  };
}

test('validates project names and rejects client-controlled ownership fields', () => {
  assert.deepEqual(validateProjectInput({ name: '  Product launch  ' }), {
    values: { name: 'Product launch', description: '' },
  });
  assert.equal(validateProjectInput({ name: ' ' }).error, 'Project name must be 1-100 characters and description 2000 characters or fewer');
  assert.equal(validateProjectInput({ name: 'Valid', ownerId }).error, 'Project contains unsupported fields');
  assert.ok(validateProjectInput({ name: 'Valid', description: 'x'.repeat(2001) }).error);
});

test('validates project task fields while allowing an optional deadline', () => {
  assert.deepEqual(validateProjectTaskInput({ title: '  Plan release  ' }).values, {
    title: 'Plan release',
  });
  assert.equal(validateProjectTaskInput({ title: 'Valid', status: 'Blocked' }).error, 'Status must be Pending, In Progress, or Completed');
  assert.equal(validateProjectTaskInput({ title: 'Valid', projectId }).error, 'Task contains unsupported fields');
  assert.equal(validateProjectTaskInput({}, true).error, 'Provide at least one task field to update');
  assert.equal(validateProjectTaskInput({ deadline: 'not-a-date' }, true).error, 'Deadline must be a valid date');
  assert.equal(validateProjectTaskInput({ deadline: '2026-02-31' }, true).error, 'Deadline must be a valid date');
});

test('resolves owner, admin, member, and viewer roles including legacy editors', () => {
  assert.equal(getProjectRole(makeProject(), ownerId), 'owner');
  assert.equal(getProjectRole(makeProject(), adminId), 'admin');
  assert.equal(getProjectRole(makeProject(), editorId), 'member');
  assert.equal(getProjectRole(makeProject(), viewerId), 'viewer');
  assert.equal(getProjectRole(makeProject(), '507f1f77bcf86cd799439016'), null);
  assert.equal(
    getProjectRole({
      ownerId: { _id: ownerId },
      members: [{ userId: { _id: editorId }, role: 'editor' }],
    }, editorId),
    'member'
  );
  assert.equal(canManageMembers(makeProject(), ownerId), true);
  assert.equal(canManageMembers(makeProject(), adminId), true);
  assert.equal(canManageMembers(makeProject(), editorId), false);
  assert.equal(canAssignMemberRole('owner', 'admin'), true);
  assert.equal(canAssignMemberRole('admin', 'admin'), false);
  assert.equal(canAssignMemberRole('admin', 'member'), true);
  assert.equal(canManageMemberRole('admin', 'member', 'viewer'), true);
  assert.equal(canManageMemberRole('admin', 'admin', 'member'), false);
  assert.equal(canManageMemberRole('owner', 'admin', 'member'), true);
  assert.equal(canEditProjectTasks(makeProject(), editorId), true);
  assert.equal(canEditProjectTasks(makeProject(), viewerId), false);
  assert.equal(validateAssigneeMembership(makeProject(), [ownerId, adminId, editorId]), true);
  assert.equal(validateAssigneeMembership(makeProject(), [viewerId]), false);
  assert.equal(validateAssigneeMembership(makeProject(), ['507f1f77bcf86cd799439016']), false);
  assert.equal(
    validateProjectTaskInput({ title: 'Work', assigneeIds: [editorId, adminId] }).values.assigneeIds.length,
    2
  );
  assert.ok(validateProjectTaskInput({ title: 'Work', assigneeIds: [editorId, editorId] }).error);
  assert.ok(validateProjectTaskInput({ title: 'Work', assigneeIds: ['invalid'] }).error);
  assert.equal(
    canMemberUpdateProjectTask({ assigneeIds: [editorId] }, editorId, { status: 'Completed' }),
    true
  );
  assert.equal(
    canMemberUpdateProjectTask({ assigneeIds: [adminId] }, editorId, { status: 'Completed' }),
    false
  );
  assert.equal(
    canMemberUpdateProjectTask({ assigneeIds: [editorId] }, editorId, { title: 'Escalate' }),
    false
  );
  assert.equal(
    canMemberUpdateProjectTask({ assigneeIds: [editorId] }, editorId, { status: 'Completed', title: 'Escalate' }),
    false
  );
});

test('serializes progress as zero for projects without tasks', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const result = serializeProject({
    id: projectId,
    name: 'Launch',
    description: '',
    ownerId,
    members: [],
    createdAt,
    updatedAt: createdAt,
  });
  assert.equal(result.progress, 0);
  assert.equal(result.memberCount, 1);
  assert.equal(result.owner.id, ownerId);
});

test('project tasks default to no assignees and index project assignment queries', () => {
  const task = new ProjectTask({
    title: 'Release notes',
    projectId,
    createdBy: ownerId,
  });
  const indexes = ProjectTask.schema.indexes();

  assert.deepEqual(task.assigneeIds, []);
  assert.ok(indexes.some(([fields]) =>
    fields.projectId === 1 && fields.assigneeIds === 1 && fields.status === 1
  ));
});

test('project access middleware denies viewers task edits and allows members', async (t) => {
  const originalFindOne = Project.findOne;
  t.after(() => {
    Project.findOne = originalFindOne;
  });

  let queriedFilter;
  Project.findOne = (filter) => {
    queriedFilter = filter;
    return Promise.resolve(makeProject());
  };

  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let passedToNext = false;
  const req = { params: { projectId }, userId: viewerId };

  await requireProjectAccess('member')(req, response, () => {
    passedToNext = true;
  });

  assert.equal(response.statusCode, 403);
  assert.equal(passedToNext, false);
  assert.equal(queriedFilter._id, projectId);
  assert.deepEqual(queriedFilter.$or, [
    { ownerId: viewerId },
    { 'members.userId': viewerId },
  ]);

  const editorResponse = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let editorPassed = false;
  await requireProjectAccess('member')(
    { params: { projectId }, userId: editorId },
    editorResponse,
    () => {
      editorPassed = true;
    }
  );
  assert.equal(editorPassed, true);
});
