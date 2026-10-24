
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET || 'dev-secret';

const studentToken = jwt.sign({ id: 1, role: 'Student' }, secret);
const tpoToken = jwt.sign({ id: 2, role: 'TPO' }, secret);

const goodDrive = {
  company: 'Infosys',
  role: 'Software Engineer',
  package: '6 LPA',
  eligibility: { minCgpa: 7.5, branches: ['CSE', 'ISE'], maxBacklogs: 0 },
  deadline: '2099-12-31',
};

async function call(label, method, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch('http://localhost:3000/api/drives', {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  console.log(label, '->', res.status);
  return data;
}

(async () => {
  await call('Student posts   (expect 403)', 'POST', studentToken, goodDrive);
  await call('TPO, no company (expect 400)', 'POST', tpoToken, { ...goodDrive, company: '' });
  await call('TPO, past date  (expect 400)', 'POST', tpoToken, { ...goodDrive, deadline: '2020-01-01' });
  await call('TPO posts drive (expect 201)', 'POST', tpoToken, goodDrive);
  const list = await call('TPO gets list   (expect 200)', 'GET', tpoToken);
  console.log('Drives in list:', list.length, '(expect 1) ->', list[0] && list[0].company);
})();
