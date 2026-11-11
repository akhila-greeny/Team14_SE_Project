// OIPP-F-012: run with  node test-auto-grade.js
process.env.MOCK_TEST_SECONDS = '2';
const jwt = require('jsonwebtoken');
const { app } = require('./server');
const student = jwt.sign({ id: 1, role: 'student' }, process.env.JWT_SECRET || 'dev-secret');

let failed = 0;
function check(label, ok, detail) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  ' + JSON.stringify(detail)}`);
}

const server = app.listen(0, async () => {
  const base = `http://localhost:${server.address().port}/api/mock-tests`;
  async function call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + student },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json() };
  }
  async function take(testId, answers) {
    const { data } = await call('POST', `/${testId}/start`);
    return (await call('POST', `/attempts/${data.attempt.id}/submit`, { answers })).data.attempt;
  }

  try {
    // Test 3 (DBMS) correct answers: q1=1, q2=2, q3=1, q4=0
    let a = await take(3, { 1: 1, 2: 2, 3: 1, 4: 0 });
    check('All 4 correct -> score 4/4 (100%)', a.score === 4 && a.total === 4 && a.percentage === 100, a);
    a = await take(3, { 1: 1, 2: 2, 3: 0, 4: 3 });
    check('2 correct, 2 wrong -> score 2/4', a.score === 2 && a.total === 4, a);
    a = await take(3, { 1: 1 });
    check('1 correct, 3 unanswered -> score 1/4', a.score === 1, a);
    a = await take(3, {});
    check('Nothing answered -> score 0/4', a.score === 0, a);
    check('Result shows which answers were right', a.results.length === 4 && a.results.every((r) => r.correct === false), a.results);

    const { data } = await call('POST', '/1/start');
    check('No score while the test is running', data.attempt.score === undefined, data.attempt);
    await call('PATCH', `/attempts/${data.attempt.id}/answers`, { answers: { 1: 2, 2: 1 } });
    await new Promise((r) => setTimeout(r, 3000));
    const auto = (await call('GET', `/attempts/${data.attempt.id}`)).data.attempt;
    check('Auto-submitted test is graded too -> 2/4', auto.autoSubmitted && auto.score === 2 && auto.total === 4, auto);
  } catch (err) {
    failed++;
    console.error('ERROR', err);
  }
  console.log(failed ? `${failed} failed` : 'All passed');
  process.exit(failed ? 1 : 0);
});
