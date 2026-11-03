/**
 * TEST SUITE: Response Time Under 3 Seconds
 * Requirement: OIPP-NF-001 / Issue #21
 * Acceptance criterion: p90 <= 3000 ms for all representative endpoints.
 *
 * Covered endpoints (SRS NF-001 list):
 *   POST /api/auth/login          student credentials (bcrypt verify)
 *   GET  /api/profile             student profile
 *   GET  /api/drives/eligible     eligible placement drives
 *   GET  /api/applications        student applications
 *   GET  /api/notifications       student notifications
 *   GET  /api/reports/stats       TPO placement statistics
 *
 * Measurement approach:
 *   50 iterations × 10 concurrency per endpoint, measured against a local
 *   in-process HTTP server.  p90 is calculated from all successful response
 *   times.  Errors are counted separately and cause the test to fail.
 *
 * This test file is independent of test-load.js (OIPP-NF-005 / Issue #25).
 *
 * Run: node test-response-time.js
 */

'use strict';

const express = require('express');
const http    = require('http');
const jwt     = require('jsonwebtoken');

const authRouter            = require('./routes/auth');
const drivesRouter          = require('./routes/drives');
const profileRouter         = require('./routes/profile');
const eligibleDrivesRouter  = require('./routes/eligibleDrives');
const applyRouter           = require('./routes/apply');
const applicationStatusRouter = require('./routes/applicationStatus');
const notificationsRouter   = require('./routes/notifications');
const reportsRouter         = require('./routes/reports');

const usersStore    = require('./data/usersStore');
const profilesStore = require('./data/profilesStore');
const drivesStore   = require('./data/drivesStore');
const { addApplication } = require('./data/applicationsStore');
const { STUDENT, TPO } = require('./utils/roles');

const SECRET       = process.env.JWT_SECRET || 'dev-secret';
const ITERATIONS   = 50;    // requests per endpoint
const CONCURRENCY  = 10;    // parallel requests per batch
const P90_LIMIT_MS = 3000;  // SRS acceptance threshold

let passed = 0;
let failed = 0;

function assert(description, condition, details) {
  if (condition) {
    console.log(`[PASS] ${description}`);
    passed++;
  } else {
    console.error(`[FAIL] ${description}`);
    if (details !== undefined) console.error(`       Details: ${JSON.stringify(details)}`);
    failed++;
  }
}

function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return 0;
  const i = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1);
  return sortedAsc[i];
}

function doRequest(port, method, path, body, token) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const opts = {
      hostname: '127.0.0.1', port, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const t0 = performance.now();
    const req = http.request(opts, (res) => {
      res.resume();
      res.on('end', () => resolve({ ok: res.statusCode < 500, ms: performance.now() - t0 }));
    });
    req.on('error', () => resolve({ ok: false, ms: performance.now() - t0 }));
    if (payload) req.write(payload);
    req.end();
  });
}

async function measureEndpoint(label, port, method, path, body, token) {
  const times = [];
  let errors  = 0;
  for (let done = 0; done < ITERATIONS; done += CONCURRENCY) {
    const batch = Math.min(CONCURRENCY, ITERATIONS - done);
    const results = await Promise.all(
      Array.from({ length: batch }, () => doRequest(port, method, path, body, token))
    );
    for (const r of results) {
      if (r.ok) times.push(r.ms);
      else errors++;
    }
  }
  const sorted = [...times].sort((a, b) => a - b);
  const p90    = percentile(sorted, 90);
  const p50    = percentile(sorted, 50);
  const avg    = times.length ? times.reduce((s, v) => s + v, 0) / times.length : 0;

  return { label, p50, p90, avg, errors, count: times.length + errors };
}

console.log('====================================================');
console.log('TEST SUITE: Response Time Under 3 Seconds');
console.log('Requirement: OIPP-NF-001 / Issue #21');
console.log(`Iterations per endpoint: ${ITERATIONS}, Concurrency: ${CONCURRENCY}`);
console.log(`Acceptance criterion: p90 <= ${P90_LIMIT_MS} ms`);
console.log('====================================================\n');

