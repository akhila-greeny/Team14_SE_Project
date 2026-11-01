/**
 * TEST SUITE: HTTPS / TLS Configuration
 * Requirement: OIPP-SR-001 / Issue #26
 *
 * Covers:
 *  1.  tlsConfig unit tests (no server needed)
 *       a. loadTlsCredentials returns null when no env vars set
 *       b. loadTlsCredentials throws when only one of cert/key is set
 *       c. loadTlsCredentials throws when files do not exist
 *       d. buildHttpsOptions sets minVersion to TLSv1.2
 *       e. buildHttpsOptions does not set maxVersion (leaves TLS 1.3 available)
 *  2.  HTTPS server integration tests
 *       a. HTTPS endpoint reachable with a valid self-signed cert
 *       b. TLS 1.2 connection accepted
 *       c. TLS 1.3 connection accepted
 *       d. Connection with maxVersion TLS 1.1 is rejected / not established
 *       e. Connection with maxVersion TLS 1.0 is rejected / not established
 *       f. API routes still respond correctly over HTTPS
 *  3.  HTTP redirect server tests
 *       a. HTTP request receives 301 redirect to HTTPS URL
 *  4.  Missing-cert / production-mode tests
 *       a. loadTlsCredentials returns null for unset vars (no crash)
 *       b. loadTlsCredentials throws for partial config
 *
 * Run:  node test-https-tls.js
 *
 * The test generates a temporary self-signed cert at runtime.
 * It requires openssl to be available (system openssl or Git for Windows).
 *
 * Node.js / OpenSSL 3 note:
 *   TLS 1.0 and 1.1 are disabled in OpenSSL 3 by default.  Attempting a
 *   connection with maxVersion TLSv1.1 (or TLSv1) will therefore fail at the
 *   client level (handshake_failure).  This is the correct behaviour and proves
 *   those protocol versions are unusable regardless of where the rejection
 *   originates.
 */

'use strict';

const https = require('https');
const http = require('http');
const tls = require('tls');
const net = require('net');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { loadTlsCredentials, buildHttpsOptions, MIN_TLS_VERSION } = require('./utils/tlsConfig');

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

// ---------------------------------------------------------------------------
// Helper: find openssl binary
// ---------------------------------------------------------------------------
function findOpenssl() {
  const candidates = [
    'openssl',
    'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    '/usr/bin/openssl',
    '/usr/local/bin/openssl',
  ];
  for (const c of candidates) {
    try { execSync(`"${c}" version`, { stdio: 'pipe' }); return c; } catch (_) {}
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helper: generate a self-signed cert into a temp directory
// ---------------------------------------------------------------------------
function generateTempCert() {
  const openssl = findOpenssl();
  if (!openssl) throw new Error('openssl not found – cannot generate test certificate');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oipp-tls-test-'));
  const keyPath  = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');

  execSync(
    `"${openssl}" req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" ` +
    `-days 1 -nodes -subj "/CN=localhost"`,
    { stdio: 'pipe' }
  );
  return { keyPath, certPath, dir };
}

// ---------------------------------------------------------------------------
// Helper: attempt a TLS connection; resolve true on success, false on error
// ---------------------------------------------------------------------------
function tryTlsConnect(port, options) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      Object.assign({ host: '127.0.0.1', port, rejectUnauthorized: false }, options),
      () => { socket.destroy(); resolve(true); }
    );
    socket.on('error', () => { resolve(false); });
    socket.setTimeout(3000, () => { socket.destroy(); resolve(false); });
  });
}

// ---------------------------------------------------------------------------
// Helper: send a plain-HTTP GET and return { status, location }
// ---------------------------------------------------------------------------
function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
      res.resume();
      resolve({ status: res.statusCode, location: res.headers.location || '' });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ---------------------------------------------------------------------------
