const express = require('express');
const jwt = require('jsonwebtoken');
const usersStore = require('./data/usersStore');
const authRouter = require('./routes/auth');
const requireRole = require('./middleware/requireRole');
const { STUDENT, TPO } = require('./utils/roles');
const drivesRouter = require('./routes/drives');
const profileRouter = require('./routes/profile');
const eligibleDrivesRouter = require('./routes/eligibleDrives');
const applyRouter = require('./routes/apply');

let passed = 0;
let failed = 0;

function assert(description, condition, details) {
  if (condition) {
    console.log(`[PASS] ${description}`);
    passed++;
  } else {
    console.error(`[FAIL] ${description}`);
    if (details) {
      console.error(`       Details: ${JSON.stringify(details)}`);
    }
    failed++;
  }
}

console.log('====================================================');
console.log('TEST SUITE: Student and TPO Login Authentication');
console.log('Requirement: OIPP-F-002 / Issue #2');
console.log('====================================================\n');

(async () => {
  const secret = process.env.JWT_SECRET || 'dev-secret';

  // Mount complete application router structure matching server.js
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/drives', drivesRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/drives', eligibleDrivesRouter);
  app.use('/api', applyRouter);

  const server = app.listen(0);
  const port = server.address().port;
  const BASE_URL = `http://127.0.0.1:${port}/api`;

  async function post(path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  async function get(path, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  async function put(path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  try {
    usersStore.resetStore();

    // 1. Correct student credentials (seeded student)
    const loginStudent = await post('/auth/login', {
      email: 'student@stu.pes.edu',
      password: 'student123',
    });
    assert(
      'Seeded student login returns HTTP 200',
      loginStudent.status === 200,
      loginStudent
    );

    // 2. Login response contract: { token, studentId, expiresIn }
    assert(
      'Login response contains token, studentId, and expiresIn',
      typeof loginStudent.data.token === 'string' &&
        loginStudent.data.token.length > 20 &&
        typeof loginStudent.data.studentId === 'number' &&
        loginStudent.data.studentId === 1 &&
        loginStudent.data.expiresIn === '8h',
      loginStudent.data
    );

    // 3. Token payload verification: contains id and role
    const decodedStudent = jwt.verify(loginStudent.data.token, secret);
    assert(
      'Student token payload contains id: 1 and role: "student"',
      decodedStudent.id === 1 && decodedStudent.role === STUDENT && decodedStudent.role === 'student',
      decodedStudent
    );

    // 4. studentId matches token payload id
    assert(
      'studentId strictly matches payload id',
      loginStudent.data.studentId === decodedStudent.id,
      { studentId: loginStudent.data.studentId, payloadId: decodedStudent.id }
    );

    // 5. Token expiry is 8 hours (28,800 seconds)
    const tokenDuration = decodedStudent.exp - decodedStudent.iat;
    assert(
      'Token lifespan is exactly 8 hours (28,800 seconds)',
      tokenDuration === 8 * 60 * 60,
      { tokenDuration }
    );

    // 6. Incorrect password returns HTTP 401 with generic error
    const loginWrongPass = await post('/auth/login', {
      email: 'student@stu.pes.edu',
      password: 'wrongPassword123',
    });
    assert(
      'Incorrect password returns HTTP 401 UNAUTHORIZED',
      loginWrongPass.status === 401 &&
        loginWrongPass.data.error_code === 'UNAUTHORIZED' &&
        loginWrongPass.data.message === 'Invalid credentials',
      loginWrongPass
    );

    // 7. Unknown email returns HTTP 401 with identical generic error
    const loginUnknownEmail = await post('/auth/login', {
      email: 'nonexistent@stu.pes.edu',
      password: 'anyPassword123',
    });
    assert(
      'Unknown email returns HTTP 401 with identical generic message',
      loginUnknownEmail.status === 401 &&
        loginUnknownEmail.data.error_code === 'UNAUTHORIZED' &&
        loginUnknownEmail.data.message === loginWrongPass.data.message,
      loginUnknownEmail
    );

    // 8. Missing credentials return HTTP 400
    const loginMissingPass = await post('/auth/login', { email: 'student@stu.pes.edu' });
    const loginMissingEmail = await post('/auth/login', { password: 'student123' });
    assert(
      'Missing email or password returns HTTP 400 VALIDATION_ERROR',
      loginMissingPass.status === 400 && loginMissingEmail.status === 400,
      { passMissing: loginMissingPass.status, emailMissing: loginMissingEmail.status }
    );

    // 9. Unverified account cannot log in
    await post('/auth/register', {
      email: 'unverifiedlogin@stu.pes.edu',
      password: 'password123',
    });
    const loginUnverified = await post('/auth/login', {
      email: 'unverifiedlogin@stu.pes.edu',
      password: 'password123',
    });
    assert(
      'Unverified pending account is rejected with HTTP 401',
      loginUnverified.status === 401 && loginUnverified.data.error_code === 'UNAUTHORIZED',
      loginUnverified
    );

    // 10. Newly registered & verified student can log in
    const pending = usersStore.getPendingRegistration('unverifiedlogin@stu.pes.edu');
    await post('/auth/verify-otp', {
      email: 'unverifiedlogin@stu.pes.edu',
      otp: pending.otp,
    });
    const loginNewlyVerified = await post('/auth/login', {
      email: 'unverifiedlogin@stu.pes.edu',
      password: 'password123',
    });
    assert(
      'Newly verified student logs in successfully with HTTP 200',
      loginNewlyVerified.status === 200 && typeof loginNewlyVerified.data.studentId === 'number',
      loginNewlyVerified
    );

    // 11. Seeded TPO login verification
    const loginTPO = await post('/auth/login', {
      email: 'tpo@pes.edu',
      password: 'tpo123',
    });
    assert(
      'Seeded TPO login returns HTTP 200 with role "TPO"',
      loginTPO.status === 200,
      loginTPO
    );
    const decodedTPO = jwt.verify(loginTPO.data.token, secret);
    assert(
      'TPO token payload has role: "TPO" and id: 2',
      decodedTPO.role === TPO && decodedTPO.role === 'TPO' && decodedTPO.id === 2,
      decodedTPO
    );

    // 12. Protected route compatibility: requireRole('TPO')
    const tpoToken = loginTPO.data.token;
    const studentToken = loginStudent.data.token;

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const newDriveBody = {
      company: 'Google',
      role: 'Software Development Engineer',
      package: '25 LPA',
      eligibility: { minCgpa: 8.0, branches: ['CSE', 'ISE'], maxBacklogs: 0 },
      deadline: futureDate,
    };

    // TPO posts drive using login token
    const postDriveRes = await post('/drives', newDriveBody, tpoToken);
    assert(
      'TPO login token successfully posts drive on /api/drives (HTTP 201)',
      postDriveRes.status === 201 && postDriveRes.data.company === 'Google',
      postDriveRes
    );

    // Student token attempting to post drive must be rejected with 403
    const studentPostDriveRes = await post('/drives', newDriveBody, studentToken);
    assert(
      'Student token rejected with HTTP 403 on TPO route',
      studentPostDriveRes.status === 403 && studentPostDriveRes.data.error_code === 'FORBIDDEN',
      studentPostDriveRes
    );

    // TPO lists drives
    const listDrivesRes = await get('/drives', tpoToken);
    assert(
      'TPO login token lists drives on /api/drives (HTTP 200)',
      listDrivesRes.status === 200 && Array.isArray(listDrivesRes.data) && listDrivesRes.data.length >= 1,
      listDrivesRes
    );

    // 13. Protected route compatibility: student routes (profile, eligible drives, application)
    // Create profile
    const profileBody = {
      branch: 'CSE',
      cgpa: 8.5,
      backlogs: 0,
      skills: ['JavaScript', 'Node.js'],
      contact: '9876543210',
    };
    const putProfileRes = await put('/profile', profileBody, studentToken);
    assert(
      'Student login token creates profile on PUT /api/profile (HTTP 200)',
      putProfileRes.status === 200 && putProfileRes.data.studentId === 1,
      putProfileRes
    );

    // Read profile
    const getProfileRes = await get('/profile', studentToken);
    assert(
      'Student login token reads profile on GET /api/profile (HTTP 200)',
      getProfileRes.status === 200 && getProfileRes.data.branch === 'CSE',
      getProfileRes
    );

    // Get eligible drives
    const eligibleRes = await get('/drives/eligible', studentToken);
    assert(
      'Student login token retrieves eligible drives on GET /api/drives/eligible (HTTP 200)',
      eligibleRes.status === 200 && Array.isArray(eligibleRes.data),
      eligibleRes
    );

    // Apply to drive
    const driveId = postDriveRes.data.id;
    const applyRes = await post(`/drives/${driveId}/apply`, {}, studentToken);
    assert(
      'Student login token applies to drive on POST /api/drives/:id/apply (HTTP 201)',
      applyRes.status === 201 && applyRes.data.status === 'applied',
      applyRes
    );

    // List student applications
    const appsRes = await get('/applications', studentToken);
    assert(
      'Student login token lists applications on GET /api/applications (HTTP 200)',
      appsRes.status === 200 && Array.isArray(appsRes.data) && appsRes.data.length >= 1,
      appsRes
    );
  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
