// OIPP-F-013: run with  node test-attempt-history.js
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
  async function take(token, testId, answers) {
    const { data } = await call('POST', `/${testId}/start`, token);
    await sleep(20); // so each attempt has a different timestamp
    return (await call('POST', `/attempts/${data.attempt.id}/submit`, token, { answers })).data.attempt;
  }

  try {
    let r = await call('GET', '/history', student);
    check('New student -> empty history', r.status === 200 && r.data.attemptCount === 0, r.data);

    const first = await take(student, 3, { 1: 1 });
    const second = await take(student, 1, { 1: 2, 2: 1 });
    const third = await take(student, 2, {});
    await take(otherStudent, 4, { 1: 2 });
    await call('POST', '/4/start', student); // still running, not finished

    r = await call('GET', '/history', student);
    const ids = r.data.attempts.map((a) => a.attemptId);
    check('History has my 3 finished attempts only', r.data.attemptCount === 3, r.data);
    check('AC-013: listed in chronological order (oldest first)', JSON.stringify(ids) === JSON.stringify([first.id, second.id, third.id]), ids);
    const times = r.data.attempts.map((a) => Date.parse(a.submittedAt));
    check('submittedAt times go up', times.every((t, i) => i === 0 || t >= times[i - 1]), times);
    check('Each entry shows topic and score', r.data.attempts[1].topic === 'Quantitative Aptitude' && r.data.attempts[1].score === 2 && r.data.attempts[1].total === 4, r.data.attempts[1]);
    check('In-progress test is not in history', !r.data.attempts.some((a) => a.testId === 4), r.data.attempts);

    r = await call('GET', '/history', otherStudent);
    check("Other student sees only their own attempt", r.data.attemptCount === 1 && r.data.attempts[0].testId === 4, r.data);

    r = await call('GET', '/history', null);
    check('No token -> 401', r.status === 401, r);
    r = await call('GET', '/history', tpo);
    check('TPO token -> 403', r.status === 403, r);
  } catch (err) {
    failed++;
    console.error('ERROR', err);
  }
  console.log(failed ? `${failed} failed` : 'All passed');
  process.exit(failed ? 1 : 0);
});
