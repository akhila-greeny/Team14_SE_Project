const express = require('express');
const requireRole = require('../middleware/requireRole');
const { STUDENT } = require('../utils/roles');
const { listDrives } = require('../data/drivesStore');
const { getProfile } = require('../data/profilesStore');
const { addApplication, listApplicationsByStudent } = require('../data/applicationsStore');
const { isEligible } = require('../utils/eligibility');

const router = express.Router();

// OIPP-F-009: apply using the stored profile, nothing to re-enter
router.post('/drives/:driveId/apply', requireRole(STUDENT), (req, res) => {
  const driveId = Number(req.params.driveId);
  const drive = listDrives().find((d) => d.id === driveId);
  if (!drive) {
    return res.status(404).json({ error_code: 'DRIVE_NOT_FOUND', message: 'Drive not found' });
  }

  const profile = getProfile(req.user.id);
  if (!profile || !isEligible(profile, drive)) {
    return res.status(403).json({ error_code: 'NOT_ELIGIBLE', message: 'You are not eligible for this drive' });
  }

  const application = addApplication(req.user.id, driveId);
  res.status(201).json({ applicationId: application.id, status: application.status });
});

// "My Applications"
router.get('/applications', requireRole(STUDENT), (req, res) => {
  const drives = listDrives();
  const rows = listApplicationsByStudent(req.user.id).map((a) => {
    const d = drives.find((x) => x.id === a.driveId) || {};
    return { applicationId: a.id, status: a.status, company: d.company, role: d.role, appliedAt: a.appliedAt };
  });
  res.json(rows);
});

module.exports = router;
