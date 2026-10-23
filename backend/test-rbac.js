
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET || 'dev-secret';

const studentToken = jwt.sign({ id: 1, role: 'Student' }, secret);
const tpoToken = jwt.sign({ id: 2, role: 'TPO' }, secret);

async function call(label, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch('http://localhost:3000/api/drives', {
    method: 'POST',
    headers,
    body: '{}',
  });
  console.log(label, '->', res.status);
}

(async () => {
  await call('No token  (expect 401)', null);
  await call('Student   (expect 403)', studentToken);
  await call('TPO       (expect 201)', tpoToken);
})();
