// OIPP-F-015: run with  node test-book-interview.js
const jwt = require('jsonwebtoken');
const { app } = require('./server');
const secret = process.env.JWT_SECRET || 'dev-secret';
const student = jwt.sign({ id: 1, role: 'student' }, secret);
const student2 = jwt.sign({ id: 2, role: 'student' }, secret);
const tpo = jwt.sign({ id: 9, role: 'TPO' }, secret); // the TPO is the interview reviewer

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
    check('TPO cannot list slots for booking -> 403', r.status === 403, r);
    r = await call('GET', '/slots', student);
    check('No slots before the TPO creates any', r.status === 200 && r.data.length === 0, r.data);

    const inTwoDays = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
    r = await call('POST', '/slots', student, { startsAt: inTwoDays });
    check('Student cannot create a slot -> 403', r.status === 403, r);
    r = await call('POST', '/slots', tpo, { startsAt: inTwoDays, durationMinutes: 30 });
    check('TPO creates a slot -> 201, TPO is the reviewer', r.status === 201 && r.data.reviewerId === 9 && r.data.status === 'open', r.data);
    const slotId = r.data.id;
    r = await call('POST', '/slots', tpo, { startsAt: '2020-01-01T10:00:00Z' });
    check('Slot in the past -> 400', r.status === 400, r);
    r = await call('POST', '/slots', tpo, { startsAt: 'not a date' });
    check('Invalid date -> 400', r.status === 400, r);
    r = await call('POST', '/slots', tpo, { startsAt: inTwoDays, durationMinutes: 5 });
    check('Duration under 15 minutes -> 400', r.status === 400, r);

    r = await call('GET', '/slots', student);
    check('Student sees the open slot', r.data.length === 1 && r.data[0].id === slotId, r.data);
    r = await call('POST', `/slots/${slotId}/book`, student);
    check('Student books the slot -> 201 booked', r.status === 201 && r.data.status === 'booked' && r.data.studentId === 1, r.data);
    r = await call('POST', `/slots/${slotId}/book`, student2);
    check('Same slot again -> 409 already booked', r.status === 409, r);
    r = await call('GET', '/slots', student);
    check('Booked slot leaves the open list', r.data.length === 0, r.data);

    r = await call('GET', '/schedule', student);
    check("AC-015: booking is on the student's schedule", r.data.length === 1 && r.data[0].id === slotId && r.data[0].myRole === 'student', r.data);
    r = await call('GET', '/schedule', tpo);
    check("AC-015: same booking is on the TPO reviewer's schedule", r.data.length === 1 && r.data[0].id === slotId && r.data[0].myRole === 'reviewer', r.data);
    r = await call('GET', '/schedule', student2);
    check('Uninvolved student sees nothing', r.data.length === 0, r.data);
  } catch (err) {
    failed++;
    console.error('ERROR', err);
  }
  console.log(failed ? `${failed} failed` : 'All passed');
  process.exit(failed ? 1 : 0);
});
