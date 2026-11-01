/**
 * Response-Time Benchmark
 * Requirement: OIPP-NF-001 / Issue #21
 *
 * Measures p50, p90, p95, p99, average, maximum, error count, error rate and
 * throughput for every representative API endpoint listed in the SRS.
 *
 * Covered endpoints
 *   POST /api/auth/login          (student credentials – real bcrypt verify)
 *   GET  /api/profile             (student – in-memory lookup)
 *   GET  /api/drives/eligible     (student – eligibility filter)
 *   GET  /api/applications        (student – own applications)
 *   GET  /api/notifications       (student – notification list)
 *   GET  /api/reports/stats       (TPO    – placement statistics)
 *
 * Usage
 *   node backend/benchmark/bench-response-time.js
 *   node backend/benchmark/bench-response-time.js --iterations 200
 *   node backend/benchmark/bench-response-time.js --concurrency 20
 *
 * All requests hit a local in-process HTTP server (no external process
 * needed).  The server is seeded with a minimal dataset before measuring.
 *
 * NOTE: This script does NOT share or interfere with test-load.js
 * (OIPP-NF-005 / Issue #25 – Aishwarya's load test).  It targets
 * different endpoints, different concurrency levels, and has a separate
 * acceptance metric (p90 <= 3000 ms for NF-001, not the 2000-student
 * concurrent-user scenario of NF-005).
 */

'use strict';

const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');

// ---- route imports (same as server.js) ----
const authRouter            = require('../routes/auth');
const drivesRouter          = require('../routes/drives');
const profileRouter         = require('../routes/profile');
const eligibleDrivesRouter  = require('../routes/eligibleDrives');
const applyRouter           = require('../routes/apply');
const applicationStatusRouter = require('../routes/applicationStatus');
const notificationsRouter   = require('../routes/notifications');
const reportsRouter         = require('../routes/reports');

const usersStore   = require('../data/usersStore');
const profilesStore = require('../data/profilesStore');
const drivesStore  = require('../data/drivesStore');
const { addApplication } = require('../data/applicationsStore');

const { STUDENT, TPO } = require('../utils/roles');
const SECRET = process.env.JWT_SECRET || 'dev-secret';

// CLI args
const args = process.argv.slice(2);
function argVal(name, def) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? Number(args[idx + 1]) : def;
}
const ITERATIONS  = argVal('--iterations', 100);   // requests per endpoint
const CONCURRENCY = argVal('--concurrency', 10);    // parallel requests per batch
const P90_LIMIT_MS = 3000;                          // SRS acceptance threshold

// ---- statistics helpers ----
function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return 0;
  const i = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1);
  return sortedAsc[i];
}

function computeStats(times, errors, durationMs) {
  const sorted = [...times].sort((a, b) => a - b);
  const count  = times.length + errors;
  return {
    count,
    errors,
    errorRate: count ? ((errors / count) * 100).toFixed(1) + '%' : '0.0%',
    avg:  times.length ? times.reduce((s, v) => s + v, 0) / times.length : 0,
    p50:  percentile(sorted, 50),
    p90:  percentile(sorted, 90),
    p95:  percentile(sorted, 95),
    p99:  percentile(sorted, 99),
    max:  sorted[sorted.length - 1] ?? 0,
    throughput: durationMs > 0 ? (count / (durationMs / 1000)).toFixed(2) + ' req/s' : 'N/A',
    meetsP90: percentile(sorted, 90) <= P90_LIMIT_MS,
  };
}

function printStats(label, s) {
  const flag = s.meetsP90 ? '✓' : '✗';
  console.log(
    `  ${flag} ${label.padEnd(28)}` +
    ` n=${String(s.count).padEnd(5)}` +
    ` p50=${String(s.p50.toFixed(0)).padStart(5)} ms` +
    ` p90=${String(s.p90.toFixed(0)).padStart(5)} ms` +
    ` p95=${String(s.p95.toFixed(0)).padStart(5)} ms` +
    ` p99=${String(s.p99.toFixed(0)).padStart(5)} ms` +
    ` max=${String(s.max.toFixed(0)).padStart(5)} ms` +
    ` avg=${String(s.avg.toFixed(0)).padStart(5)} ms` +
    ` err=${s.errors} (${s.errorRate})` +
    ` tput=${s.throughput}`
  );
}

// ---- HTTP fetch helpers ----
function doRequest(base, method, path, body, token) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const opts = {
      hostname: '127.0.0.1',
      port: base.port,
      path,
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    };
    const t0 = performance.now();
    const req = http.request(opts, (res) => {
      res.resume();
      res.on('end', () => resolve({ ok: res.statusCode < 500, ms: performance.now() - t0, status: res.statusCode }));
    });
    req.on('error', () => resolve({ ok: false, ms: performance.now() - t0, status: 0 }));
    if (payload) req.write(payload);
    req.end();
  });
}

