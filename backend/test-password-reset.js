/**
 * TEST SUITE: Password Reset via Time-Limited Link
 * Requirement: OIPP-F-003 / Issue #3 / AC-003 / TC-Auth-02
 *
 * Covers:
 *  - POST /api/auth/forgot-password
 *  - POST /api/auth/reset-password
 *  - Regression: existing register and login flows continue working
 *
 * Run: node test-password-reset.js
 */

const express = require('express');
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
    if (details !== undefined) {
      console.error(`       Details: ${JSON.stringify(details)}`);
    }
    failed++;
  }
}

console.log('====================================================');
console.log('TEST SUITE: Password Reset via Time-Limited Link');
console.log('Requirement: OIPP-F-003 / Issue #3');
console.log('====================================================\n');

(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);

  const server = app.listen(0);
  const port = server.address().port;
  const BASE = `http://127.0.0.1:${port}/api/auth`;

  async function post(path, body) {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  try {
    // -----------------------------------------------------------------------
    // Reset store to a clean, known state before every run.
    // -----------------------------------------------------------------------
    usersStore.resetStore();

    // -----------------------------------------------------------------------
    // 1. forgot-password with a registered email returns 200 and generic message
    // -----------------------------------------------------------------------
    const fp1 = await post('/forgot-password', { email: 'student@stu.pes.edu' });
    assert(
      'forgot-password for registered email returns HTTP 200',
      fp1.status === 200,
      fp1
    );
    assert(
      'forgot-password response contains generic message (no enumeration)',
      typeof fp1.data.message === 'string' &&
        fp1.data.message.includes('reset link'),
      fp1.data
    );
    assert(
      'forgot-password response does NOT expose the reset token',
      fp1.data.token === undefined && fp1.data.resetToken === undefined,
      fp1.data
    );

    // -----------------------------------------------------------------------
    // 2. forgot-password with an unregistered email returns identical 200
    //    (user enumeration prevention)
    // -----------------------------------------------------------------------
    const fp2 = await post('/forgot-password', { email: 'nobody@stu.pes.edu' });
    assert(
      'forgot-password for unregistered email returns HTTP 200 (no enumeration)',
      fp2.status === 200,
      fp2
    );
    assert(
      'forgot-password response for unregistered email is identical to registered',
      fp2.data.message === fp1.data.message,
      { registered: fp1.data.message, unregistered: fp2.data.message }
    );

    // -----------------------------------------------------------------------
    // 3. forgot-password with missing email still returns 200
    // -----------------------------------------------------------------------
    const fp3 = await post('/forgot-password', {});
    assert(
      'forgot-password with missing email body returns HTTP 200 (no enumeration)',
      fp3.status === 200,
      fp3
    );

    // -----------------------------------------------------------------------
    // 4. Retrieve the raw reset token from the in-memory store for testing.
    //    (In production the token travels only inside the HTTPS email link.)
    // -----------------------------------------------------------------------
    // Re-trigger forgot-password to get a fresh token record.
    await post('/forgot-password', { email: 'student@stu.pes.edu' });

    // The store exposes findResetToken; we need to iterate the internal map.
    // We obtain the token via the dev console approach: generate a fresh one
    // using storeResetToken directly so the test controls the raw value.
    const TEST_RAW_TOKEN = 'a'.repeat(64); // 32-byte hex equivalent
    const TEST_EXPIRY = Date.now() + 60 * 60 * 1000;
    const studentUser = usersStore.findUserByEmail('student@stu.pes.edu');
    usersStore.storeResetToken(studentUser.id, TEST_RAW_TOKEN, TEST_EXPIRY);

    // -----------------------------------------------------------------------
    // 5. reset-password with valid token and new password succeeds
    // -----------------------------------------------------------------------
    const rp1 = await post('/reset-password', {
      token: TEST_RAW_TOKEN,
      newPassword: 'NewPassword456',
    });
    assert(
      'reset-password with valid token returns HTTP 200',
      rp1.status === 200,
      rp1
    );
    assert(
      'reset-password response contains success message',
      rp1.data.message && rp1.data.message.toLowerCase().includes('reset'),
      rp1.data
    );

    // -----------------------------------------------------------------------
    // 6. Token is invalidated after use (reuse must be rejected)
    // -----------------------------------------------------------------------
    const rp2 = await post('/reset-password', {
      token: TEST_RAW_TOKEN,
      newPassword: 'AnotherPassword789',
    });
    assert(
      'Reuse of consumed reset token is rejected with HTTP 400',
      rp2.status === 400,
      rp2
    );
    assert(
      'Token-reuse rejection uses INVALID_RESET_TOKEN error code',
      rp2.data.error_code === 'INVALID_RESET_TOKEN',
      rp2.data
    );

    // -----------------------------------------------------------------------
    // 7. Login succeeds with the new password after reset
    // -----------------------------------------------------------------------
    const loginNew = await post('/login', {
      email: 'student@stu.pes.edu',
      password: 'NewPassword456',
    });
    assert(
      'Login succeeds with new password after reset (HTTP 200)',
      loginNew.status === 200 && typeof loginNew.data.token === 'string',
      loginNew.data
    );

    // -----------------------------------------------------------------------
    // 8. Login with old password fails after reset
    // -----------------------------------------------------------------------
    const loginOld = await post('/login', {
      email: 'student@stu.pes.edu',
      password: 'student123',
    });
    assert(
      'Login with old password is rejected after reset (HTTP 401)',
      loginOld.status === 401,
      loginOld.data
    );

    // -----------------------------------------------------------------------
    // 9. Expired token is rejected
    // -----------------------------------------------------------------------
    usersStore.resetStore();
    const tpoUser = usersStore.findUserByEmail('tpo@pes.edu');
    const EXPIRED_TOKEN = 'b'.repeat(64);
    const PAST_EXPIRY = Date.now() - 1000; // already expired
    usersStore.storeResetToken(tpoUser.id, EXPIRED_TOKEN, PAST_EXPIRY);

    const rp3 = await post('/reset-password', {
      token: EXPIRED_TOKEN,
      newPassword: 'NewTpoPassword456',
    });
    assert(
      'Expired reset token is rejected with HTTP 400',
      rp3.status === 400,
      rp3
    );
    assert(
      'Expired token rejection uses RESET_TOKEN_EXPIRED error code',
      rp3.data.error_code === 'RESET_TOKEN_EXPIRED',
      rp3.data
    );

    // -----------------------------------------------------------------------
    // 10. reset-password with completely invalid/unknown token is rejected
    // -----------------------------------------------------------------------
    const rp4 = await post('/reset-password', {
      token: 'totally-fake-token-that-was-never-issued',
      newPassword: 'SomeNewPassword456',
    });
    assert(
      'Invalid/unknown reset token is rejected with HTTP 400',
      rp4.status === 400 && rp4.data.error_code === 'INVALID_RESET_TOKEN',
      rp4
    );

    // -----------------------------------------------------------------------
    // 11. reset-password missing token field
    // -----------------------------------------------------------------------
    const rp5 = await post('/reset-password', { newPassword: 'SomePassword123' });
    assert(
      'reset-password missing token returns HTTP 400 VALIDATION_ERROR',
      rp5.status === 400 && rp5.data.error_code === 'VALIDATION_ERROR',
      rp5
    );

    // -----------------------------------------------------------------------
    // 12. reset-password missing newPassword field
    // -----------------------------------------------------------------------
    const rp6 = await post('/reset-password', { token: 'some-token' });
    assert(
      'reset-password missing newPassword returns HTTP 400 VALIDATION_ERROR',
      rp6.status === 400 && rp6.data.error_code === 'VALIDATION_ERROR',
      rp6
    );

    // -----------------------------------------------------------------------
    // 13. reset-password with password shorter than 6 characters is rejected
    // -----------------------------------------------------------------------
    const shortPassToken = 'c'.repeat(64);
    const studentUser2 = usersStore.findUserByEmail('student@stu.pes.edu');
    usersStore.storeResetToken(studentUser2.id, shortPassToken, Date.now() + 60000);
    const rp7 = await post('/reset-password', {
      token: shortPassToken,
      newPassword: 'abc',
    });
    assert(
      'reset-password with short password returns HTTP 400 VALIDATION_ERROR',
      rp7.status === 400 && rp7.data.error_code === 'VALIDATION_ERROR',
      rp7
    );

    // -----------------------------------------------------------------------
    // 14. Response never contains a passwordHash
    // -----------------------------------------------------------------------
    assert(
      'forgot-password response does not contain passwordHash',
      fp1.data.passwordHash === undefined && !JSON.stringify(fp1.data).includes('$2'),
      fp1.data
    );

    // -----------------------------------------------------------------------
    // REGRESSION – 15. Seeded student login still works (existing flow)
    // -----------------------------------------------------------------------
    usersStore.resetStore();
    const loginStudent = await post('/login', {
      email: 'student@stu.pes.edu',
      password: 'student123',
    });
    assert(
      '[Regression] Seeded student login continues working after password-reset module added',
      loginStudent.status === 200 && typeof loginStudent.data.token === 'string',
      loginStudent.data
    );

    // -----------------------------------------------------------------------
    // REGRESSION – 16. Seeded TPO login still works
    // -----------------------------------------------------------------------
    const loginTPO = await post('/login', {
      email: 'tpo@pes.edu',
      password: 'tpo123',
    });
    assert(
      '[Regression] Seeded TPO login continues working after password-reset module added',
      loginTPO.status === 200 && typeof loginTPO.data.token === 'string',
      loginTPO.data
    );

    // -----------------------------------------------------------------------
    // REGRESSION – 17. Registration flow still works
    // -----------------------------------------------------------------------
    const regRes = await post('/register', {
      email: 'newstudent@stu.pes.edu',
      password: 'password123',
    });
    assert(
      '[Regression] Registration returns HTTP 200 after password-reset module added',
      regRes.status === 200 && regRes.data.message === 'OTP sent to institutional email',
      regRes.data
    );

    // -----------------------------------------------------------------------
    // REGRESSION – 18. OTP verification still works
    // -----------------------------------------------------------------------
    const pending = usersStore.getPendingRegistration('newstudent@stu.pes.edu');
    const verifyRes = await post('/verify-otp', {
      email: 'newstudent@stu.pes.edu',
      otp: pending.otp,
    });
    assert(
      '[Regression] OTP verification returns HTTP 201 after password-reset module added',
      verifyRes.status === 201 && typeof verifyRes.data.studentId === 'number',
      verifyRes.data
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
