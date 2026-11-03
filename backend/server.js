
const express = require('express');
const http = require('http');
const https = require('https');
const drivesRouter = require('./routes/drives');
const applicationStatusRouter = require('./routes/applicationStatus'); // OIPP-F-017
const notificationsRouter = require('./routes/notifications'); // OIPP-F-018
const reportsRouter = require('./routes/reports'); // OIPP-F-019
const applicantsExportRouter = require('./routes/applicantsExport'); // OIPP-F-020
const healthRouter = require('./routes/health'); // OIPP-NF-002: /api/health and /api/health/availability
const { checkDeadlineReminders } = require('./utils/deadlineReminders'); // OIPP-F-018
const { addApplication } = require('./data/applicationsStore'); // OIPP-F-017 (test seed)
const { seedStatsDemo } = require('./utils/seedStats'); // OIPP-F-019 (test seed)
const { seedExportDemo } = require('./utils/seedExport'); // OIPP-F-020 (test seed)
const { seedLoadDemo } = require('./utils/seedLoad'); // OIPP-NF-005 (test seed)
const { loadTlsCredentials, buildHttpsOptions } = require('./utils/tlsConfig'); // OIPP-SR-001
const { defaultMonitor } = require('./utils/availabilityMonitor'); // OIPP-NF-002

const app = express();
app.use(express.json());
app.use(express.static(require('path').join(__dirname, 'public')));

app.use('/api/drives', drivesRouter);

app.use('/api/profile', require('./routes/profile'));
app.use('/api/drives', require('./routes/eligibleDrives'));
app.use('/api', require('./routes/apply'));
app.use('/api', applicationStatusRouter); // OIPP-F-017: PATCH /api/applications/:id/status
app.use('/api', notificationsRouter); // OIPP-F-018: /api/notifications
app.use('/api', reportsRouter); // OIPP-F-019: GET /api/reports/stats
app.use('/api', applicantsExportRouter); // OIPP-F-020: GET /api/drives/:id/applicants/export
app.use('/api', healthRouter); // OIPP-NF-002: GET /api/health, GET /api/health/availability

// OIPP-F-018: check for approaching deadlines every hour
setInterval(() => checkDeadlineReminders(), 60 * 60 * 1000);

// Test only: "node server.js --seed" creates one demo application (student 1, drive 1)
if (process.argv.includes('--seed')) addApplication(1, 1);
// Test only: "node server.js --seed-stats" creates demo data for the statistics
if (process.argv.includes('--seed-stats')) seedStatsDemo();
// Test only: "node server.js --seed-export" creates demo data for the CSV export
if (process.argv.includes('--seed-export')) seedExportDemo();
// Test only: "node server.js --seed-load" creates 2000 students' data for the load test
if (process.argv.includes('--seed-load')) seedLoadDemo(2000);

app.use('/api/resume/template', require('./routes/resumeTemplate'));
app.use('/api/resume', require('./routes/resume'));
app.use('/api/auth', require('./routes/auth'));

// ---------------------------------------------------------------------------
// OIPP-SR-001: HTTPS / TLS server startup
//
// Strategy:
//  1. If TLS_CERT_PATH + TLS_KEY_PATH are set, start an HTTPS server with
//     minimum TLS 1.2 and an HTTP redirect server.
//  2. If NODE_ENV=production and no cert is configured, exit with an error
//     (fail-safe – the application must not serve plaintext in production).
//  3. Otherwise (development / test with no cert), start HTTP-only and warn.
//
// The app object is exported for use by individual test files, which mount
// their own express instance and never depend on this startup logic.
// ---------------------------------------------------------------------------

/**
 * Starts the HTTP and/or HTTPS server based on the current configuration.
 * Called automatically when this file is the process entry point.
 *
 * @param {import('express').Application} expressApp
 */
function startServer(expressApp) {
  const HTTP_PORT = Number(process.env.HTTP_PORT) || 3000;
  const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
  const isProduction = process.env.NODE_ENV === 'production';

  let credentials;
  try {
    credentials = loadTlsCredentials();
  } catch (err) {
    console.error('[TLS] FATAL – TLS misconfiguration:', err.message);
    process.exit(1);
    return; // unreachable but satisfies linters
  }

  if (credentials) {
    // -----------------------------------------------------------------------
    // HTTPS mode: start HTTPS server + HTTP redirect server
    // -----------------------------------------------------------------------
    const httpsOptions = buildHttpsOptions(credentials);

    https.createServer(httpsOptions, expressApp).listen(HTTPS_PORT, () => {
      console.log(
        `[TLS] HTTPS server listening on port ${HTTPS_PORT} (min TLS 1.2, TLS 1.3 supported)`
      );
    });

    // HTTP redirect server – all plain-HTTP requests get a 301 to HTTPS.
    const redirectApp = express();
    redirectApp.use((req, res) => {
      const host = (req.headers.host || req.hostname || 'localhost').replace(
        /:\d+$/,
        ''
      );
      const target = `https://${host}:${HTTPS_PORT}${req.originalUrl}`;
      res.redirect(301, target);
    });
    http.createServer(redirectApp).listen(HTTP_PORT, () => {
      console.log(
        `[TLS] HTTP server on port ${HTTP_PORT} – redirecting all requests to HTTPS`
      );
    });

    // OIPP-NF-002: Start availability monitoring against the HTTPS health check
    const monitorUrl = process.env.AVAILABILITY_PROBE_URL || `https://127.0.0.1:${HTTPS_PORT}/api/health`;
    defaultMonitor.start(monitorUrl);
  } else if (isProduction) {
    // -----------------------------------------------------------------------
    // Production with no cert → fail safely (never serve plaintext).
    // -----------------------------------------------------------------------
    console.error('[TLS] FATAL: No TLS certificate configured in production mode.');
    console.error('[TLS]   Set TLS_CERT_PATH and TLS_KEY_PATH to PEM file paths.');
    console.error('[TLS]   Optionally set TLS_CA_PATH for an intermediate CA bundle.');
    process.exit(1);
  } else {
    // -----------------------------------------------------------------------
    // Development / test without cert → HTTP-only with a visible warning.
    // -----------------------------------------------------------------------
    console.warn(
      '[TLS] WARNING: No TLS certificate configured. ' +
        'Starting HTTP-only server (development mode).'
    );
    console.warn(
      '[TLS]   Run "node scripts/gen-dev-cert.js" and set TLS_CERT_PATH / TLS_KEY_PATH for HTTPS.'
    );
    http.createServer(expressApp).listen(HTTP_PORT, () => {
      console.log(`Server running on port ${HTTP_PORT} (HTTP only – development mode)`);
    });

    // OIPP-NF-002: Start availability monitoring against the HTTP health check
    const monitorUrl = process.env.AVAILABILITY_PROBE_URL || `http://127.0.0.1:${HTTP_PORT}/api/health`;
    defaultMonitor.start(monitorUrl);
  }
}

// Export the app so individual test files can mount it without running the
// server startup logic.
module.exports = { app, startServer };

// Start servers when this file is the process entry point.
if (require.main === module) {
  startServer(app);
}
