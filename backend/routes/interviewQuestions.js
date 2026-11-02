const express = require('express');
const requireRole = require('../middleware/requireRole');
const { STUDENT } = require('../utils/roles');
const { listQuestions } = require('../data/questionsStore');

const router = express.Router();

// OIPP-F-014: searchable interview question bank.
// GET /api/interview-questions?company=Infosys -> only that company's questions
// GET /api/interview-questions                 -> all questions
router.get('/', requireRole(STUDENT), (req, res) => {
  const company = typeof req.query.company === 'string' ? req.query.company : '';
  res.json(listQuestions(company));
});

module.exports = router;
