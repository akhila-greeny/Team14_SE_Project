// OIPP-F-011 / AC-011: a test auto-submits when its timer runs out.
const { listAttempts, getTest } = require('../data/mockTestsStore');
const { gradeAttempt } = require('./grading'); // OIPP-F-012

function isExpired(attempt, now = Date.now()) {
  return attempt.status === 'in_progress' && now >= Date.parse(attempt.expiresAt);
}

// Marks an attempt as submitted. Auto-submitted attempts keep the answers
// saved before the deadline and are stamped with the deadline time.
function finalizeAttempt(attempt, { auto = false } = {}) {
  if (attempt.status !== 'in_progress') return attempt;
  attempt.status = 'submitted';
  attempt.autoSubmitted = auto;
  attempt.submittedAt = auto ? attempt.expiresAt : new Date().toISOString();
  // OIPP-F-012: grade straight away, so the score is shown with the result.
  Object.assign(attempt, gradeAttempt(getTest(attempt.testId), attempt.answers));
  return attempt;
}

// Auto-submits one attempt if its time is up. Returns the attempt.
function autoSubmitIfExpired(attempt) {
  if (isExpired(attempt)) finalizeAttempt(attempt, { auto: true });
  return attempt;
}

// Background sweep so expired tests are submitted even if the student
// closes the page. unref() lets the process exit normally.
function startAutoSubmitSweep(intervalMs = 1000) {
  const timer = setInterval(() => listAttempts().forEach(autoSubmitIfExpired), intervalMs);
  timer.unref();
  return timer;
}

module.exports = { isExpired, finalizeAttempt, autoSubmitIfExpired, startAutoSubmitSweep };
