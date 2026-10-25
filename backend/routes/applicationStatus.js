
const express = require('express');
const requireRole = require('../middleware/requireRole');
const roles = require('../utils/roles');
const { STATUSES, updateApplicationStatus } = require('../data/applicationsStore');
const { listDrives } = require('../data/drivesStore');
const { notifyStudent } = require('../data/notificationsStore');

const TPO = roles.TPO || 'TPO';
const router = express.Router();

// OIPP-F-017: only a TPO can change an application's status
router.patch('/applications/:id/status', requireRole(TPO), (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};

  if (!STATUSES.includes(status)) {
    return res.status(400).json({
      error_code: 'VALIDATION_ERROR',
      message: 'status must be one of: ' + STATUSES.join(', '),
    });
  }

  const application = updateApplicationStatus(id, status, req.user.id);
  if (!application) {
    return res.status(404).json({ error_code: 'NOT_FOUND', message: 'Application not found' });
  }

  // OIPP-F-018: tell the student about the change
  const drive = listDrives().find((d) => d.id === application.driveId);
  const where = drive ? `${drive.role} at ${drive.company}` : 'a drive';
  notifyStudent(
    application.studentId,
    'status_change',
    `Your application for ${where} is now "${status}"`,
    { driveId: application.driveId, applicationId: application.id }
  );

  res.json({
    applicationId: application.id,
    status: application.status,
    statusUpdatedAt: application.statusUpdatedAt,
  });
});

module.exports = router;
