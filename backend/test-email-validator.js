const {
  APPROVED_DOMAINS,
  normalizeEmail,
  validateInstitutionalEmail,
} = require('./utils/emailValidator');

let passed = 0;
let failed = 0;

function assert(description, condition, actualDetails) {
  if (condition) {
    console.log(`[PASS] ${description}`);
    passed++;
  } else {
    console.error(`[FAIL] ${description}`);
    if (actualDetails) {
      console.error(`       Details: ${JSON.stringify(actualDetails)}`);
    }
    failed++;
  }
}

console.log('====================================================');
console.log(`TEST SUITE: Institutional Email Domain Validation`);
console.log(`Requirement: OIPP-SR-003 / Issue #28`);
console.log(`Approved Domains: ${APPROVED_DOMAINS.map((d) => '@' + d).join(', ')}`);
console.log('====================================================\n');

// 1. Valid address at the approved domains (stu.pes.edu for students and pes.edu for teachers/TPO)
{
  const studentResult = validateInstitutionalEmail('pes2ug24cs023@stu.pes.edu');
  assert(
    'Valid student email at @stu.pes.edu is accepted',
    studentResult.isValid === true && studentResult.normalized === 'pes2ug24cs023@stu.pes.edu' && studentResult.error === null,
    studentResult
  );

  const teacherResult = validateInstitutionalEmail('faculty.member@pes.edu');
  assert(
    'Valid teacher/faculty email at @pes.edu is accepted',
    teacherResult.isValid === true && teacherResult.normalized === 'faculty.member@pes.edu' && teacherResult.error === null,
    teacherResult
  );

  const tpoResult = validateInstitutionalEmail('tpo@pes.edu');
  assert(
    'Valid TPO email at @pes.edu is accepted',
    tpoResult.isValid === true && tpoResult.normalized === 'tpo@pes.edu' && tpoResult.error === null,
    tpoResult
  );

  const resultWithPlus = validateInstitutionalEmail('student+placement@stu.pes.edu');
  assert(
    'Valid student email with plus-tag at @stu.pes.edu is accepted',
    resultWithPlus.isValid === true && resultWithPlus.normalized === 'student+placement@stu.pes.edu',
    resultWithPlus
  );
}

// 2. Address at a different / external domain
{
  const gmail = validateInstitutionalEmail('student@gmail.com');
  assert(
    'External domain (gmail.com) is rejected',
    gmail.isValid === false && gmail.error.includes('@stu.pes.edu') && gmail.error.includes('@pes.edu'),
    gmail
  );

  const yahoo = validateInstitutionalEmail('teacher@yahoo.co.in');
  assert('External domain (yahoo.co.in) is rejected', yahoo.isValid === false, yahoo);

  const hotmail = validateInstitutionalEmail('user@hotmail.com');
  assert('External domain (hotmail.com) is rejected', hotmail.isValid === false, hotmail);
}

// 3. Malformed address
{
  const noAt = validateInstitutionalEmail('studentstypesedu');
  assert('Malformed address without @ is rejected', noAt.isValid === false && noAt.error === 'Malformed email address', noAt);

  const doubleAt = validateInstitutionalEmail('student@@stu.pes.edu');
  assert('Malformed address with multiple @ is rejected', doubleAt.isValid === false && doubleAt.error === 'Malformed email address', doubleAt);

  const doubleAtTeacher = validateInstitutionalEmail('teacher@@pes.edu');
  assert('Malformed teacher address with multiple @ is rejected', doubleAtTeacher.isValid === false, doubleAtTeacher);

  const missingUser = validateInstitutionalEmail('@stu.pes.edu');
  assert('Malformed address missing local part is rejected', missingUser.isValid === false && missingUser.error === 'Malformed email address', missingUser);

  const missingUserTeacher = validateInstitutionalEmail('@pes.edu');
  assert('Malformed teacher address missing local part is rejected', missingUserTeacher.isValid === false, missingUserTeacher);

  const missingDomain = validateInstitutionalEmail('student@');
  assert('Malformed address missing domain part is rejected', missingDomain.isValid === false && missingDomain.error === 'Malformed email address', missingDomain);

  const consecutiveDots = validateInstitutionalEmail('student@stu..pes.edu');
  assert('Malformed address with consecutive dots in domain is rejected', consecutiveDots.isValid === false && consecutiveDots.error === 'Malformed email address', consecutiveDots);

  const trailingDot = validateInstitutionalEmail('student@stu.pes.edu.');
  assert('Malformed address with trailing dot in domain is rejected', trailingDot.isValid === false && trailingDot.error === 'Malformed email address', trailingDot);
}

