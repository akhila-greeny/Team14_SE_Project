
const jwt = require('jsonwebtoken');
const roles = require('./utils/roles');

const secret = process.env.JWT_SECRET || 'dev-secret';
const BASE = 'http://localhost:3000/api'; // change /api if server.js uses another path

const STUDENT = roles.STUDENT || 'Student';
const TPO = roles.TPO || 'TPO';

const student = jwt.sign({ id: 1, role: STUDENT }, secret);
const tpo = jwt.sign({ id: 2, role: TPO }, secret);

async function call(label, method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  console.log(label, '->', res.status);
  return data;
}

(async () => {
  let mine = await call('Student sees own list      (expect 200)', 'GET', '/applications', student);
  console.log('   status:', mine[0] && mine[0].status, '(expect applied)');

  await call('Student tries to change     (expect 403)', 'PATCH', '/applications/1/status', student, { status: 'selected' });
  await call('TPO sends invalid status    (expect 400)', 'PATCH', '/applications/1/status', tpo, { status: 'hired' });
  await call('TPO, unknown application    (expect 404)', 'PATCH', '/applications/999/status', tpo, { status: 'rejected' });
  await call('TPO shortlists application  (expect 200)', 'PATCH', '/applications/1/status', tpo, { status: 'shortlisted' });

  mine = await call('Student sees the update    (expect 200)', 'GET', '/applications', student);
  console.log('   status:', mine[0] && mine[0].status, '(expect shortlisted)');
})();
