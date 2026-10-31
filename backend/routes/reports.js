
const express = require('express');
const requireRole = require('../middleware/requireRole');
const roles = require('../utils/roles');
const { listDrives } = require('../data/drivesStore');
const { listApplications, STATUSES } = require('../data/applicationsStore');

const TPO = roles.TPO || 'TPO';
const router = express.Router();

// "6 LPA" -> 6, "4.5 LPA" -> 4.5, 7 -> 7. Returns null if no number is found.
function parsePackage(value) {
  if (typeof value === 'number') return value;
  const match = String(value).match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

// OIPP-F-019: placement statistics for the TPO dashboard
router.get('/reports/stats', requireRole(TPO), (req, res) => {
  const drives = listDrives();
  const applications = listApplications();

  const applicationsByStatus = {};
  STATUSES.forEach((s) => {
    applicationsByStatus[s] = 0;
  });
  applications.forEach((a) => {
    if (applicationsByStatus[a.status] !== undefined) applicationsByStatus[a.status]++;
  });

  const perDrive = drives.map((d) => {
    const apps = applications.filter((a) => a.driveId === d.id);
    return {
      driveId: d.id,
      company: d.company,
      role: d.role,
      package: d.package,
      applications: apps.length,
      selected: apps.filter((a) => a.status === 'selected').length,
    };
  });

  // Package range = lowest and highest package among drives where someone was selected
  const packages = perDrive
    .filter((p) => p.selected > 0)
    .map((p) => parsePackage(p.package))
    .filter((n) => n !== null);

  res.json({
    totalDrives: drives.length,
    totalApplications: applications.length,
    applicationsByStatus,
    selections: applicationsByStatus.selected,
    packageRange: packages.length
      ? { min: Math.min(...packages), max: Math.max(...packages) }
      : null,
    perDrive,
  });
});

module.exports = router;
