// Temporary in-memory storage for the resume text a student saved after adjusting the template.
const saved = new Map();

function saveTemplate(studentId, template) {
  saved.set(studentId, { ...template, savedAt: new Date().toISOString() });
  return saved.get(studentId);
}

function getSavedTemplate(studentId) {
  return saved.get(studentId) || null;
}

module.exports = { saveTemplate, getSavedTemplate };