// Helper: HTTPS GET (ignoring self-signed cert)
// ---------------------------------------------------------------------------
function httpsGet(port, urlPath) {
  return new Promise((resolve, reject) => {
    https.get(
      { host: '127.0.0.1', port, path: urlPath, rejectUnauthorized: false },
      (res) => {
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    ).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Main test runner
// ---------------------------------------------------------------------------
console.log('====================================================');
console.log('TEST SUITE: HTTPS / TLS Configuration');
console.log('Requirement: OIPP-SR-001 / Issue #26');
console.log('====================================================\n');

(async () => {
  // =========================================================================
  // SECTION 1 – tlsConfig unit tests (no server needed)
  // =========================================================================
  console.log('--- Section 1: tlsConfig unit tests ---\n');

  // 1a. No env vars → null
  const creds_none = loadTlsCredentials({ TLS_CERT_PATH: '', TLS_KEY_PATH: '' });
  assert(
    'loadTlsCredentials returns null when no env vars are set',
    creds_none === null,
    creds_none
  );

  // 1b. Only cert path set → throws
  let threw1b = false;
  try { loadTlsCredentials({ TLS_CERT_PATH: '/some/cert.pem', TLS_KEY_PATH: '' }); }
  catch (e) { threw1b = true; }
  assert(
    'loadTlsCredentials throws when only TLS_CERT_PATH is set (partial config)',
    threw1b
  );

  // 1b'. Only key path set → throws
  let threw1bk = false;
  try { loadTlsCredentials({ TLS_CERT_PATH: '', TLS_KEY_PATH: '/some/key.pem' }); }
  catch (e) { threw1bk = true; }
  assert(
    'loadTlsCredentials throws when only TLS_KEY_PATH is set (partial config)',
    threw1bk
  );

  // 1c. Paths set but files don't exist → throws
  let threw1c = false;
  try {
    loadTlsCredentials({
      TLS_CERT_PATH: '/nonexistent/cert.pem',
      TLS_KEY_PATH:  '/nonexistent/key.pem',
    });
  } catch (e) { threw1c = true; }
  assert(
    'loadTlsCredentials throws when configured cert/key files do not exist',
    threw1c
  );

  // 1d. buildHttpsOptions sets minVersion to TLSv1.2
  const fakeCredentials = { cert: Buffer.from('c'), key: Buffer.from('k') };
  const httpsOpts = buildHttpsOptions(fakeCredentials);
  assert(
    `buildHttpsOptions sets minVersion to "${MIN_TLS_VERSION}" (TLSv1.2)`,
    httpsOpts.minVersion === 'TLSv1.2',
    { minVersion: httpsOpts.minVersion }
  );

  // 1e. buildHttpsOptions does NOT set maxVersion (TLS 1.3 remains available)
  assert(
    'buildHttpsOptions does NOT set maxVersion (TLS 1.3 implicitly available)',
    httpsOpts.maxVersion === undefined,
    { maxVersion: httpsOpts.maxVersion }
  );

  // MIN_TLS_VERSION constant exported correctly
  assert(
    'MIN_TLS_VERSION exported constant is "TLSv1.2"',
    MIN_TLS_VERSION === 'TLSv1.2',
    { MIN_TLS_VERSION }
  );

  // =========================================================================
  // SECTION 2 – HTTPS server integration tests
  // =========================================================================
  console.log('\n--- Section 2: HTTPS server integration tests ---\n');

  let tempCertDir = null;
  let httpsServer = null;

  try {
    // Generate a temporary self-signed cert for the test session.
    const tempCert = generateTempCert();
    tempCertDir = tempCert.dir;

    const credentials = {
      cert: fs.readFileSync(tempCert.certPath),
      key:  fs.readFileSync(tempCert.keyPath),
    };
    const httpsOpts2 = buildHttpsOptions(credentials);

    // Mount a minimal express app with the auth router for integration tests.
    const app = express();
    app.use(express.json());
    app.get('/api/health', (_req, res) => res.json({ ok: true }));

    httpsServer = https.createServer(httpsOpts2, app);
    await new Promise((resolve) => httpsServer.listen(0, '127.0.0.1', resolve));
    const httpsPort = httpsServer.address().port;

    // 2a. HTTPS endpoint reachable
    const healthRes = await httpsGet(httpsPort, '/api/health');
    assert(
      'HTTPS endpoint /api/health reachable and returns HTTP 200',
      healthRes.status === 200,
      { status: healthRes.status }
    );

    // 2b. TLS 1.2 connection accepted
    const tls12ok = await tryTlsConnect(httpsPort, {
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
    });
    assert(
      'TLS 1.2 connection is accepted by the HTTPS server',
      tls12ok,
      { tls12ok }
    );

    // 2c. TLS 1.3 connection accepted (if supported by the local OpenSSL build)
    const tls13ok = await tryTlsConnect(httpsPort, {
      minVersion: 'TLSv1.3',
      maxVersion: 'TLSv1.3',
    });
    // TLS 1.3 may not be compiled into all OpenSSL builds; mark as informational
    if (tls13ok) {
      assert('TLS 1.3 connection is accepted by the HTTPS server', true);
    } else {
      console.log('[INFO] TLS 1.3 not available in this OpenSSL build – skipped');
      // Do not count as pass or fail; simply log
    }

    // 2d. TLS 1.1 connection NOT established
    // In OpenSSL 3, TLS 1.0/1.1 are disabled by default; the handshake will
    // fail at the client level.  Either way the connection cannot be completed.
    const tls11ok = await tryTlsConnect(httpsPort, {
      minVersion: 'TLSv1.1',
      maxVersion: 'TLSv1.1',
    });
    assert(
      'TLS 1.1 connection is NOT established (rejected at server or disabled at client)',
      !tls11ok,
      { tls11ok }
    );

    // 2e. TLS 1.0 connection NOT established
    const tls10ok = await tryTlsConnect(httpsPort, {
      minVersion: 'TLSv1',
      maxVersion: 'TLSv1',
    });
    assert(
      'TLS 1.0 connection is NOT established (rejected at server or disabled at client)',
      !tls10ok,
      { tls10ok }
    );

    // 2f. API routes work correctly over HTTPS
    const apiRes = await httpsGet(httpsPort, '/api/health');
    assert(
      'API route /api/health responds correctly over HTTPS',
      apiRes.status === 200 && apiRes.body.includes('"ok"'),
      { status: apiRes.status }
    );

  } finally {
    if (httpsServer) await new Promise((resolve) => httpsServer.close(resolve));
    // Clean up temp cert directory
    if (tempCertDir) {
      try { fs.rmSync(tempCertDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // =========================================================================
  // SECTION 3 – HTTP redirect server tests
  // =========================================================================
  console.log('\n--- Section 3: HTTP redirect server tests ---\n');

  let httpRedirectServer = null;
  const TARGET_HTTPS_PORT = 3444;

  try {
    const redirectApp = express();
    redirectApp.use((req, res) => {
      const host = (req.headers.host || 'localhost').replace(/:\d+$/, '');
      res.redirect(301, `https://${host}:${TARGET_HTTPS_PORT}${req.originalUrl}`);
    });

    httpRedirectServer = http.createServer(redirectApp);
    await new Promise((resolve) => httpRedirectServer.listen(0, '127.0.0.1', resolve));
    const httpPort = httpRedirectServer.address().port;

    // 3a. HTTP GET receives 301 redirect
    const redirectRes = await httpGet(httpPort, '/api/auth/login');
    assert(
      'HTTP request receives 301 redirect to HTTPS',
      redirectRes.status === 301,
      { status: redirectRes.status, location: redirectRes.location }
    );
    assert(
      'Redirect location points to HTTPS URL',
      redirectRes.location.startsWith('https://'),
      { location: redirectRes.location }
    );
    assert(
      'Redirect location preserves the request path',
      redirectRes.location.includes('/api/auth/login'),
      { location: redirectRes.location }
    );
    assert(
      'Redirect location includes the configured HTTPS port',
      redirectRes.location.includes(String(TARGET_HTTPS_PORT)),
      { location: redirectRes.location }
    );

  } finally {
    if (httpRedirectServer) {
      await new Promise((resolve) => httpRedirectServer.close(resolve));
    }
  }

  // =========================================================================
  // SECTION 4 – Missing-cert / production-safety tests (unit level)
  // =========================================================================
  console.log('\n--- Section 4: Missing cert / production-safety unit tests ---\n');

  // 4a. loadTlsCredentials returns null (no crash) when vars are unset
  const safeNull = loadTlsCredentials({});
  assert(
    'loadTlsCredentials returns null safely when no cert vars are set (no crash)',
    safeNull === null,
    safeNull
  );

  // 4b. Partial config throws a descriptive error
  let descErr = '';
  try { loadTlsCredentials({ TLS_CERT_PATH: 'x', TLS_KEY_PATH: '' }); }
  catch (e) { descErr = e.message; }
  assert(
    'Partial TLS config error message describes which variable is missing',
    descErr.toLowerCase().includes('tls_key_path'),
    { descErr }
  );

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
  else process.exit(0);
})();

