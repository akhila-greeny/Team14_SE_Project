const express = require('express');
const requireRole = require('../middleware/requireRole');
const { STUDENT } = require('../utils/roles');
const { getProfile } = require('../data/profilesStore');
const { findUserById } = require('../data/usersStore');
const { saveTemplate, getSavedTemplate } = require('../data/resumeTemplatesStore');

const router = express.Router();

// Builds a fresh draft from the student's latest saved profile (never from a cached copy).
function buildDraft(studentId) {
  const profile = getProfile(studentId);
  if (!profile) return null;
  const user = findUserById(studentId);
  return {
    fullName: '',
    email: user ? user.email : '',
    contact: profile.contact,
    branch: profile.branch,
    cgpa: profile.cgpa,
    backlogs: profile.backlogs,
    skills: profile.skills,
    summary: '',
  };
}

// OIPP-F-006: auto-filled template; the student adjusts it, then saves
router.get('/', requireRole(STUDENT), (req, res) => {
  const draft = buildDraft(req.user.id);
  if (!draft) {
    return res.status(404).json({ error_code: 'PROFILE_NOT_FOUND', message: 'Create your profile first' });
  }
  res.json(draft);
});

// Save the adjusted version
router.put('/', requireRole(STUDENT), (req, res) => {
  const b = req.body || {};
  const errors = [];
  if (b.cgpa !== undefined && (typeof b.cgpa !== 'number' || b.cgpa < 0 || b.cgpa > 10)) {
    errors.push('cgpa must be a number between 0 and 10');
  }
  if (b.skills !== undefined && !Array.isArray(b.skills)) errors.push('skills must be a list');
  for (const f of ['fullName', 'email', 'contact', 'branch', 'summary']) {
    if (b[f] !== undefined && typeof b[f] !== 'string') errors.push(f + ' must be text');
  }
  if (errors.length > 0) {
    return res.status(400).json({ error_code: 'VALIDATION_ERROR', message: errors.join('; ') });
  }
  const draft = buildDraft(req.user.id);
  if (!draft) {
    return res.status(404).json({ error_code: 'PROFILE_NOT_FOUND', message: 'Create your profile first' });
  }
  res.json(saveTemplate(req.user.id, { ...draft, ...b }));
});

router.get('/saved', requireRole(STUDENT), (req, res) => {
  const t = getSavedTemplate(req.user.id);
  if (!t) {
    return res.status(404).json({ error_code: 'NO_SAVED_RESUME', message: 'No saved resume yet' });
  }
  res.json(t);
});

module.exports = router;
