const express = require('express');
const requireRole = require('../middleware/requireRole');
const { STUDENT } = require('../utils/roles');
const { listTests, getTest, createAttempt, getAttempt } = require('../data/mockTestsStore');
const { isExpired, finalizeAttempt, autoSubmitIfExpired, startAutoSubmitSweep } = require('../utils/mockTestTimer');

const router = express.Router();
startAutoSubmitSweep();

// Never send the correct answers to the student.
function publicTest(test) {
  return {
    id: test.id,
    category: test.category,
    topic: test.topic,
    durationSeconds: test.durationSeconds,
    questionCount: test.questions.length,
  };
}

function withQuestions(test) {
  return {
    ...publicTest(test),
    questions: test.questions.map(({ id, text, options }) => ({ id, text, options })),
  };
}

function attemptView(attempt) {
  const secondsLeft = Math.max(0, Math.ceil((Date.parse(attempt.expiresAt) - Date.now()) / 1000));
  return { ...attempt, secondsLeft: attempt.status === 'in_progress' ? secondsLeft : 0 };
}

// Finds the student's own attempt and applies the timer first.
function ownAttempt(req, res) {
  const attempt = getAttempt(req.params.attemptId);
  if (!attempt || attempt.studentId !== req.user.id) {
    res.status(404).json({ error_code: 'ATTEMPT_NOT_FOUND', message: 'Attempt not found' });
    return null;
  }
  return autoSubmitIfExpired(attempt);
}

// Keeps only answers to real questions, with a valid option index.
function cleanAnswers(test, answers) {
  const clean = {};
  if (!answers || typeof answers !== 'object') return clean;
  for (const q of test.questions) {
    const value = answers[q.id];
    if (Number.isInteger(value) && value >= 0 && value < q.options.length) clean[q.id] = value;
  }
  return clean;
}

// OIPP-F-011: GET /api/mock-tests?topic=DBMS (or ?topic=aptitude / technical)
router.get('/', requireRole(STUDENT), (req, res) => {
  const topic = typeof req.query.topic === 'string' ? req.query.topic : '';
  res.json(listTests(topic).map(publicTest));
});

// GET /api/mock-tests/:id -> the test's questions, without answers
router.get('/:id', requireRole(STUDENT), (req, res) => {
  const test = getTest(req.params.id);
  if (!test) return res.status(404).json({ error_code: 'TEST_NOT_FOUND', message: 'Mock test not found' });
  res.json(withQuestions(test));
});

// POST /api/mock-tests/:id/start -> starts the timer
router.post('/:id/start', requireRole(STUDENT), (req, res) => {
  const test = getTest(req.params.id);
  if (!test) return res.status(404).json({ error_code: 'TEST_NOT_FOUND', message: 'Mock test not found' });
  const attempt = createAttempt(req.user.id, test);
  res.status(201).json({ attempt: attemptView(attempt), test: withQuestions(test) });
});

// PATCH /api/mock-tests/attempts/:attemptId/answers  body: { answers: { "1": 2 } }
// Saves answers while the timer runs, so they count if the test auto-submits.
router.patch('/attempts/:attemptId/answers', requireRole(STUDENT), (req, res) => {
  const attempt = ownAttempt(req, res);
  if (!attempt) return;
  if (attempt.status !== 'in_progress') {
    return res.status(409).json({ error_code: 'ATTEMPT_CLOSED', message: 'This attempt has already been submitted', attempt: attemptView(attempt) });
  }
  const test = getTest(attempt.testId);
  attempt.answers = { ...attempt.answers, ...cleanAnswers(test, req.body && req.body.answers) };
  res.json({ attempt: attemptView(attempt) });
});

// POST /api/mock-tests/attempts/:attemptId/submit  body: { answers: { "1": 2 } }
router.post('/attempts/:attemptId/submit', requireRole(STUDENT), (req, res) => {
  const attempt = getAttempt(req.params.attemptId);
  if (!attempt || attempt.studentId !== req.user.id) {
    return res.status(404).json({ error_code: 'ATTEMPT_NOT_FOUND', message: 'Attempt not found' });
  }
  if (attempt.status !== 'in_progress') {
    return res.status(409).json({ error_code: 'ATTEMPT_CLOSED', message: 'This attempt has already been submitted', attempt: attemptView(attempt) });
  }
  // Time already up: answers sent now are too late, keep the saved ones.
  if (isExpired(attempt)) {
    finalizeAttempt(attempt, { auto: true });
    return res.json({ attempt: attemptView(attempt) });
  }
  const test = getTest(attempt.testId);
  attempt.answers = { ...attempt.answers, ...cleanAnswers(test, req.body && req.body.answers) };
  finalizeAttempt(attempt);
  res.json({ attempt: attemptView(attempt) });
});

// GET /api/mock-tests/attempts/:attemptId -> current state (time left, or submitted)
router.get('/attempts/:attemptId', requireRole(STUDENT), (req, res) => {
  const attempt = ownAttempt(req, res);
  if (!attempt) return;
  res.json({ attempt: attemptView(attempt) });
});

module.exports = router;
