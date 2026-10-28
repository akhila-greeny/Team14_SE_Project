const fs = require('fs');
const path = require('path');
const express = require('express');
const { isBcryptHash } = require('./utils/password');
const usersStore = require('./data/usersStore');
const authRouter = require('./routes/auth');

let passed = 0;
let failed = 0;

function assert(description, condition, details) {
  if (condition) {
    console.log('[PASS] ' + description);
    passed++;
  } else {
    console.error('[FAIL] ' + description);
    if (details) console.error('       Details: ' + JSON.stringify(details));
    failed++;
  }
}

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js') && !name.startsWith('test-') && name !== 'make-token.js') out.push(full);
  }
  return out;
}

console.log('====================================================');
console.log('TEST SUITE: No plain-text sensitive data');
console.log('Requirement: OIPP-NF-003 / Issue #23 (TC-Sec-01)');
console.log('====================================================\n');

(async () => {
  usersStore.resetStore();

  // 1. Stored users hold hashes only
  const users = usersStore.listUsers();
  assert('Every stored user has a bcrypt hash', users.length > 0 && users.every((u) => isBcryptHash(u.passwordHash)));
  assert('No stored user has a plain "password" field', users.every((u) => u.password === undefined));
  const stored = JSON.stringify(users);
  assert('Stored data does not contain the seeded plain passwords', !stored.includes('student123') && !stored.includes('tpo123'));

  // 2. Run register, verify and login in-process and capture what the server logs
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  const server = app.listen(0);
  const BASE = 'http://127.0.0.1:' + server.address().port + '/api/auth';

  async function post(p, body) {
    const res = await fetch(BASE + p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, text: await res.text() };
  }

  const PLAIN = 'myPlainTextPassw0rd';
  const WRONG = 'wrong-password-xyz';
  const email = 'nf003check@stu.pes.edu';

  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => { logs.push(args.join(' ')); };

  const reg = await post('/register', { email, password: PLAIN });
  const otp = usersStore.getPendingRegistration(email).otp;
  const ver = await post('/verify-otp', { email, otp });
  const login = await post('/login', { email, password: PLAIN });
  const bad = await post('/login', { email, password: WRONG });

  console.log = originalLog;
  server.close();

  const newUser = usersStore.findUserByEmail(email);
  assert(
    'Newly registered user is stored as a bcrypt hash only',
    newUser && isBcryptHash(newUser.passwordHash) && newUser.password === undefined && !JSON.stringify(newUser).includes(PLAIN)
  );

  // 3. API responses
  const responses = [reg.text, ver.text, login.text, bad.text];
  assert('No API response contains the plain password', responses.every((t) => !t.includes(PLAIN) && !t.includes(WRONG)));
  assert('No API response contains a password hash', responses.every((t) => !/\$2[aby]\$/.test(t) && !t.includes('passwordHash')));
  assert('Register response does not contain the OTP', !reg.text.includes(otp));

  // 4. Server logs
  const joined = logs.join('\n');
  assert('Server logs never contain a plain password', !joined.includes(PLAIN) && !joined.includes(WRONG));
  assert('Server logs never contain a JWT', !/eyJ[A-Za-z0-9_-]{10,}/.test(joined));
  assert('Server logs never contain a password hash', !/\$2[aby]\$/.test(joined));

  // 5. Static scan of the source for risky console statements
  const risky = /password|hash|token|otp|authorization|secret/i;
  const hits = [];
  let knownOtpLines = 0;
  for (const file of walk(__dirname, [])) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/console\.(log|error|warn|info)/.test(line) && risky.test(line)) {
        if (line.includes('[AUTH OTP DEV]')) knownOtpLines++;
        else hits.push(path.relative(__dirname, file) + ':' + (i + 1) + ' ' + line.trim());
      }
    });
  }
  assert('No console statement prints passwords, hashes, tokens or secrets', hits.length === 0, hits);
  console.log('[NOTE] Known exception: ' + knownOtpLines + ' dev-only OTP console line (documented in docs/deviations.md)');

  console.log('\n====================================================');
  console.log('TEST SUMMARY: ' + passed + ' passed, ' + failed + ' failed');
  console.log('====================================================');
  process.exit(failed > 0 ? 1 : 0);
})();
