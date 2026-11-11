// OIPP-F-011: run with  node test-mock-tests.js
// Starts the app on a free port and calls the real HTTP endpoints.
process.env.MOCK_TEST_SECONDS = '2'; // short timer so the auto-submit can be tested
const jwt = require('jsonwebtoken');
const { app } = require('./server');

const secret = process.env.JWT_SECRET || 'dev-secret';
const student = jwt.sign({ id: 1, role: 'student' }, secret);
const otherStudent = jwt.sign({ id: 2, role: 'student' }, secret);
const tpo = jwt.sign({ id: 9, role: 'TPO' }, secret);

let failed = 0;
function check(label, ok, detail) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  ' + JSON.stringify(detail)}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = app.listen(0, async () => {
  const base = `http://localhost:${server.address().port}/api/mock-tests`;
  async function call(method, path, token, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  }

  try {
    let r = await call('GET', '', null);
    check('No token -> 401', r.status === 401, r);
    r = await call('GET', '', tpo);
    check('TPO token -> 403', r.status === 403, r);

    r = await call('GET', '', student);
    check('Student lists all 4 tests', r.status === 200 && r.data.length === 4, r.data);
    r = await call('GET', '?topic=dbms', student);
    check('?topic=dbms returns only the DBMS test', r.data.length === 1 && r.data[0].topic === 'DBMS', r.data);
    r = await call('GET', '?topic=aptitude', student);
    check('?topic=aptitude returns the 2 aptitude tests', r.data.length === 2, r.data);

    r = await call('GET', '/3', student);
    check('Test questions are sent without answers', r.status === 200 && r.data.questions.every((q) => !('answerIndex' in q)), r.data);

    // Submit before time is up
    r = await call('POST', '/3/start', student);
    const a1 = r.data.attempt;
    check('Starting a test returns a timer', r.status === 201 && a1.secondsLeft > 0 && a1.status === 'in_progress', r.data);
    r = await call('POST', `/attempts/${a1.id}/submit`, otherStudent, { answers: { 1: 1 } });
    check("Another student can't submit my attempt -> 404", r.status === 404, r);
    r = await call('POST', `/attempts/${a1.id}/submit`, student, { answers: { 1: 1, 2: 2 } });
    check('Submit in time -> submitted, not auto', r.data.attempt.status === 'submitted' && r.data.attempt.autoSubmitted === false, r.data);
    r = await call('POST', `/attempts/${a1.id}/submit`, student, { answers: {} });
    check('Submitting twice -> 409', r.status === 409, r);

    // AC-011: let the timer run out
    r = await call('POST', '/1/start', student);
    const a2 = r.data.attempt;
    await call('PATCH', `/attempts/${a2.id}/answers`, student, { answers: { 1: 2 } });
    await sleep(3000);
    r = await call('GET', `/attempts/${a2.id}`, student);
    check('AC-011: timer ran out -> auto-submitted', r.data.attempt.status === 'submitted' && r.data.attempt.autoSubmitted === true, r.data);
    check('Answers saved before the deadline are kept', r.data.attempt.answers['1'] === 2, r.data);
    r = await call('POST', `/attempts/${a2.id}/submit`, student, { answers: { 2: 1 } });
    check('Late submit is refused -> 409', r.status === 409, r);
  } catch (err) {
    failed++;
    console.error('ERROR', err);
  }
  console.log(failed ? `${failed} failed` : 'All passed');
  process.exit(failed ? 1 : 0);
});
