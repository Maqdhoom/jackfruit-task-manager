require('dotenv').config();

const mongoose = require('mongoose');
const Project = require('../models/Project');
const connectDB = require('../config/db');

async function migrateMemberRoles() {
  try {
    await connectDB();
    const result = await Project.updateMany(
      { 'members.role': 'editor' },
      { $set: { 'members.$[legacyEditor].role': 'member' } },
      { arrayFilters: [{ 'legacyEditor.role': 'editor' }] }
    );
    console.log(`Updated ${result.modifiedCount} project(s); legacy Editor memberships are now Members.`);
  } finally {
    await mongoose.disconnect();
  }
}

migrateMemberRoles().catch((error) => {
  console.error('Member role migration failed:', error);
  process.exitCode = 1;
});
