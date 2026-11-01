// Temporary in-memory storage for applications.
const applications = [];
let nextId = 1;

// OIPP-F-017: allowed statuses
const STATUSES = ['applied', 'shortlisted', 'rejected', 'selected'];

function findApplication(studentId, driveId) {
  return applications.find((a) => a.studentId === studentId && a.driveId === driveId) || null;
}

function addApplication(studentId, driveId) {
  const app = { id: nextId++, studentId, driveId, status: 'applied', appliedAt: new Date().toISOString() };
  applications.push(app);
  return app;
}

function listApplicationsByStudent(studentId) {
  return applications.filter((a) => a.studentId === studentId);
}

// OIPP-F-019: all applications (used by the TPO statistics)
function listApplications() {
  return applications.slice();
}

// OIPP-F-017: find one application by its id
function getApplicationById(id) {
  return applications.find((a) => a.id === id) || null;
}

// OIPP-F-017: change the status and keep a history (audit trail)
function updateApplicationStatus(id, status, changedBy) {
  const app = getApplicationById(id);
  if (!app) return null;
  const now = new Date().toISOString();
  if (!app.statusHistory) {
    app.statusHistory = [{ status: app.status, changedBy: app.studentId, at: app.appliedAt }];
  }
  app.status = status;
  app.statusUpdatedAt = now;
  app.statusHistory.push({ status, changedBy, at: now });
  return app;
}

module.exports = {
  STATUSES,
  findApplication,
  addApplication,
  listApplicationsByStudent,
  listApplications,
  getApplicationById,
  updateApplicationStatus,
};
