const {
  SALT_ROUNDS,
  isBcryptHash,
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  verifyPasswordSync,
  sanitizeUser,
} = require('./utils/password');

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
console.log('TEST SUITE: Salted Password Hashing Using bcryptjs');
console.log('Requirement: OIPP-SR-002 / Issue #27');
console.log(`Bcrypt Salt Rounds: ${SALT_ROUNDS}`);
console.log('====================================================\n');

(async () => {
  // Test fixture labels - dummy test identifiers, no real passwords used
  const dummyPassword1 = 'sample-dummy-pwd-alpha';
  const dummyPassword2 = 'sample-dummy-pwd-beta';
  const wrongDummyPassword = 'wrong-dummy-attempt';

  // 1. Password is stored as a hash rather than plaintext
  const hash1 = await hashPassword(dummyPassword1);
  assert(
    'Password is stored as a salted bcrypt hash rather than plaintext',
    typeof hash1 === 'string' &&
      hash1 !== dummyPassword1 &&
      hash1.length === 60 &&
      isBcryptHash(hash1),
    { hashLength: hash1.length, isBcrypt: isBcryptHash(hash1) }
  );

  // 2. Hashing the same password independently produces distinct salted hashes
  const hash2 = await hashPassword(dummyPassword1);
  assert(
    'Independent hashing of identical password produces distinct salted hashes',
    hash1 !== hash2 && isBcryptHash(hash1) && isBcryptHash(hash2),
    { hashesDiffer: hash1 !== hash2 }
  );

  // 3. The correct password passes verification (both async and sync)
  const matchAsync = await verifyPassword(dummyPassword1, hash1);
  const matchSync = verifyPasswordSync(dummyPassword1, hash1);
  assert(
    'Correct password passes async verification',
    matchAsync === true,
    { matchAsync }
  );
  assert(
    'Correct password passes synchronous verification',
    matchSync === true,
    { matchSync }
  );

  // 4. An incorrect password fails verification
  const wrongMatch = await verifyPassword(wrongDummyPassword, hash1);
  assert(
    'Incorrect password fails verification',
    wrongMatch === false,
    { wrongMatch }
  );

  // 5. Invalid input handled safely without unhandled exceptions
  let emptyThrows = false;
  try {
    await hashPassword('');
  } catch (err) {
    emptyThrows = err instanceof TypeError;
  }
  assert('Hashing empty string throws TypeError', emptyThrows === true, { emptyThrows });

  let nullThrows = false;
  try {
    await hashPassword(null);
  } catch (err) {
    nullThrows = err instanceof TypeError;
  }
  assert('Hashing null throws TypeError', nullThrows === true, { nullThrows });

  let nonStringThrows = false;
  try {
    await hashPassword(12345);
  } catch (err) {
    nonStringThrows = err instanceof TypeError;
  }
  assert('Hashing non-string throws TypeError', nonStringThrows === true, { nonStringThrows });

  // Verification handles bad candidate/hash inputs safely by returning false
  const verifyNullPass = await verifyPassword(null, hash1);
  const verifyNullHash = await verifyPassword(dummyPassword1, null);
  const verifyCorruptHash = await verifyPassword(dummyPassword1, 'not-a-bcrypt-hash');
  const verifyEmptyPass = await verifyPassword('', hash1);
  assert(
    'Verifying with null/empty/non-string candidate safely returns false',
    verifyNullPass === false && verifyEmptyPass === false,
    { verifyNullPass, verifyEmptyPass }
  );
  assert(
    'Verifying with corrupt or malformed hash safely returns false without crashing',
    verifyNullHash === false && verifyCorruptHash === false,
    { verifyNullHash, verifyCorruptHash }
  );

  // 6. Seeded accounts can be verified using bcryptjs
  // Simulating in-memory store initialization with seeded TPO and Student accounts
  const seededAccounts = [
    {
      id: 1,
      email: 'student@stu.pes.edu',
      role: 'student',
      passwordHash: hashPasswordSync(dummyPassword1),
    },
    {
      id: 2,
      email: 'tpo@pes.edu',
      role: 'TPO',
      passwordHash: hashPasswordSync(dummyPassword2),
    },
  ];

  assert(
    'Seeded student account stores valid bcrypt hash',
    isBcryptHash(seededAccounts[0].passwordHash),
    { studentHashValid: isBcryptHash(seededAccounts[0].passwordHash) }
  );

  assert(
    'Seeded TPO account stores valid bcrypt hash',
    isBcryptHash(seededAccounts[1].passwordHash),
    { tpoHashValid: isBcryptHash(seededAccounts[1].passwordHash) }
  );

  const studentLoginPass = await verifyPassword(dummyPassword1, seededAccounts[0].passwordHash);
  const studentLoginFail = await verifyPassword(wrongDummyPassword, seededAccounts[0].passwordHash);
  assert(
    'Seeded student account authenticates correctly with valid password',
    studentLoginPass === true && studentLoginFail === false,
    { studentLoginPass, studentLoginFail }
  );

  const tpoLoginPass = await verifyPassword(dummyPassword2, seededAccounts[1].passwordHash);
  const tpoLoginFail = await verifyPassword(wrongDummyPassword, seededAccounts[1].passwordHash);
  assert(
    'Seeded TPO account authenticates correctly with valid password',
    tpoLoginPass === true && tpoLoginFail === false,
    { tpoLoginPass, tpoLoginFail }
  );

  // 7. No API response includes a password hash
  const sanitizedStudent = sanitizeUser(seededAccounts[0]);
  assert(
    'sanitizeUser strips passwordHash from user object',
    sanitizedStudent.passwordHash === undefined &&
      sanitizedStudent.password === undefined &&
      sanitizedStudent.id === 1 &&
      sanitizedStudent.email === 'student@stu.pes.edu' &&
      sanitizedStudent.role === 'student',
    { sanitizedStudent }
  );

  // Verify that JSON.stringify of sanitized object contains no hash
  const serialized = JSON.stringify(sanitizedStudent);
  assert(
    'Serialized API response contains no password or hash substring',
    !serialized.includes('password') && !serialized.includes('$2'),
    { serialized }
  );

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