// 4. Lookalike or suffix-extended domains (security boundary checks for both domains)
{
  const suffixExtendedStu = validateInstitutionalEmail('student@stu.pes.edu.attacker.com');
  assert(
    'Suffix-extended domain (stu.pes.edu.attacker.com) is rejected',
    suffixExtendedStu.isValid === false,
    suffixExtendedStu
  );

  const suffixExtendedPes = validateInstitutionalEmail('teacher@pes.edu.attacker.com');
  assert(
    'Suffix-extended domain (pes.edu.attacker.com) is rejected',
    suffixExtendedPes.isValid === false,
    suffixExtendedPes
  );

  const orgExtendedPes = validateInstitutionalEmail('teacher@pes.edu.org');
  assert(
    'Suffix-extended domain (.org) is rejected',
    orgExtendedPes.isValid === false,
    orgExtendedPes
  );

  const prefixLookalike = validateInstitutionalEmail('teacher@fakepes.edu');
  assert(
    'Prefix lookalike domain (fakepes.edu) is rejected',
    prefixLookalike.isValid === false,
    prefixLookalike
  );

  const prefixLookalikeStu = validateInstitutionalEmail('student@fakestu.pes.edu');
  assert(
    'Prefix lookalike domain (fakestu.pes.edu) is rejected',
    prefixLookalikeStu.isValid === false,
    prefixLookalikeStu
  );

  const subDomain = validateInstitutionalEmail('student@cs.stu.pes.edu');
  assert(
    'Unapproved sub-domain (cs.stu.pes.edu) is rejected',
    subDomain.isValid === false,
    subDomain
  );

  const subDomainPes = validateInstitutionalEmail('teacher@ece.pes.edu');
  assert(
    'Unapproved sub-domain (ece.pes.edu) is rejected',
    subDomainPes.isValid === false,
    subDomainPes
  );
}

// 5. Uppercase email characters
{
  const uppercaseStu = validateInstitutionalEmail('PES2UG24CS023@STU.PES.EDU');
  assert(
    'Uppercase student email is accepted and properly normalized to lowercase',
    uppercaseStu.isValid === true && uppercaseStu.normalized === 'pes2ug24cs023@stu.pes.edu',
    uppercaseStu
  );

  const uppercaseTeacher = validateInstitutionalEmail('TEACHER@PES.EDU');
  assert(
    'Uppercase teacher email (@PES.EDU) is accepted and properly normalized to lowercase',
    uppercaseTeacher.isValid === true && uppercaseTeacher.normalized === 'teacher@pes.edu',
    uppercaseTeacher
  );

  const mixedCase = validateInstitutionalEmail('Abhirama.HY@Stu.Pes.Edu');
  assert(
    'Mixed-case email is accepted and normalized to lowercase',
    mixedCase.isValid === true && mixedCase.normalized === 'abhirama.hy@stu.pes.edu',
    mixedCase
  );
}

// 6. Leading/trailing whitespace
{
  const whitespacePaddedStu = validateInstitutionalEmail('   student@stu.pes.edu   ');
  assert(
    'Leading and trailing whitespace for stu.pes.edu is trimmed and accepted',
    whitespacePaddedStu.isValid === true && whitespacePaddedStu.normalized === 'student@stu.pes.edu',
    whitespacePaddedStu
  );

  const whitespacePaddedTeacher = validateInstitutionalEmail('   teacher@pes.edu   ');
  assert(
    'Leading and trailing whitespace for pes.edu is trimmed and accepted',
    whitespacePaddedTeacher.isValid === true && whitespacePaddedTeacher.normalized === 'teacher@pes.edu',
    whitespacePaddedTeacher
  );

  const newlinePadded = validateInstitutionalEmail('\n\tteacher@pes.edu\t\r\n');
  assert(
    'Whitespace with newlines and tabs is trimmed and accepted',
    newlinePadded.isValid === true && newlinePadded.normalized === 'teacher@pes.edu',
    newlinePadded
  );
}

// 7. Missing email
{
  const emptyString = validateInstitutionalEmail('');
  assert('Empty string is rejected', emptyString.isValid === false && emptyString.error === 'Email is required', emptyString);

  const whitespaceOnly = validateInstitutionalEmail('   ');
  assert('Whitespace-only string is rejected', whitespaceOnly.isValid === false && whitespaceOnly.error === 'Email is required', whitespaceOnly);

  const nullValue = validateInstitutionalEmail(null);
  assert('null is rejected', nullValue.isValid === false && nullValue.error === 'Email is required', nullValue);

  const undefinedValue = validateInstitutionalEmail(undefined);
  assert('undefined is rejected', undefinedValue.isValid === false && undefinedValue.error === 'Email is required', undefinedValue);

  const numberValue = validateInstitutionalEmail(12345);
  assert('Non-string value is rejected', numberValue.isValid === false && numberValue.error === 'Email is required', numberValue);
}

// 8. Duplicate email normalization
{
  const raw1 = 'Teacher1@PES.EDU';
  const raw2 = '   teacher1@pes.edu   ';
  const raw3 = 'TEACHER1@pes.edu';

  const norm1 = normalizeEmail(raw1);
  const norm2 = normalizeEmail(raw2);
  const norm3 = normalizeEmail(raw3);

  assert(
    'Different casing and whitespace representations normalize to exact identical value',
    norm1 === 'teacher1@pes.edu' && norm1 === norm2 && norm2 === norm3,
    { norm1, norm2, norm3 }
  );

  const registeredEmails = new Set();
  registeredEmails.add(norm1);

  const isDuplicate = registeredEmails.has(norm2);
  assert(
    'Normalized email matches existing registration for duplicate prevention',
    isDuplicate === true,
    { isDuplicate }
  );
}

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
