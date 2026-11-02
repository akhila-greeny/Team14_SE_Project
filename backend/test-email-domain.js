// Issue #28: run with  node test-email-domain.js
const { isInstitutionEmail } = require('./utils/emailDomain');

const cases = [
  ['Valid student email', 'pes2ug24cs023@stu.pes.edu', true],
  ['Valid staff email', 'tpo@pes.edu', true],
  ['Wrong domain', 'student@gmail.com', false],
  ['Uppercase + spaces', '  PES2UG24CS023@STU.PES.EDU  ', true],
  ['Empty string', '', false],
  ['Missing value', undefined, false],
];

let failed = 0;
for (const [label, input, expected] of cases) {
  const actual = isInstitutionEmail(input);
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(input)} -> ${actual} (expected ${expected})`);
}
console.log(failed ? `${failed} failed` : 'All passed');
process.exit(failed ? 1 : 0);
