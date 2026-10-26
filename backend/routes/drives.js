
const express = require('express');
const requireRole = require('../middleware/requireRole');
const { addDrive, listDrives } = require('../data/drivesStore');
const { notifyAllStudents } = require('../data/notificationsStore'); // OIPP-F-018

const router = express.Router();

// Checks that the TPO sent all required fields.
function validateDrive(body) {
  const errors = [];

  if (!body.company || typeof body.company !== 'string') {
    errors.push('company is required');
  }
  if (!body.role || typeof body.role !== 'string') {
    errors.push('role is required');
  }
  if (body.package === undefined || body.package === '') {
    errors.push('package/stipend is required');
  }

  const e = body.eligibility;
  if (!e || typeof e !== 'object') {
    errors.push('eligibility is required (minCgpa, branches, maxBacklogs)');
  } else {
    if (typeof e.minCgpa !== 'number' || e.minCgpa < 0 || e.minCgpa > 10) {
      errors.push('eligibility.minCgpa must be a number between 0 and 10');
    }
    if (!Array.isArray(e.branches) || e.branches.length === 0) {
      errors.push('eligibility.branches must be a non-empty list');
    }
    if (typeof e.maxBacklogs !== 'number' || e.maxBacklogs < 0) {
      errors.push('eligibility.maxBacklogs must be a number 0 or more');
    }
  }

  const deadline = new Date(body.deadline);
  if (!body.deadline || isNaN(deadline.getTime())) {
    errors.push('deadline must be a valid date');
  } else if (deadline <= new Date()) {
    errors.push('deadline must be in the future');
  }

  return errors;
}

// OIPP-F-007: only a TPO can post a drive
router.post('/', requireRole('TPO'), (req, res) => {
  const errors = validateDrive(req.body);
  if (errors.length > 0) {
    return res
      .status(400)
      .json({ error_code: 'VALIDATION_ERROR', message: errors.join('; ') });
  }

  const { company, role, package: pkg, eligibility, deadline } = req.body;
  const drive = addDrive({
    company,
    role,
    package: pkg,
    eligibility,
    deadline,
    postedBy: req.user.id,
  });

  // OIPP-F-018: tell all students about the new drive
  notifyAllStudents('new_drive', `New drive posted: ${drive.company} - ${drive.role}`, {
    driveId: drive.id,
  });

  res.status(201).json(drive);
});

// TPO drive list (the student view with eligibility filtering is issue F-008)
router.get('/', requireRole('TPO'), (req, res) => {
  res.json(listDrives());
});

module.exports = router;
