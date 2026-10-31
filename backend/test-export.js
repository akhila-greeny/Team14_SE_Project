
const jwt = require('jsonwebtoken');
const roles = require('./utils/roles');

const secret = process.env.JWT_SECRET || 'dev-secret';
const BASE = 'http://localhost:3000/api';

const student = jwt.sign({ id: 1, role: roles.STUDENT || 'Student' }, secret);
const tpo = jwt.sign({ id: 2, role: roles.TPO || 'TPO' }, secret);

async function get(label, driveId, token) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(`${BASE}/drives/${driveId}/applicants/export`, { headers });
  const text = await res.text();
  console.log(label, '->', res.status);
  return { res, text };
}

function lines(text) {
  return text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
}

function check(label, actual, expected) {
  console.log('  ', label + ':', actual, '(expect ' + expected + ')');
}

(async () => {
  await get('No token         (expect 401)', 1, null);
  await get('Student          (expect 403)', 1, student);
  await get('Unknown drive    (expect 404)', 999, tpo);

  const { res, text } = await get('TPO, drive 1     (expect 200)', 1, tpo);
  const rows = lines(text);
  check('content-type is CSV', (res.headers.get('content-type') || '').includes('text/csv'), true);
  check('download filename', (res.headers.get('content-disposition') || '').includes('applicants-drive-1.csv'), true);
  check('header row', rows[0], 'Application ID,Student ID,Name,Email,Branch,CGPA,Backlogs,Status,Applied At');
  check('data rows', rows.length - 1, 3);
  check('comma is quoted', rows[1].includes('"Rao, Aditi"'), true);
  check('email filled', rows[1].includes('student@stu.pes.edu'), true);
  check('row 1 status', rows[1].includes(',shortlisted,'), true);
  check('formula defused', rows[2].includes("'=2+2"), true);
  check('row 3 status', rows[3].includes(',selected,'), true);

  const d2 = await get('TPO, drive 2     (expect 200)', 2, tpo);
  check('data rows', lines(d2.text).length - 1, 1);

  const d3 = await get('TPO, drive 3     (expect 200)', 3, tpo);
  check('data rows (header only)', lines(d3.text).length - 1, 0);
})();
