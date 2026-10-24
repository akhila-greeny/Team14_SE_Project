// Temporary in-memory storage for applications.
const applications = [];
let nextId = 1;

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

module.exports = { findApplication, addApplication, listApplicationsByStudent };
