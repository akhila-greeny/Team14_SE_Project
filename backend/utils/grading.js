// OIPP-F-012 / AC-012: the score is the number of correct answers.
// Unanswered questions count as wrong.
function gradeAttempt(test, answers = {}) {
  let score = 0;
  for (const q of test.questions) {
    if (answers[q.id] === q.answerIndex) score++;
  }
  const total = test.questions.length;
  return { score, total, percentage: total ? Math.round((score / total) * 100) : 0 };
}

module.exports = { gradeAttempt };
