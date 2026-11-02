// OIPP-SR-003 / Issue #28: institution email check.
// Thin wrapper around validateInstitutionalEmail so the approved domains
// (@stu.pes.edu, @pes.edu) live in one place: utils/emailValidator.js.
const { validateInstitutionalEmail } = require('./emailValidator');

// Returns true only for an email at an approved institution domain.
// Ignores upper/lower case and surrounding spaces. Empty or missing -> false.
function isInstitutionEmail(email) {
  return validateInstitutionalEmail(email).isValid;
}

module.exports = { isInstitutionEmail };
