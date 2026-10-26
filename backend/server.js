
const express = require('express');
const drivesRouter = require('./routes/drives');
const applicationStatusRouter = require('./routes/applicationStatus'); // OIPP-F-017
const notificationsRouter = require('./routes/notifications'); // OIPP-F-018
const { checkDeadlineReminders } = require('./utils/deadlineReminders'); // OIPP-F-018
const { addApplication } = require('./data/applicationsStore'); // OIPP-F-017 (test seed)

const app = express();
app.use(express.json());

app.use('/api/drives', drivesRouter);

app.use('/api/profile', require('./routes/profile'));
app.use('/api/drives', require('./routes/eligibleDrives'));
app.use('/api', require('./routes/apply'));
app.use('/api', applicationStatusRouter); // OIPP-F-017: PATCH /api/applications/:id/status
app.use('/api', notificationsRouter); // OIPP-F-018: /api/notifications

// OIPP-F-018: check for approaching deadlines every hour
setInterval(() => checkDeadlineReminders(), 60 * 60 * 1000);

// Test only: "node server.js --seed" creates one demo application (student 1, drive 1)
if (process.argv.includes('--seed')) addApplication(1, 1);

app.listen(3000, () => console.log('Server running on port 3000'));
