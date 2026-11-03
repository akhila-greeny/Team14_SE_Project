/**
 * TEST SUITE: Service Availability Monitoring
 * Requirement: OIPP-NF-002 / GitHub Issue #22
 *
 * Covers:
 *  1. GET /api/health returns 200 with status "UP", timestamp, uptime, and subsystem status
 *  2. Synthetic probe records successful health checks with timestamps, response times, and status UP
 *  3. Synthetic probe detects and records failed health checks (e.g. non-existent server / connection failure)
 *  4. Probe error handling: network errors and timeouts are handled safely without crashing
 *  5. Calculates availability percentage correctly: (successful / total) * 100
 *  6. Tracks uptime and downtime seconds accurately across multiple checks
 *  7. Detects and records discrete downtime incidents with start time, end time, duration, and reason
 *  8. Evaluates compliance against SRS 99.0% monthly availability threshold (meetsSla = true/false)
 *  9. GET /api/health/availability endpoint serves aggregated metrics and SLA evaluation
 * 10. Boundary conditions: zero checks handled safely (default 100%, 0 downtime)
 * 11. Regression: existing authentication routes continue working normally
 *
 * Run: node test-availability.js
 */

'use strict';

const express = require('express');
const http = require('http');
const {
  AvailabilityMonitor,
  defaultMonitor,
  SLA_TARGET_PERCENT,
} = require('./utils/availabilityMonitor');
const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const usersStore = require('./data/usersStore');

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
console.log('TEST SUITE: Service Availability Monitoring');
console.log('Requirement: OIPP-NF-002 / GitHub Issue #22');
console.log(`Target SLA: ${SLA_TARGET_PERCENT}% Monthly Availability`);
console.log('====================================================\n');

