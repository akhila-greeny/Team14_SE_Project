const express = require('express');
const requireRole = require('../middleware/requireRole');
const { STUDENT } = require('../utils/roles');
const { saveProfile, getProfile } = require('../data/profilesStore');

const router = express.Router();

function validateProfile(body) {
  const errors = [];
  if (!body.branch || typeof body.branch !== 'string') errors.push('branch is required');
  if (typeof body.cgpa !== 'number' || body.cgpa < 0 || body.cgpa > 10) {
    errors.push('cgpa must be a number between 0 and 10');
  }
  if (!Number.isInteger(body.backlogs) || body.backlogs < 0) {
    errors.push('backlogs must be a whole number 0 or more');
  }
  return errors;
}

// OIPP-F-004: create or update the logged-in student's profile
router.put('/', requireRole(STUDENT), (req, res) => {
  const errors = validateProfile(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error_code: 'VALIDATION_ERROR', message: errors.join('; ') });
  }
  const { branch, cgpa, backlogs, skills, contact } = req.body;
  const saved = saveProfile(req.user.id, { branch, cgpa, backlogs, skills: skills || [], contact: contact || '' });
  res.json(saved);
});

router.get('/', requireRole(STUDENT), (req, res) => {
  const profile = getProfile(req.user.id);
  if (!profile) {
    return res.status(404).json({ error_code: 'PROFILE_NOT_FOUND', message: 'Profile not found' });
  }
  res.json(profile);
});

module.exports = router;
