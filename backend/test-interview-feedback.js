// OIPP-F-016: run with  node test-interview-feedback.js
const jwt = require('jsonwebtoken');
const { app } = require('./server');
const secret = process.env.JWT_SECRET || 'dev-secret';
const student = jwt.sign({ id: 1, role: 'student' }, secret);
const outsider = jwt.sign({ id: 2, role: 'student' }, secret);
const reviewer = jwt.sign({ id: 201, role: 'student' }, secret);

let failed = 0;
function check(label, ok, detail) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  ' + JSON.stringify(detail)}`);
}

const server = app.listen(0, async () => {
  const base = `http://localhost:${server.address().port}/api/mock-interviews`;
  async function call(method, path, token, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  }

  try {
    // Seeded slot 1 belongs to reviewer 201; student 1 books it.
    await call('POST', '/slots/1/book', student);
    const feedback = 'Good DBMS answers. Practise explaining joins with an example.';

    let r = await call('POST', '/sessions/1/feedback', reviewer, { text: feedback });
    check('Feedback before the session is completed -> 409', r.status === 409, r);
    r = await call('POST', '/sessions/1/complete', student);
    check('Student cannot mark it completed -> 403', r.status === 403, r);
    r = await call('POST', '/sessions/1/complete', reviewer);
    check('Reviewer marks the session completed', r.status === 200 && r.data.status === 'completed', r.data);

    r = await call('POST', '/sessions/1/feedback', reviewer, { text: '   ' });
    check('Empty feedback -> 400', r.status === 400, r);
    r = await call('POST', '/sessions/1/feedback', student, { text: 'I rate myself 10/10' });
    check('Student cannot write the feedback -> 403', r.status === 403, r);
    r = await call('POST', '/sessions/1/feedback', reviewer, { text: feedback });
    check('Reviewer records feedback -> 201', r.status === 201 && r.data.feedback.text === feedback, r.data);

    r = await call('GET', '/sessions/1', student);
    check('AC-016: student reopens the session and sees the feedback', r.status === 200 && r.data.feedback && r.data.feedback.text === feedback, r.data);
    r = await call('GET', '/sessions/1', outsider);
    check('Another student cannot see the session -> 404', r.status === 404, r);
    r = await call('GET', '/sessions/2', student);
    check('An unbooked slot is not a session -> 404', r.status === 404, r);
    r = await call('GET', '/schedule', student);
    check('Completed session stays on the schedule', r.data.length === 1 && r.data[0].status === 'completed', r.data);
  } catch (err) {
    failed++;
    console.error('ERROR', err);
  }
  console.log(failed ? `${failed} failed` : 'All passed');
  process.exit(failed ? 1 : 0);
});