(async () => {
  // ---- Build and seed the app ----
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/drives', drivesRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/drives', eligibleDrivesRouter);
  app.use('/api', applyRouter);
  app.use('/api', applicationStatusRouter);
  app.use('/api', notificationsRouter);
  app.use('/api', reportsRouter);

  usersStore.resetStore();
  const studentUser = usersStore.findUserByEmail('student@stu.pes.edu');
  const tpoUser     = usersStore.findUserByEmail('tpo@pes.edu');

  profilesStore.saveProfile(studentUser.id, {
    branch: 'CSE', cgpa: 8.5, backlogs: 0,
    skills: ['JavaScript', 'Node.js'], contact: '9876543210',
  });

  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  drivesStore.addDrive({
    company: 'TestCorp', role: 'SDE', package: '12 LPA',
    eligibility: { minCgpa: 7.0, branches: ['CSE', 'ISE'], maxBacklogs: 2 },
    deadline: futureDate,
  });
  addApplication(studentUser.id, 1);

  const server = http.createServer(app);
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;

  const studentToken = jwt.sign({ id: studentUser.id, role: STUDENT }, SECRET);
  const tpoToken     = jwt.sign({ id: tpoUser.id,     role: TPO     }, SECRET);

  try {
    // ---- Measure each endpoint ----
    const endpoints = [
      { label: 'POST /api/auth/login',       method: 'POST', path: '/api/auth/login',     body: { email: 'student@stu.pes.edu', password: 'student123' }, token: null },
      { label: 'GET  /api/profile',          method: 'GET',  path: '/api/profile',         body: null, token: studentToken },
      { label: 'GET  /api/drives/eligible',  method: 'GET',  path: '/api/drives/eligible', body: null, token: studentToken },
      { label: 'GET  /api/applications',     method: 'GET',  path: '/api/applications',    body: null, token: studentToken },
      { label: 'GET  /api/notifications',    method: 'GET',  path: '/api/notifications',   body: null, token: studentToken },
      { label: 'GET  /api/reports/stats',    method: 'GET',  path: '/api/reports/stats',   body: null, token: tpoToken      },
    ];

    const results = [];
    for (const ep of endpoints) {
      const r = await measureEndpoint(ep.label, port, ep.method, ep.path, ep.body, ep.token);
      results.push(r);
      console.log(
        `  ${ep.label.padEnd(30)} p50=${r.p50.toFixed(0).padStart(5)} ms  ` +
        `p90=${r.p90.toFixed(0).padStart(5)} ms  avg=${r.avg.toFixed(0).padStart(5)} ms  ` +
        `n=${r.count}  err=${r.errors}`
      );
    }

    console.log('');

    // ---- Assert p90 for each endpoint ----
    for (const r of results) {
      assert(
        `${r.label} — p90 ${r.p90.toFixed(0)} ms <= ${P90_LIMIT_MS} ms`,
        r.p90 <= P90_LIMIT_MS,
        { p90: r.p90, limit: P90_LIMIT_MS }
      );
    }

    // ---- Assert zero errors ----
    const totalErrors = results.reduce((s, r) => s + r.errors, 0);
    assert(
      `Zero HTTP errors across all ${ITERATIONS * endpoints.length} requests`,
      totalErrors === 0,
      { totalErrors }
    );

    // ---- Overall p90 (worst endpoint) ----
    const worstP90 = Math.max(...results.map((r) => r.p90));
    assert(
      `Overall worst-endpoint p90 ${worstP90.toFixed(0)} ms <= ${P90_LIMIT_MS} ms (NF-001 acceptance)`,
      worstP90 <= P90_LIMIT_MS,
      { worstP90, limit: P90_LIMIT_MS }
    );

  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
  else process.exit(0);
})();

