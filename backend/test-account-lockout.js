/**
 * TEST SUITE: Account Lockout After Failed Login Attempts
 * Requirement: OIPP-SR-004 / Issue #29
 *
 * Covers:
 *  1.  Single failed attempt – counter increments, account not locked
 *  2.  Four failed attempts – account not yet locked
 *  3.  Fifth failed attempt triggers 15-minute lockout
 *  4.  Correct credentials during lockout are still rejected
 *  5.  Login succeeds after lockout period expires (time manipulation)
 *  6.  Successful login resets the failed-attempt counter
 *  7.  Independent counters for different accounts
 *  8.  Existing valid login behaviour preserved (regression)
 *  9.  Missing / invalid request data handled safely
 *  10. Password reset flow unaffected by lockout (regression)
 *
 * Run: node test-account-lockout.js
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
console.log('TEST SUITE: Account Lockout After Failed Logins');
console.log('Requirement: OIPP-SR-004 / Issue #29');
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

  /** Helper: reset to clean state and return the live student user object. */
  function resetAndGetStudent() {
    usersStore.resetStore();
    return usersStore.findUserByEmail('student@stu.pes.edu');
  }

  try {
    // -----------------------------------------------------------------------
    // TEST 1: Single failed attempt – account NOT locked yet
    // -----------------------------------------------------------------------
    resetAndGetStudent();

    const fail1 = await post('/login', {
      email: 'student@stu.pes.edu',
      password: 'wrong-password',
    });
    const userAfter1 = usersStore.findUserByEmail('student@stu.pes.edu');

    assert(
      'One failed attempt returns HTTP 401 UNAUTHORIZED',
      fail1.status === 401 && fail1.data.error_code === 'UNAUTHORIZED',
      fail1.data
    );
    assert(
      'Failed-login counter is 1 after one bad attempt',
      userAfter1.failedLoginAttempts === 1,
      { failedLoginAttempts: userAfter1.failedLoginAttempts }
    );
    assert(
      'Account is NOT locked after one failed attempt',
      !usersStore.isAccountLocked(userAfter1),
      { lockedUntil: userAfter1.lockedUntil }
    );

    // -----------------------------------------------------------------------
    // TEST 2: Four failed attempts – account still NOT locked
    // -----------------------------------------------------------------------
    resetAndGetStudent();

    for (let i = 0; i < 4; i++) {
      await post('/login', { email: 'student@stu.pes.edu', password: 'wrong' });
    }
    const userAfter4 = usersStore.findUserByEmail('student@stu.pes.edu');

    assert(
      'Four failed attempts: account NOT yet locked',
      !usersStore.isAccountLocked(userAfter4),
      { failedLoginAttempts: userAfter4.failedLoginAttempts, lockedUntil: userAfter4.lockedUntil }
    );
    assert(
      'Failed-login counter is exactly 4 after four bad attempts',
      userAfter4.failedLoginAttempts === 4,
      { failedLoginAttempts: userAfter4.failedLoginAttempts }
    );

    // -----------------------------------------------------------------------
    // TEST 3: Fifth failed attempt triggers lockout
    // -----------------------------------------------------------------------
    const fail5 = await post('/login', { email: 'student@stu.pes.edu', password: 'wrong' });
    const userAfterLock = usersStore.findUserByEmail('student@stu.pes.edu');

    assert(
      'Fifth failed attempt returns HTTP 423 ACCOUNT_LOCKED',
      fail5.status === 423 && fail5.data.error_code === 'ACCOUNT_LOCKED',
      fail5.data
    );
    assert(
      'Account IS locked after five failed attempts',
      usersStore.isAccountLocked(userAfterLock),
      { lockedUntil: userAfterLock.lockedUntil }
    );
    assert(
      'Lockout message does not disclose password or hash',
      typeof fail5.data.message === 'string' &&
        !fail5.data.message.toLowerCase().includes('password') &&
        !JSON.stringify(fail5.data).includes('$2'),
      fail5.data
    );
    assert(
      'lockedUntil is approximately 15 minutes in the future',
      userAfterLock.lockedUntil > Date.now() &&
        userAfterLock.lockedUntil <= Date.now() + 15 * 60 * 1000 + 1000,
      { lockedUntil: userAfterLock.lockedUntil, now: Date.now() }
    );

    // -----------------------------------------------------------------------
    // TEST 4: Correct credentials during lockout are STILL rejected
    // -----------------------------------------------------------------------
    const correctDuringLock = await post('/login', {
      email: 'student@stu.pes.edu',
      password: 'student123',
    });
    assert(
      'Correct password during lockout is still rejected (HTTP 423)',
      correctDuringLock.status === 423 && correctDuringLock.data.error_code === 'ACCOUNT_LOCKED',
      correctDuringLock.data
    );

    // -----------------------------------------------------------------------
    // TEST 5: Login succeeds AFTER lockout period has expired
    // -----------------------------------------------------------------------
    // Artificially expire the lock by setting lockedUntil to the past.
    const lockedUser = usersStore.findUserByEmail('student@stu.pes.edu');
    lockedUser.lockedUntil = Date.now() - 1000; // 1 second ago

    const afterExpiry = await post('/login', {
      email: 'student@stu.pes.edu',
      password: 'student123',
    });
    assert(
      'Login succeeds after lockout expiry (HTTP 200)',
      afterExpiry.status === 200 && typeof afterExpiry.data.token === 'string',
      afterExpiry.data
    );

    // -----------------------------------------------------------------------
    // TEST 6: Successful login resets the failed-attempt counter
    // -----------------------------------------------------------------------
    const userAfterSuccess = usersStore.findUserByEmail('student@stu.pes.edu');
    assert(
      'Successful login resets failedLoginAttempts to 0',
      userAfterSuccess.failedLoginAttempts === 0,
      { failedLoginAttempts: userAfterSuccess.failedLoginAttempts }
    );
    assert(
      'Successful login clears lockedUntil',
      userAfterSuccess.lockedUntil === null,
      { lockedUntil: userAfterSuccess.lockedUntil }
    );

    // -----------------------------------------------------------------------
    // TEST 7: Independent counters for different accounts
    // -----------------------------------------------------------------------
    usersStore.resetStore();

    // Fail 5 times for student only
    for (let i = 0; i < 5; i++) {
      await post('/login', { email: 'student@stu.pes.edu', password: 'wrong' });
    }

    const lockedStudent = usersStore.findUserByEmail('student@stu.pes.edu');
    const tpoUser = usersStore.findUserByEmail('tpo@pes.edu');

    assert(
      'Student account is locked after 5 failures',
      usersStore.isAccountLocked(lockedStudent),
      { lockedUntil: lockedStudent.lockedUntil }
    );
    assert(
      'TPO account is NOT locked (independent counter)',
      !usersStore.isAccountLocked(tpoUser) && tpoUser.failedLoginAttempts === 0,
      { tpoLocked: usersStore.isAccountLocked(tpoUser), tpoAttempts: tpoUser.failedLoginAttempts }
    );

    // TPO can still log in successfully
    const tpoLogin = await post('/login', { email: 'tpo@pes.edu', password: 'tpo123' });
    assert(
      'TPO login succeeds independently while student is locked (HTTP 200)',
      tpoLogin.status === 200 && typeof tpoLogin.data.token === 'string',
      tpoLogin.data
    );

    // -----------------------------------------------------------------------
    // TEST 8: 6th+ failed attempt while locked still returns 423 (not 401)
    // -----------------------------------------------------------------------
    const fail6 = await post('/login', { email: 'student@stu.pes.edu', password: 'wrong' });
    assert(
      'Subsequent failed attempt while locked returns HTTP 423 (not 401)',
      fail6.status === 423 && fail6.data.error_code === 'ACCOUNT_LOCKED',
      fail6.data
    );

    // -----------------------------------------------------------------------
    // TEST 9: Missing / invalid request data handled safely
    // -----------------------------------------------------------------------
    usersStore.resetStore();

    const missingBoth = await post('/login', {});
    assert(
      'Missing email and password returns HTTP 400 VALIDATION_ERROR',
      missingBoth.status === 400 && missingBoth.data.error_code === 'VALIDATION_ERROR',
      missingBoth.data
    );

    const missingPassword = await post('/login', { email: 'student@stu.pes.edu' });
    assert(
      'Missing password returns HTTP 400 VALIDATION_ERROR',
      missingPassword.status === 400 && missingPassword.data.error_code === 'VALIDATION_ERROR',
      missingPassword.data
    );

    // Validation errors must NOT increment any lockout counter
    const userAfterValidation = usersStore.findUserByEmail('student@stu.pes.edu');
    assert(
      'Validation errors do NOT increment failed-login counter',
      userAfterValidation.failedLoginAttempts === 0,
      { failedLoginAttempts: userAfterValidation.failedLoginAttempts }
    );

    // -----------------------------------------------------------------------
    // REGRESSION 10: Standard valid login still works (token contract preserved)
    // -----------------------------------------------------------------------
    usersStore.resetStore();

    const validLogin = await post('/login', {
      email: 'student@stu.pes.edu',
      password: 'student123',
    });
    assert(
      '[Regression] Valid student login returns HTTP 200 with token/studentId/expiresIn',
      validLogin.status === 200 &&
        typeof validLogin.data.token === 'string' &&
        typeof validLogin.data.studentId === 'number' &&
        validLogin.data.expiresIn === '8h',
      validLogin.data
    );

    // -----------------------------------------------------------------------
    // REGRESSION 11: Password reset flow still works with lockout present
    // -----------------------------------------------------------------------
    await post('/forgot-password', { email: 'student@stu.pes.edu' });
    const studentUser = usersStore.findUserByEmail('student@stu.pes.edu');
    const TEST_RESET_TOKEN = 'd'.repeat(64);
    usersStore.storeResetToken(studentUser.id, TEST_RESET_TOKEN, Date.now() + 60000);

    const resetRes = await post('/reset-password', {
      token: TEST_RESET_TOKEN,
      newPassword: 'BrandNewPassword123',
    });
    assert(
      '[Regression] Password reset still works with lockout module present (HTTP 200)',
      resetRes.status === 200,
      resetRes.data
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
