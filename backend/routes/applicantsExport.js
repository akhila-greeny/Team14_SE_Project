
const express = require('express');
const requireRole = require('../middleware/requireRole');
const roles = require('../utils/roles');
const { listDrives } = require('../data/drivesStore');
const { listApplications } = require('../data/applicationsStore');
const { getProfile } = require('../data/profilesStore');
const { findUserById } = require('../data/usersStore');
const { toCsv } = require('../utils/csv');

const TPO = roles.TPO || 'TPO';
const router = express.Router();

const HEADERS = [
  'Application ID',
  'Student ID',
  'Name',
  'Email',
  'Branch',
  'CGPA',
  'Backlogs',
  'Status',
  'Applied At',
];

// Returns the first field that exists on the object ('' if none).
function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return '';
}

// OIPP-F-020: TPO downloads the applicant list of one drive as CSV
router.get('/drives/:id/applicants/export', requireRole(TPO), (req, res) => {
  const driveId = Number(req.params.id);
  const drive = listDrives().find((d) => d.id === driveId);
  if (!drive) {
    return res
      .status(404)
      .json({ error_code: 'DRIVE_NOT_FOUND', message: 'Drive not found' });
  }

  const rows = listApplications()
    .filter((a) => a.driveId === driveId)
    .sort((a, b) => a.id - b.id)
    .map((a) => {
      const profile = getProfile(a.studentId) || {};
      const user = findUserById(a.studentId);
      return [
        a.id,
        a.studentId,
        pick(profile, ['name', 'fullName']),
        user ? user.email : '',
        pick(profile, ['branch', 'department']),
        pick(profile, ['cgpa', 'CGPA', 'gpa']),
        pick(profile, ['backlogs', 'activeBacklogs']),
        a.status,
        a.appliedAt,
      ];
    });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="applicants-drive-${driveId}.csv"`
  );
  res.send(toCsv(HEADERS, rows));
});

module.exports = router;
