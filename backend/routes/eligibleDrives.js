const express = require('express');
const requireRole = require('../middleware/requireRole');
const { STUDENT } = require('../utils/roles');
const { listDrives } = require('../data/drivesStore');
const { getProfile } = require('../data/profilesStore');
const { isEligible } = require('../utils/eligibility');

const router = express.Router();

// OIPP-F-008: a student sees only the drives they are eligible for.
// Eligibility is recomputed on every request, never cached.
router.get('/eligible', requireRole(STUDENT), (req, res) => {
  const profile = getProfile(req.user.id);
  if (!profile) {
    return res.status(404).json({ error_code: 'PROFILE_NOT_FOUND', message: 'Create your profile first' });
  }
  res.json(listDrives().filter((d) => isEligible(profile, d)));
});

module.exports = router;
