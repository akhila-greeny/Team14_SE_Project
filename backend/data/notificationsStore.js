
// Temporary in-memory storage for notifications.
// studentId = null means "for all students" (broadcast).
const notifications = [];
let nextId = 1;

function create({ studentId = null, type, message, driveId = null, applicationId = null }) {
  const n = {
    id: nextId++,
    studentId,
    type,
    message,
    driveId,
    applicationId,
    readBy: [],
    createdAt: new Date().toISOString(),
  };
  notifications.push(n);
  return n;
}

// For one student (e.g. application status changed)
function notifyStudent(studentId, type, message, extra = {}) {
  return create({ studentId, type, message, ...extra });
}

// For every student (e.g. new drive, deadline reminder)
function notifyAllStudents(type, message, extra = {}) {
  return create({ studentId: null, type, message, ...extra });
}

function toView(n, studentId) {
  return {
    id: n.id,
    type: n.type,
    message: n.message,
    driveId: n.driveId,
    applicationId: n.applicationId,
    read: n.readBy.includes(studentId),
    createdAt: n.createdAt,
  };
}

// A student sees their own notifications plus the broadcast ones, newest first
function listForStudent(studentId) {
  return notifications
    .filter((n) => n.studentId === null || n.studentId === studentId)
    .map((n) => toView(n, studentId))
    .sort((a, b) => b.id - a.id);
}

// Returns null if it doesn't exist or belongs to another student
function markRead(id, studentId) {
  const n = notifications.find((x) => x.id === id);
  if (!n) return null;
  if (n.studentId !== null && n.studentId !== studentId) return null;
  if (!n.readBy.includes(studentId)) n.readBy.push(studentId);
  return toView(n, studentId);
}

module.exports = { notifyStudent, notifyAllStudents, listForStudent, markRead };
