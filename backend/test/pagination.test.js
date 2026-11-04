const assert = require('node:assert/strict');
const test = require('node:test');
const { PAGE_SIZE, paginateNewest } = require('../utils/paginateNewest');

test('newest-first pagination rejects malformed and out-of-scope cursors', async () => {
  const Model = {
    findOne() {
      return { select: async () => null };
    },
  };

  assert.equal((await paginateNewest(Model, { projectId: 'p' }, 'not-an-id')).error, 'Invalid pagination cursor');
  assert.equal(
    (await paginateNewest(Model, { projectId: 'p' }, '507f1f77bcf86cd799439011')).error,
    'Invalid pagination cursor'
  );
  assert.equal(PAGE_SIZE, 20);
});

test('newest-first pagination uses a stable timestamp and ID cursor with a one-record lookahead', async () => {
  const cursorId = '507f1f77bcf86cd799439011';
  const date = new Date('2026-11-04T00:00:00.000Z');
  const cursorRecord = { _id: cursorId, createdAt: date };
  const records = Array.from({ length: PAGE_SIZE + 1 }, (_, index) => ({
    _id: { toString: () => `507f1f77bcf86cd7994390${String(index + 20).padStart(2, '0')}` },
  }));
  let cursorQuery;
  let pageQuery;
  let sortOptions;
  let limitValue;
  const Model = {
    findOne(query) {
      cursorQuery = query;
      return { select: async () => cursorRecord };
    },
    find(query) {
      pageQuery = query;
      return {
        sort(value) {
          sortOptions = value;
          return this;
        },
        async limit(value) {
          limitValue = value;
          return records;
        },
      };
    },
  };

  const result = await paginateNewest(Model, { projectId: 'project' }, cursorId);

  assert.deepEqual(cursorQuery, { projectId: 'project', _id: cursorId });
  assert.deepEqual(pageQuery.$or, [
    { createdAt: { $lt: date } },
    { createdAt: date, _id: { $lt: cursorId } },
  ]);
  assert.deepEqual(sortOptions, { createdAt: -1, _id: -1 });
  assert.equal(limitValue, PAGE_SIZE + 1);
  assert.equal(result.records.length, PAGE_SIZE);
  assert.equal(result.nextCursor, result.records.at(-1)._id.toString());
});
