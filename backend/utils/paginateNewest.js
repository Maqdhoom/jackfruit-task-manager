const mongoose = require('mongoose');

const PAGE_SIZE = 20;

async function paginateNewest(Model, filter, cursor) {
  let pageFilter = filter;

  if (cursor !== undefined) {
    if (!mongoose.isValidObjectId(cursor) || !/^[a-f\d]{24}$/i.test(cursor)) {
      return { error: 'Invalid pagination cursor' };
    }

    const cursorRecord = await Model.findOne({ ...filter, _id: cursor }).select('createdAt');
    if (!cursorRecord) {
      return { error: 'Invalid pagination cursor' };
    }

    pageFilter = {
      ...filter,
      $or: [
        { createdAt: { $lt: cursorRecord.createdAt } },
        { createdAt: cursorRecord.createdAt, _id: { $lt: cursorRecord._id } },
      ],
    };
  }

  const records = await Model.find(pageFilter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(PAGE_SIZE + 1);
  const hasMore = records.length > PAGE_SIZE;
  const page = hasMore ? records.slice(0, PAGE_SIZE) : records;

  return {
    records: page,
    nextCursor: hasMore ? page.at(-1)._id.toString() : null,
  };
}

module.exports = { PAGE_SIZE, paginateNewest };
