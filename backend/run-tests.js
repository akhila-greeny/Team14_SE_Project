// CI test runner: node run-tests.js  (or: npm test)
// Runs every self-checking test script one after another and fails if any
// of them exits with a non-zero code. Used by .github/workflows/ci-cd.yml.
//
// Not included (they print "expect X -> got Y" for a person to read and always
// exit 0, and need a separately started server): test-drives, test-rbac,
// test-stats, test-export, test-notifications, test-application-status.
// test-load / run-load.js are a load test (NF-005), too heavy for every push.
const { spawnSync } = require('child_process');
const path = require('path');

const TESTS = [
  // Auth and security
  'test-password.js',
  'test-register.js',
  'test-login.js',
  'test-password-reset.js',
  'test-account-lockout.js',
  'test-email-validator.js',
  'test-email-domain.js',
  'test-no-plaintext.js',
  'test-https-tls.js',
  // Non-functional
  'test-availability.js',
  'test-response-time.js',
  // Mock tests (F-011 to F-013)
  'test-mock-tests.js',
  'test-auto-grade.js',
  'test-attempt-history.js',
  // Mock interviews (F-015, F-016)
  'test-book-interview.js',
  'test-interview-feedback.js',
];

const results = [];
for (const file of TESTS) {
  const started = Date.now();
  console.log(`\n=== ${file} ===`);
  const run = spawnSync(process.execPath, [path.join(__dirname, file)], {
    cwd: __dirname,
    stdio: 'inherit',
    timeout: 120000,
    env: { ...process.env, NODE_ENV: 'test' },
  });
  const ok = run.status === 0;
  results.push({ file, ok, seconds: ((Date.now() - started) / 1000).toFixed(1) });
}

console.log('\n================ TEST SUMMARY ================');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.file.padEnd(28)} ${r.seconds}s`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} test files passed`);
process.exit(failed ? 1 : 0);
