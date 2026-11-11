// OIPP-F-015: run with  node test-book-interview.js
const jwt = require('jsonwebtoken');
const { app } = require('./server');
const secret = process.env.JWT_SECRET || 'dev-secret';
const student = jwt.sign({ id: 1, role: 'student' }, secret);
const student2 = jwt.sign({ id: 2, role: 'student' }, secret);
const senior = jwt.sign({ id: 201, role: 'student' }, secret);
const tpo = jwt.sign({ id: 9, role: 'TPO' }, secret);

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
    let r = await call('GET', '/slots', null);
    check('No token -> 401', r.status === 401, r);
    r = await call('GET', '/slots', tpo);
    check('TPO token -> 403', r.status === 403, r);

    r = await call('GET', '/slots', student);
    check('3 seeded open slots', r.status === 200 && r.data.length === 3, r.data);
    const slotId = r.data[0].id;

    r = await call('POST', `/slots/${slotId}/book`, senior);
    check("Reviewer can't book their own slot -> 400", r.status === 400, r);
    r = await call('POST', `/slots/${slotId}/book`, student);
    check('Student books a slot -> 201 booked', r.status === 201 && r.data.status === 'booked' && r.data.studentId === 1, r.data);
    r = await call('POST', `/slots/${slotId}/book`, student2);
    check('Same slot again -> 409 already booked', r.status === 409, r);
    r = await call('GET', '/slots', student);
    check('Booked slot leaves the open list', r.data.length === 2 && !r.data.some((s) => s.id === slotId), r.data);

    r = await call('GET', '/schedule', student);
    check("AC-015: booking is on the student's schedule", r.data.length === 1 && r.data[0].id === slotId && r.data[0].myRole === 'student', r.data);
    r = await call('GET', '/schedule', senior);
    check("AC-015: same booking is on the reviewer's schedule", r.data.length === 1 && r.data[0].id === slotId && r.data[0].myRole === 'reviewer', r.data);
    r = await call('GET', '/schedule', student2);
    check('Uninvolved student sees nothing', r.data.length === 0, r.data);

    const inTwoDays = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
    r = await call('POST', '/slots', student2, { startsAt: inTwoDays, durationMinutes: 30, reviewerName: 'Peer: Priya' });
    check('A peer offers a new slot -> 201', r.status === 201 && r.data.reviewerId === 2, r.data);
    r = await call('POST', '/slots', student2, { startsAt: '2020-01-01T10:00:00Z' });
    check('Slot in the past -> 400', r.status === 400, r);
    r = await call('POST', '/slots', student2, { startsAt: 'not a date' });
    check('Invalid date -> 400', r.status === 400, r);
  } catch (err) {
    failed++;
    console.error('ERROR', err);
  }
  console.log(failed ? `${failed} failed` : 'All passed');
  process.exit(failed ? 1 : 0);
});
