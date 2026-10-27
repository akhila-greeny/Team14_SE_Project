// Temporary in-memory storage for resumes (one PDF per student).
const resumes = new Map();

function saveResume(studentId, { originalName, buffer }) {
  const resume = { studentId, originalName, buffer, size: buffer.length, uploadedAt: new Date().toISOString() };
  resumes.set(studentId, resume);
  return resume;
}

function getResume(studentId) {
  return resumes.get(studentId) || null;
}

module.exports = { saveResume, getResume };
