// OIPP-F-011: topic-wise aptitude and technical mock tests.
// Temporary in-memory storage, same approach as drivesStore.js.
// answerIndex is the position of the correct option; it is never sent to students.

// Test only: MOCK_TEST_SECONDS overrides every test's timer (e.g. 2) so the
// auto-submit can be tested without waiting the full duration.
function duration(seconds) {
  const override = Number(process.env.MOCK_TEST_SECONDS);
  return override > 0 ? override : seconds;
}

const tests = [
  {
    id: 1,
    category: 'aptitude',
    topic: 'Quantitative Aptitude',
    durationSeconds: duration(10 * 60),
    questions: [
      { id: 1, text: 'What is 15% of 200?', options: ['20', '25', '30', '35'], answerIndex: 2 },
      { id: 2, text: 'A train covers 120 km in 2 hours. What is its speed in km/h?', options: ['50', '60', '70', '80'], answerIndex: 1 },
      { id: 3, text: 'The average of 4, 8 and 12 is?', options: ['6', '7', '8', '9'], answerIndex: 2 },
      { id: 4, text: 'If 5 pens cost Rs 40, how much do 8 pens cost?', options: ['Rs 56', 'Rs 60', 'Rs 64', 'Rs 72'], answerIndex: 2 },
    ],
  },
  {
    id: 2,
    category: 'aptitude',
    topic: 'Logical Reasoning',
    durationSeconds: duration(10 * 60),
    questions: [
      { id: 1, text: 'Next number in the series 2, 6, 12, 20, ?', options: ['28', '30', '32', '36'], answerIndex: 1 },
      { id: 2, text: 'If all roses are flowers and some flowers fade, then:', options: ['All roses fade', 'Some roses fade', 'No conclusion about roses fading', 'No roses fade'], answerIndex: 2 },
      { id: 3, text: 'Odd one out: Apple, Mango, Carrot, Banana', options: ['Apple', 'Mango', 'Carrot', 'Banana'], answerIndex: 2 },
      { id: 4, text: 'If CAT is coded as DBU, how is DOG coded?', options: ['EPH', 'EPG', 'DPH', 'FPH'], answerIndex: 0 },
    ],
  },
  {
    id: 3,
    category: 'technical',
    topic: 'DBMS',
    durationSeconds: duration(15 * 60),
    questions: [
      { id: 1, text: 'Which normal form removes partial dependencies?', options: ['1NF', '2NF', '3NF', 'BCNF'], answerIndex: 1 },
      { id: 2, text: 'Which SQL command removes all rows but keeps the table?', options: ['DROP', 'DELETE TABLE', 'TRUNCATE', 'REMOVE'], answerIndex: 2 },
      { id: 3, text: 'The "A" in ACID stands for:', options: ['Availability', 'Atomicity', 'Accuracy', 'Authorization'], answerIndex: 1 },
      { id: 4, text: 'A foreign key refers to which key of another table?', options: ['Primary key', 'Candidate key only', 'Composite key only', 'Any column'], answerIndex: 0 },
    ],
  },
  {
    id: 4,
    category: 'technical',
    topic: 'Operating Systems',
    durationSeconds: duration(15 * 60),
    questions: [
      { id: 1, text: 'Which scheduling algorithm can cause starvation?', options: ['Round Robin', 'FCFS', 'Shortest Job First', 'None'], answerIndex: 2 },
      { id: 2, text: 'A deadlock needs which of these conditions?', options: ['Preemption', 'Circular wait', 'Unlimited resources', 'Single process'], answerIndex: 1 },
      { id: 3, text: 'Paging mainly solves:', options: ['External fragmentation', 'Deadlock', 'Starvation', 'Race conditions'], answerIndex: 0 },
    ],
  },
];

const attempts = [];
let nextAttemptId = 1;

// Lists tests, optionally filtered by topic or category (case-insensitive).
function listTests(filter = '') {
  const wanted = String(filter).trim().toLowerCase();
  if (!wanted) return tests;
  return tests.filter((t) => t.topic.toLowerCase() === wanted || t.category === wanted);
}

function getTest(id) {
  return tests.find((t) => t.id === Number(id)) || null;
}

function createAttempt(studentId, test) {
  const now = Date.now();
  const attempt = {
    id: nextAttemptId++,
    studentId,
    testId: test.id,
    topic: test.topic,
    answers: {},
    status: 'in_progress',
    autoSubmitted: false,
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + test.durationSeconds * 1000).toISOString(),
    submittedAt: null,
  };
  attempts.push(attempt);
  return attempt;
}

function getAttempt(id) {
  return attempts.find((a) => a.id === Number(id)) || null;
}

function listAttempts() {
  return attempts;
}

module.exports = { listTests, getTest, createAttempt, getAttempt, listAttempts };
