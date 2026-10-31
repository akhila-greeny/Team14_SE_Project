
const express = require('express');
const drivesRouter = require('./routes/drives');
const applicationStatusRouter = require('./routes/applicationStatus'); // OIPP-F-017
const notificationsRouter = require('./routes/notifications'); // OIPP-F-018
const reportsRouter = require('./routes/reports'); // OIPP-F-019
const applicantsExportRouter = require('./routes/applicantsExport'); // OIPP-F-020
const { checkDeadlineReminders } = require('./utils/deadlineReminders'); // OIPP-F-018
const { addApplication } = require('./data/applicationsStore'); // OIPP-F-017 (test seed)
const { seedStatsDemo } = require('./utils/seedStats'); // OIPP-F-019 (test seed)
const { seedExportDemo } = require('./utils/seedExport'); // OIPP-F-020 (test seed)
const { seedLoadDemo } = require('./utils/seedLoad'); // OIPP-NF-005 (test seed)

const app = express();
app.use(express.json());

app.use('/api/drives', drivesRouter);

app.use('/api/profile', require('./routes/profile'));
app.use('/api/drives', require('./routes/eligibleDrives'));
app.use('/api', require('./routes/apply'));
app.use('/api', applicationStatusRouter); // OIPP-F-017: PATCH /api/applications/:id/status
app.use('/api', notificationsRouter); // OIPP-F-018: /api/notifications
app.use('/api', reportsRouter); // OIPP-F-019: GET /api/reports/stats
app.use('/api', applicantsExportRouter); // OIPP-F-020: GET /api/drives/:id/applicants/export

// OIPP-F-018: check for approaching deadlines every hour
setInterval(() => checkDeadlineReminders(), 60 * 60 * 1000);

// Test only: "node server.js --seed" creates one demo application (student 1, drive 1)
if (process.argv.includes('--seed')) addApplication(1, 1);
// Test only: "node server.js --seed-stats" creates demo data for the statistics
if (process.argv.includes('--seed-stats')) seedStatsDemo();
// Test only: "node server.js --seed-export" creates demo data for the CSV export
if (process.argv.includes('--seed-export')) seedExportDemo();
// Test only: "node server.js --seed-load" creates 2000 students' data for the load test
if (process.argv.includes('--seed-load')) seedLoadDemo(2000);

app.use('/api/resume/template', require('./routes/resumeTemplate'));
app.use('/api/resume', require('./routes/resume'));
app.use('/api/auth', require('./routes/auth'));
app.listen(3000, () => console.log('Server running on port 3000'));
