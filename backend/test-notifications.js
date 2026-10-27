
const jwt = require('jsonwebtoken');
const roles = require('./utils/roles');

const secret = process.env.JWT_SECRET || 'dev-secret';
const BASE = 'http://localhost:3000/api';
const STUDENT = roles.STUDENT || 'Student';
const TPO = roles.TPO || 'TPO';

const student1 = jwt.sign({ id: 1, role: STUDENT }, secret);
const student3 = jwt.sign({ id: 3, role: STUDENT }, secret);
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

function drive(company, deadline) {
  return {
    company,
    role: 'Software Engineer',
    package: '6 LPA',
    eligibility: { minCgpa: 7.5, branches: ['CSE', 'ISE'], maxBacklogs: 0 },
    deadline,
  };
}

(async () => {
  let list = await call('Student 1 list, empty      (expect 200)', 'GET', '/notifications', student1);
  console.log('   count:', list.length, '(expect 0)');

  await call('TPO posts a drive           (expect 201)', 'POST', '/drives', tpo, drive('Infosys', '2099-12-31'));
  list = await call('Student 1 sees new drive   (expect 200)', 'GET', '/notifications', student1);
  console.log('   count:', list.length, '(expect 1), type:', list[0] && list[0].type, '(expect new_drive)');

  await call('TPO shortlists application  (expect 200)', 'PATCH', '/applications/1/status', tpo, { status: 'shortlisted' });
  list = await call('Student 1 sees status      (expect 200)', 'GET', '/notifications', student1);
  console.log('   count:', list.length, '(expect 2), newest:', list[0] && list[0].type, '(expect status_change)');

  const other = await call('Student 3 sees only drive   (expect 200)', 'GET', '/notifications', student3);
  console.log('   count:', other.length, '(expect 1), type:', other[0] && other[0].type, '(expect new_drive)');

  const soon = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  await call('TPO posts drive, 12h left  (expect 201)', 'POST', '/drives', tpo, drive('TCS', soon));
  const r = await call('TPO runs deadline check   (expect 200)', 'POST', '/notifications/check-deadlines', tpo);
  console.log('   reminders:', r.reminders, '(expect 1)');
  list = await call('Student 1 sees reminder    (expect 200)', 'GET', '/notifications', student1);
  console.log('   has reminder:', list.some((n) => n.type === 'deadline_reminder'), '(expect true)');

  const statusNote = list.find((n) => n.type === 'status_change');
  await call('Student 3 reads others      (expect 404)', 'PATCH', '/notifications/' + statusNote.id + '/read', student3);
  const read = await call('Student 1 marks read       (expect 200)', 'PATCH', '/notifications/' + statusNote.id + '/read', student1);
  console.log('   read:', read.read, '(expect true)');

  await call('TPO opens student list      (expect 403)', 'GET', '/notifications', tpo);
})();
