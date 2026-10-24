// Temporary in-memory storage for student profiles (same approach as drivesStore).
const profiles = new Map();

function saveProfile(studentId, profile) {
  profiles.set(studentId, { studentId, ...profile });
  return profiles.get(studentId);
}

function getProfile(studentId) {
  return profiles.get(studentId) || null;
}

module.exports = { saveProfile, getProfile };
