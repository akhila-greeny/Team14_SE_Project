
const jwt = require('jsonwebtoken');
const roles = require('./utils/roles');

const secret = process.env.JWT_SECRET || 'dev-secret';
const BASE = 'http://localhost:3000/api';
const STUDENT = roles.STUDENT || 'Student';
const TPO = roles.TPO || 'TPO';

const student = jwt.sign({ id: 1, role: STUDENT }, secret);
const tpo = jwt.sign({ id: 2, role: TPO }, secret);

async function call(label, token) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + '/reports/stats', { headers });
  const data = await res.json();
  console.log(label, '->', res.status);
  return data;
}

function check(label, actual, expected) {
  console.log('  ', label + ':', actual, '(expect ' + expected + ')');
}

(async () => {
  await call('No token         (expect 401)', null);
  await call('Student          (expect 403)', student);
  const s = await call('TPO              (expect 200)', tpo);

  check('totalDrives', s.totalDrives, 3);
  check('totalApplications', s.totalApplications, 6);
  check('applied', s.applicationsByStatus.applied, 2);
  check('shortlisted', s.applicationsByStatus.shortlisted, 1);
  check('rejected', s.applicationsByStatus.rejected, 1);
  check('selected', s.applicationsByStatus.selected, 2);
  check('selections', s.selections, 2);
  check('packageRange', JSON.stringify(s.packageRange), '{"min":4,"max":6}');
  check('Infosys row', JSON.stringify([s.perDrive[0].applications, s.perDrive[0].selected]), '[3,1]');
  check('TCS row', JSON.stringify([s.perDrive[1].applications, s.perDrive[1].selected]), '[2,1]');
  check('Wipro row', JSON.stringify([s.perDrive[2].applications, s.perDrive[2].selected]), '[1,0]');
})();