(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  const availabilityUrl = `http://127.0.0.1:${port}/api/health/availability`;

  async function getJson(url) {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: body });
          }
        });
      }).on('error', reject);
    });
  }

  try {
    defaultMonitor.reset();

    // -----------------------------------------------------------------------
    // TEST 1: Health check endpoint /api/health
    // -----------------------------------------------------------------------
    const healthRes = await getJson(healthUrl);
    assert(
      'GET /api/health returns HTTP 200',
      healthRes.status === 200,
      healthRes
    );
    assert(
      'GET /api/health returns status "UP"',
      healthRes.data && healthRes.data.status === 'UP',
      healthRes.data
    );
    assert(
      'GET /api/health includes ISO timestamp and uptimeSeconds',
      typeof healthRes.data.timestamp === 'string' &&
        typeof healthRes.data.uptimeSeconds === 'number' &&
        healthRes.data.uptimeSeconds >= 0,
      healthRes.data
    );
    assert(
      'GET /api/health includes responsive subsystem status',
      healthRes.data.subsystems && healthRes.data.subsystems.stores === 'UP',
      healthRes.data
    );

    // -----------------------------------------------------------------------
    // TEST 2: Synthetic probe of live health endpoint
    // -----------------------------------------------------------------------
    const monitor = new AvailabilityMonitor({ checkIntervalMs: 60000 });
    const probeRes1 = await monitor.probe(healthUrl);

    assert(
      'Probe records successful check with status "UP"',
      probeRes1.status === 'UP' && probeRes1.statusCode === 200,
      probeRes1
    );
    assert(
      'Probe records positive responseTimeMs and timestamp',
      typeof probeRes1.responseTimeMs === 'number' &&
        probeRes1.responseTimeMs >= 0 &&
        typeof probeRes1.timestamp === 'number',
      probeRes1
    );

    // -----------------------------------------------------------------------
    // TEST 3: Synthetic probe of unreachable endpoint (simulated server failure)
    // -----------------------------------------------------------------------
    // Probe a port where nothing is listening (e.g. 59999)
    const deadUrl = 'http://127.0.0.1:59999/api/health';
    const deadProbe = await monitor.probe(deadUrl);

    assert(
      'Probe records failure with status "DOWN" when target is unreachable',
      deadProbe.status === 'DOWN',
      deadProbe
    );
    assert(
      'Failed probe captures error details without throwing',
      typeof deadProbe.error === 'string' && deadProbe.error.length > 0,
      deadProbe
    );

    // -----------------------------------------------------------------------
    // TEST 4: Availability percentage calculation
    // -----------------------------------------------------------------------
    // Current monitor has 1 UP, 1 DOWN => 50%
    let metrics = monitor.getMetrics();
    assert(
      'Calculates 50.0% availability with 1 UP and 1 DOWN check',
      metrics.availabilityPercentage === 50.0 &&
        metrics.totalChecks === 2 &&
        metrics.successfulChecks === 1 &&
        metrics.failedChecks === 1,
      metrics
    );

    // -----------------------------------------------------------------------
    // TEST 5: Downtime and Uptime tracking
    // -----------------------------------------------------------------------
    assert(
      'Tracks uptimeSeconds and downtimeSeconds based on check interval',
      metrics.uptimeSeconds === 60 && metrics.downtimeSeconds === 60,
      { uptime: metrics.uptimeSeconds, downtime: metrics.downtimeSeconds }
    );

    // -----------------------------------------------------------------------
    // TEST 6: Incident detection and recovery
    // -----------------------------------------------------------------------
    // Recovery probe: probe live healthUrl again
    await monitor.probe(healthUrl);
    metrics = monitor.getMetrics();

    assert(
      'Detects incident recovery and closes the incident',
      metrics.incidents.length === 1 &&
        metrics.incidents[0].end !== 'IN_PROGRESS' &&
        metrics.incidents[0].durationSeconds > 0,
      metrics.incidents
    );

    // -----------------------------------------------------------------------
    // TEST 7: 99% SLA threshold evaluation
    // -----------------------------------------------------------------------
    // 3 checks (2 UP, 1 DOWN) => 66.667% => meetsSla must be false
    assert(
      'Evaluates meetsSla as false when availability is below 99.0%',
      metrics.meetsSla === false,
      { availability: metrics.availabilityPercentage, meetsSla: metrics.meetsSla }
    );

    // Simulate 99 consecutive UP checks on a clean monitor: 99 UP + 1 DOWN = 99.0%
    const slaMonitor = new AvailabilityMonitor({ checkIntervalMs: 60000 });
    for (let i = 0; i < 99; i++) {
      slaMonitor.recordCheck({ status: 'UP', responseTimeMs: 10 });
    }
    slaMonitor.recordCheck({ status: 'DOWN', error: 'Database transient error' });

    const slaMetrics = slaMonitor.getMetrics();
    assert(
      '99 UP + 1 DOWN yields exactly 99.0% availability',
      slaMetrics.availabilityPercentage === 99.0 &&
        slaMetrics.totalChecks === 100 &&
        slaMetrics.successfulChecks === 99 &&
        slaMetrics.failedChecks === 1,
      slaMetrics
    );
    assert(
      'meetsSla is true when availability is exactly 99.0%',
      slaMetrics.meetsSla === true,
      { availability: slaMetrics.availabilityPercentage, meetsSla: slaMetrics.meetsSla }
    );

    // Simulate 100% availability
    const perfectMonitor = new AvailabilityMonitor({ checkIntervalMs: 60000 });
    for (let i = 0; i < 60; i++) {
      perfectMonitor.recordCheck({ status: 'UP', responseTimeMs: 5 });
    }
    const perfectMetrics = perfectMonitor.getMetrics();
    assert(
      '60 UP checks yields 100.0% availability and 0 downtime',
      perfectMetrics.availabilityPercentage === 100.0 &&
        perfectMetrics.downtimeSeconds === 0 &&
        perfectMetrics.meetsSla === true,
      perfectMetrics
    );

    // -----------------------------------------------------------------------
    // TEST 8: GET /api/health/availability endpoint
    // -----------------------------------------------------------------------
    // Populate defaultMonitor with some checks
    defaultMonitor.reset();
    for (let i = 0; i < 99; i++) {
      defaultMonitor.recordCheck({ status: 'UP', responseTimeMs: 8 });
    }
    defaultMonitor.recordCheck({ status: 'DOWN', error: 'Planned maintenance test' });

    const availRes = await getJson(availabilityUrl);
    assert(
      'GET /api/health/availability returns HTTP 200',
      availRes.status === 200,
      availRes
    );
    assert(
      'GET /api/health/availability reports availabilityPercentage, uptime, and downtime',
      availRes.data.availabilityPercentage === 99.0 &&
        availRes.data.uptimeSeconds > 0 &&
        availRes.data.downtimeSeconds > 0 &&
        availRes.data.meetsSla === true,
      availRes.data
    );
    assert(
      'GET /api/health/availability includes SLA target and incident history',
      availRes.data.slaTarget === 99.0 &&
        Array.isArray(availRes.data.incidents) &&
        availRes.data.incidents.length === 1,
      availRes.data
    );

    // -----------------------------------------------------------------------
    // TEST 9: Boundary condition — Zero checks
    // -----------------------------------------------------------------------
    const emptyMonitor = new AvailabilityMonitor();
    const emptyMetrics = emptyMonitor.getMetrics();
    assert(
      'Empty monitor safely defaults to 100% availability and 0 totalChecks',
      emptyMetrics.totalChecks === 0 &&
        emptyMetrics.availabilityPercentage === 100.0 &&
        emptyMetrics.downtimeSeconds === 0,
      emptyMetrics
    );

    // -----------------------------------------------------------------------
    // REGRESSION 10: Existing auth flow preserved
    // -----------------------------------------------------------------------
    usersStore.resetStore();
    const loginRes = await new Promise((resolve) => {
      const payload = JSON.stringify({ email: 'student@stu.pes.edu', password: 'student123' });
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }, (res) => {
        let b = '';
        res.on('data', (d) => { b += d; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) }));
      });
      req.write(payload);
      req.end();
    });

    assert(
      '[Regression] Existing login works normally (HTTP 200) with health routes active',
      loginRes.status === 200 && typeof loginRes.body.token === 'string',
      loginRes
    );

  } finally {
    defaultMonitor.reset();
    server.close();
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
  else process.exit(0);
})();
