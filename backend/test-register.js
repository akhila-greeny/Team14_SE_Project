const express = require('express');
const { isBcryptHash } = require('./utils/password');
const usersStore = require('./data/usersStore');
const authRouter = require('./routes/auth');

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
console.log('TEST SUITE: Student Registration with OTP Verification');
console.log('Requirement: OIPP-F-001 / Issue #1');
console.log('====================================================\n');

(async () => {
  // Setup test express application with /api/auth mounted
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);

  const server = app.listen(0);
  const port = server.address().port;
  const BASE_URL = `http://127.0.0.1:${port}/api/auth`;

  async function post(endpoint, body) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  try {
    usersStore.resetStore();

    // 1. Valid institutional registration
    const regSuccess = await post('/register', {
      email: 'pes2ug24cs023@stu.pes.edu',
      password: 'validStudentPassword123',
    });
    assert(
      'Valid institutional registration returns HTTP 200',
      regSuccess.status === 200 && regSuccess.data.message === 'OTP sent to institutional email',
      regSuccess
    );

    // 2. OTP is not returned in the ordinary API response
    assert(
      'OTP is NOT returned in API response',
      regSuccess.data.otp === undefined && JSON.stringify(regSuccess.data).indexOf('otp') === -1,
      regSuccess.data
    );

    // 3. Registration rejected for a non-institution email
    const regWrongDomain = await post('/register', {
      email: 'outsider@gmail.com',
      password: 'validStudentPassword123',
    });
    assert(
      'Registration with non-institution email is rejected with HTTP 400',
      regWrongDomain.status === 400 && regWrongDomain.data.error_code === 'INVALID_EMAIL',
      regWrongDomain
    );

    // 4. Malformed email rejected
    const regMalformed = await post('/register', {
      email: 'malformed-email-no-at',
      password: 'validStudentPassword123',
    });
    assert(
      'Registration with malformed email is rejected with HTTP 400',
      regMalformed.status === 400 && regMalformed.data.error_code === 'INVALID_EMAIL',
      regMalformed
    );

    // 5. Missing required fields rejected
    const regMissingEmail = await post('/register', {
      password: 'validStudentPassword123',
    });
    assert('Missing email is rejected with HTTP 400', regMissingEmail.status === 400, regMissingEmail);

    const regMissingPass = await post('/register', {
      email: 'student2@stu.pes.edu',
    });
    assert('Missing password is rejected with HTTP 400', regMissingPass.status === 400, regMissingPass);

    const regShortPass = await post('/register', {
      email: 'student2@stu.pes.edu',
      password: '123',
    });
    assert('Short password (< 6 chars) is rejected with HTTP 400', regShortPass.status === 400, regShortPass);

    // 6. Incorrect OTP rejected
    const verifyWrongOtp = await post('/verify-otp', {
      email: 'pes2ug24cs023@stu.pes.edu',
      otp: '000000',
    });
    assert(
      'Incorrect OTP is rejected with HTTP 400',
      verifyWrongOtp.status === 400 && verifyWrongOtp.data.error_code === 'INVALID_OTP',
      verifyWrongOtp
    );

    // 7. Correct OTP completes registration
    const pendingRecord = usersStore.getPendingRegistration('pes2ug24cs023@stu.pes.edu');
    assert('Pending registration exists in store with 6-digit OTP', pendingRecord && /^\d{6}$/.test(pendingRecord.otp), pendingRecord);

    const verifySuccess = await post('/verify-otp', {
      email: 'pes2ug24cs023@stu.pes.edu',
      otp: pendingRecord.otp,
    });
    assert(
      'Correct OTP returns HTTP 201 and studentId',
      verifySuccess.status === 201 &&
        verifySuccess.data.message === 'Registration verified successfully' &&
        typeof verifySuccess.data.studentId === 'number',
      verifySuccess
    );

    // 8. Password storage contains a bcrypt hash, not plaintext
    const verifiedUser = usersStore.findUserByEmail('pes2ug24cs023@stu.pes.edu');
    assert(
      'Stored user contains a 60-character bcrypt hash and no plaintext password',
      verifiedUser !== null &&
        isBcryptHash(verifiedUser.passwordHash) &&
        verifiedUser.password === undefined,
      { isHash: isBcryptHash(verifiedUser?.passwordHash), user: verifiedUser }
    );

    // 9. Duplicate registration rejected
    const regDuplicate = await post('/register', {
      email: '  PES2UG24CS023@STU.PES.EDU  ',
      password: 'anotherPassword123',
    });
    assert(
      'Duplicate registration with same/cased email is rejected with HTTP 409',
      regDuplicate.status === 409 && regDuplicate.data.error_code === 'EMAIL_ALREADY_REGISTERED',
      regDuplicate
    );

    // 10. OTP reuse rejected
    const verifyReuse = await post('/verify-otp', {
      email: 'pes2ug24cs023@stu.pes.edu',
      otp: pendingRecord.otp,
    });
    assert(
      'OTP reuse after verification is rejected',
      verifyReuse.status === 409 || verifyReuse.status === 400,
      verifyReuse
    );

    // 11. OTP expiry after five minutes
    await post('/register', {
      email: 'expiretest@stu.pes.edu',
      password: 'validStudentPassword123',
    });
    const pendingExpire = usersStore.getPendingRegistration('expiretest@stu.pes.edu');
    // Simulate elapsed time past 5 minutes
    pendingExpire.expiresAt = Date.now() - 1000;

    const verifyExpired = await post('/verify-otp', {
      email: 'expiretest@stu.pes.edu',
      otp: pendingExpire.otp,
    });
    assert(
      'Expired OTP is rejected with HTTP 400 OTP_EXPIRED',
      verifyExpired.status === 400 && verifyExpired.data.error_code === 'OTP_EXPIRED',
      verifyExpired
    );

    // 12. Login rejection for an unverified account
    // An unverified registration exists in pendingRegistrations but is not present in usersStore
    await post('/register', {
      email: 'unverified@stu.pes.edu',
      password: 'validStudentPassword123',
    });
    const unverifiedLookup = usersStore.findUserByEmail('unverified@stu.pes.edu');
    assert(
      'Unverified pending account cannot be found in active users store',
      unverifiedLookup === null,
      { unverifiedLookup }
    );

    // 13. Seeded accounts compatibility
    const seededStudent = usersStore.findUserByEmail('student@stu.pes.edu');
    const seededTPO = usersStore.findUserByEmail('tpo@pes.edu');
    assert(
      'Seeded student and TPO accounts are immediately verified and active',
      seededStudent !== null &&
        seededStudent.isVerified === true &&
        seededStudent.role === 'student' &&
        seededTPO !== null &&
        seededTPO.isVerified === true &&
        seededTPO.role === 'TPO',
      { seededStudent: !!seededStudent, seededTPO: !!seededTPO }
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
