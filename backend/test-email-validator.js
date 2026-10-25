const {
  APPROVED_DOMAIN,
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
console.log(`Confirmed Domain: @${APPROVED_DOMAIN}`);
console.log('====================================================\n');

// 1. Valid address at the approved domain
{
  const result = validateInstitutionalEmail('pes2ug24cs023@stu.pes.edu');
  assert(
    'Valid student email at approved domain is accepted',
    result.isValid === true && result.normalized === 'pes2ug24cs023@stu.pes.edu' && result.error === null,
    result
  );

  const resultWithPlus = validateInstitutionalEmail('student+placement@stu.pes.edu');
  assert(
    'Valid student email with plus-tag at approved domain is accepted',
    resultWithPlus.isValid === true && resultWithPlus.normalized === 'student+placement@stu.pes.edu',
    resultWithPlus
  );
}

// 2. Address at a different domain
{
  const gmail = validateInstitutionalEmail('student@gmail.com');
  assert(
    'External domain (gmail.com) is rejected',
    gmail.isValid === false && gmail.error.includes('Email domain must be @stu.pes.edu'),
    gmail
  );

  const generalPes = validateInstitutionalEmail('student@pes.edu');
  assert(
    'Different institution sub-domain (pes.edu) is rejected',
    generalPes.isValid === false && generalPes.error.includes('Email domain must be @stu.pes.edu'),
    generalPes
  );

  const yahoo = validateInstitutionalEmail('student@yahoo.co.in');
  assert('External domain (yahoo.co.in) is rejected', yahoo.isValid === false, yahoo);
}

// 3. Malformed address
{
  const noAt = validateInstitutionalEmail('studentstypesedu');
  assert('Malformed address without @ is rejected', noAt.isValid === false && noAt.error === 'Malformed email address', noAt);

  const doubleAt = validateInstitutionalEmail('student@@stu.pes.edu');
  assert('Malformed address with multiple @ is rejected', doubleAt.isValid === false && doubleAt.error === 'Malformed email address', doubleAt);

  const missingUser = validateInstitutionalEmail('@stu.pes.edu');
  assert('Malformed address missing local part is rejected', missingUser.isValid === false && missingUser.error === 'Malformed email address', missingUser);

  const missingDomain = validateInstitutionalEmail('student@');
  assert('Malformed address missing domain part is rejected', missingDomain.isValid === false && missingDomain.error === 'Malformed email address', missingDomain);

  const consecutiveDots = validateInstitutionalEmail('student@stu..pes.edu');
  assert('Malformed address with consecutive dots in domain is rejected', consecutiveDots.isValid === false && consecutiveDots.error === 'Malformed email address', consecutiveDots);

  const trailingDot = validateInstitutionalEmail('student@stu.pes.edu.');
  assert('Malformed address with trailing dot in domain is rejected', trailingDot.isValid === false && trailingDot.error === 'Malformed email address', trailingDot);
}

// 4. Lookalike or suffix-extended domains (security boundary checks)
{
  const suffixExtended = validateInstitutionalEmail('student@stu.pes.edu.attacker.com');
  assert(
    'Suffix-extended domain (stu.pes.edu.attacker.com) is rejected',
    suffixExtended.isValid === false && suffixExtended.error.includes('Email domain must be @stu.pes.edu'),
    suffixExtended
  );

  const orgExtended = validateInstitutionalEmail('student@stu.pes.edu.org');
  assert(
    'Suffix-extended domain (.org) is rejected',
    orgExtended.isValid === false,
    orgExtended
  );

  const prefixLookalike = validateInstitutionalEmail('student@fakestu.pes.edu');
  assert(
    'Prefix lookalike domain (fakestu.pes.edu) is rejected',
    prefixLookalike.isValid === false,
    prefixLookalike
  );

  const subDomain = validateInstitutionalEmail('student@cs.stu.pes.edu');
  assert(
    'Unapproved sub-domain (cs.stu.pes.edu) is rejected',
    subDomain.isValid === false,
    subDomain
  );
}

// 5. Uppercase email characters
{
  const uppercase = validateInstitutionalEmail('PES2UG24CS023@STU.PES.EDU');
  assert(
    'Uppercase email is accepted and properly normalized to lowercase',
    uppercase.isValid === true && uppercase.normalized === 'pes2ug24cs023@stu.pes.edu',
    uppercase
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
  const whitespacePadded = validateInstitutionalEmail('   student@stu.pes.edu   ');
  assert(
    'Leading and trailing whitespace is trimmed and accepted',
    whitespacePadded.isValid === true && whitespacePadded.normalized === 'student@stu.pes.edu',
    whitespacePadded
  );

  const newlinePadded = validateInstitutionalEmail('\n\tstudent@stu.pes.edu\t\r\n');
  assert(
    'Whitespace with newlines and tabs is trimmed and accepted',
    newlinePadded.isValid === true && newlinePadded.normalized === 'student@stu.pes.edu',
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
  const raw1 = 'Student1@STU.PES.EDU';
  const raw2 = '   student1@stu.pes.edu   ';
  const raw3 = 'STUDENT1@stu.pes.edu';

  const norm1 = normalizeEmail(raw1);
  const norm2 = normalizeEmail(raw2);
  const norm3 = normalizeEmail(raw3);

  assert(
    'Different casing and whitespace representations normalize to exact identical value',
    norm1 === 'student1@stu.pes.edu' && norm1 === norm2 && norm2 === norm3,
    { norm1, norm2, norm3 }
  );

  // Demonstrate duplicate detection in a Set or Map
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
