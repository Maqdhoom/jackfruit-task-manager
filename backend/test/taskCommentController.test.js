const assert = require('node:assert/strict');
const test = require('node:test');
const TaskComment = require('../models/TaskComment');
const {
  canPostProjectComment,
  validateCommentInput,
} = require('../controllers/taskCommentController');

test('validates immutable comment content and rejects unsupported properties', () => {
  assert.deepEqual(validateCommentInput({ body: '  Looks good  ' }), { value: 'Looks good' });
  assert.ok(validateCommentInput({ body: ' ' }).error);
  assert.ok(validateCommentInput({ body: 'x'.repeat(5001) }).error);
  assert.ok(validateCommentInput({ body: 'Valid', authorId: '507f1f77bcf86cd799439011' }).error);
  assert.ok(validateCommentInput(null).error);
});

test('project Viewers can read comments but only Owners, Admins, and Members may post', () => {
  assert.equal(canPostProjectComment('owner'), true);
  assert.equal(canPostProjectComment('admin'), true);
  assert.equal(canPostProjectComment('member'), true);
  assert.equal(canPostProjectComment('viewer'), false);
  assert.equal(canPostProjectComment(null), false);
});

test('comment schema indexes task timelines and private notes separately', () => {
  const indexes = TaskComment.schema.indexes();
  assert.ok(indexes.some(([fields]) =>
    fields.taskType === 1 && fields.taskId === 1 && fields.createdAt === -1
  ));
  assert.ok(indexes.some(([fields]) =>
    fields.transferredProjectTaskId === 1 && fields.ownerId === 1
  ));
});

test('comment records enforce owner scoping for private comments and project scoping for shared comments', async () => {
  const personalComment = new TaskComment({
    taskType: 'personal',
    taskId: '507f1f77bcf86cd799439011',
    authorId: '507f1f77bcf86cd799439012',
    body: 'Private',
  });
  const projectComment = new TaskComment({
    taskType: 'project',
    taskId: '507f1f77bcf86cd799439013',
    authorId: '507f1f77bcf86cd799439012',
    body: 'Shared',
  });

  await assert.rejects(personalComment.validate(), (error) => Boolean(error.errors.ownerId));
  await assert.rejects(projectComment.validate(), (error) => Boolean(error.errors.projectId));
});
