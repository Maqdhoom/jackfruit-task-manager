require('dotenv').config();

const connectDB = require('./config/db');
const app = require('./app');
const Notification = require('./models/Notification');
const { startDeadlineReminderScheduler } = require('./services/deadlineReminderService');

const port = process.env.PORT || 5000;

async function startServer() {
  await connectDB();
  await Notification.init();
  startDeadlineReminderScheduler();
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