// ---- benchmark runner ----
async function run(label, fn) {
  const times = [];
  const errs  = [];
  const t0 = performance.now();

  // batched concurrency
  for (let done = 0; done < ITERATIONS; done += CONCURRENCY) {
    const batch = Math.min(CONCURRENCY, ITERATIONS - done);
    const results = await Promise.all(Array.from({ length: batch }, fn));
    for (const r of results) {
      if (r.ok) times.push(r.ms);
      else errs.push(r.ms);
    }
  }

  const durationMs = performance.now() - t0;
  return { label, stats: computeStats(times, errs.length, durationMs) };
}

// ---- main ----
(async () => {
  // ---- 1. Build express app ----
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

  // ---- 2. Seed data ----
  usersStore.resetStore();
  const studentUser = usersStore.findUserByEmail('student@stu.pes.edu');
  const tpoUser     = usersStore.findUserByEmail('tpo@pes.edu');

  // Create a profile for the student
  profilesStore.saveProfile(studentUser.id, {
    branch: 'CSE', cgpa: 8.5, backlogs: 0,
    skills: ['JavaScript', 'Node.js'], contact: '9876543210',
  });

  // Create a drive and add an application
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  drivesStore.addDrive({
    company: 'BenchCorp', role: 'SDE', package: '12 LPA',
    eligibility: { minCgpa: 7.0, branches: ['CSE', 'ISE'], maxBacklogs: 2 },
    deadline: futureDate,
  });
  addApplication(studentUser.id, 1);

  // ---- 3. Start server ----
  const server = http.createServer(app);
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const base = { port: server.address().port };

  // ---- 4. Pre-generate tokens (avoids JWT sign overhead inside each iteration) ----
  const studentToken = jwt.sign({ id: studentUser.id, role: STUDENT }, SECRET);
  const tpoToken     = jwt.sign({ id: tpoUser.id,     role: TPO     }, SECRET);

  console.log('\n============================================================');
  console.log(' OIPP-NF-001 Response-Time Benchmark');
  console.log(`  iterations : ${ITERATIONS} per endpoint`);
  console.log(`  concurrency: ${CONCURRENCY} parallel`);
  console.log(`  p90 limit  : ${P90_LIMIT_MS} ms`);
  console.log(`  server     : http://127.0.0.1:${base.port}`);
  console.log('============================================================\n');

  const reports = [];

  // ---- 5. Benchmark each endpoint ----

  // 5a. POST /api/auth/login  – real bcrypt; this is the slowest endpoint
  reports.push(await run('POST /api/auth/login', () =>
    doRequest(base, 'POST', '/api/auth/login',
      { email: 'student@stu.pes.edu', password: 'student123' }, null)
  ));

  // 5b. GET /api/profile
  reports.push(await run('GET  /api/profile', () =>
    doRequest(base, 'GET', '/api/profile', null, studentToken)
  ));

  // 5c. GET /api/drives/eligible
  reports.push(await run('GET  /api/drives/eligible', () =>
    doRequest(base, 'GET', '/api/drives/eligible', null, studentToken)
  ));

  // 5d. GET /api/applications
  reports.push(await run('GET  /api/applications', () =>
    doRequest(base, 'GET', '/api/applications', null, studentToken)
  ));

  // 5e. GET /api/notifications
  reports.push(await run('GET  /api/notifications', () =>
    doRequest(base, 'GET', '/api/notifications', null, studentToken)
  ));

  // 5f. GET /api/reports/stats  (TPO)
  reports.push(await run('GET  /api/reports/stats', () =>
    doRequest(base, 'GET', '/api/reports/stats', null, tpoToken)
  ));

  // ---- 6. Print results ----
  console.log('  Endpoint                     n      p50    p90    p95    p99    max    avg    err       tput');
  console.log('  ' + '-'.repeat(105));
  for (const r of reports) printStats(r.label, r.stats);

  // ---- 7. Overall ----
  const allTimes  = reports.flatMap((r) => Array(r.stats.count - r.stats.errors).fill(r.stats.avg));
  const allErrors = reports.reduce((s, r) => s + r.stats.errors, 0);
  const overallP90 = Math.max(...reports.map((r) => r.stats.p90));
  const overallPass = reports.every((r) => r.stats.meetsP90);

  console.log('  ' + '-'.repeat(105));
  console.log(`\n  Worst endpoint p90 : ${overallP90.toFixed(0)} ms`);
  console.log(`  Total errors       : ${allErrors}`);
  console.log(`\n  RESULT: ${overallPass ? 'PASS ✓' : 'FAIL ✗'}  (all endpoints p90 <= ${P90_LIMIT_MS} ms)`);
  console.log('\n============================================================\n');

  server.close();
  process.exitCode = overallPass ? 0 : 1;
})();

