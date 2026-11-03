/**
 * TLS Configuration Loader
 * Requirement: OIPP-SR-001 / Issue #26
 *
 * Reads certificate and key from paths specified by environment variables and
 * builds the options object for https.createServer().  Enforces a minimum TLS
 * version of 1.2; TLS 1.3 is implicitly available (Node default maximum).
 *
 * PRODUCTION CONFIGURATION
 * ========================
 * Set the following environment variables before starting the server:
 *
 *   TLS_CERT_PATH   Absolute path to the PEM-encoded certificate (or chain).
 *   TLS_KEY_PATH    Absolute path to the PEM-encoded private key.
 *   TLS_CA_PATH     (Optional) Path to intermediate CA bundle.
 *   HTTPS_PORT      HTTPS listen port (default: 3443 dev, 443 prod).
 *   HTTP_PORT       HTTP listen port for redirect server (default: 3000).
 *   NODE_ENV        Set to "production" to enforce TLS – server refuses to
 *                   start without valid cert/key in production mode.
 *
 * DEVELOPMENT / TESTING
 * =====================
 * When TLS_CERT_PATH / TLS_KEY_PATH are absent and NODE_ENV !== "production",
 * the server falls back to plain HTTP on HTTP_PORT with a console warning.
 * Use backend/scripts/gen-dev-cert.js to generate a local self-signed cert.
 *
 * WHAT IS NOT SUPPORTED
 * =====================
 * A self-signed development certificate does NOT constitute production HTTPS.
 * It is suitable only for local integration testing and CI pipelines that
 * disable certificate verification explicitly.
 */

'use strict';

const fs = require('fs');

/** Minimum accepted TLS version – enforces OIPP-SR-001. */
const MIN_TLS_VERSION = 'TLSv1.2';

/**
 * Loads TLS credentials from paths configured in environment variables.
 *
 * Returns null when no paths are configured (caller should use HTTP fallback).
 * Throws when paths are partially configured or files cannot be read.
 *
 * @param {object} [envOverride={}] - Override env vars (useful in tests).
 * @returns {{ cert: Buffer, key: Buffer, ca?: Buffer } | null}
 * @throws {Error} On misconfiguration or unreadable files.
 */
function loadTlsCredentials(envOverride = {}) {
  const env = Object.assign({}, process.env, envOverride);
  const certPath = env.TLS_CERT_PATH || '';
  const keyPath = env.TLS_KEY_PATH || '';
  const caPath = env.TLS_CA_PATH || '';

  // Neither set → TLS not configured; caller decides whether that is fatal.
  if (!certPath && !keyPath) {
    return null;
  }

  // Only one set → misconfiguration.
  if (!certPath || !keyPath) {
    throw new Error(
      'TLS misconfiguration: TLS_CERT_PATH and TLS_KEY_PATH must both be set. ' +
        `Missing: ${!certPath ? 'TLS_CERT_PATH' : 'TLS_KEY_PATH'}.`
    );
  }

  try {
    const credentials = {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    };
    if (caPath) {
      credentials.ca = fs.readFileSync(caPath);
    }
    return credentials;
  } catch (err) {
    throw new Error(
      `Failed to load TLS credentials: ${err.message}. ` +
        'Verify TLS_CERT_PATH and TLS_KEY_PATH point to readable PEM files.'
    );
  }
}

/**
 * Builds the options object for https.createServer().
 * Always sets minVersion to MIN_TLS_VERSION (TLSv1.2).
 *
 * @param {{ cert: Buffer, key: Buffer, ca?: Buffer }} credentials
 * @returns {object} Options ready for https.createServer(options, app).
 */
function buildHttpsOptions(credentials) {
  return {
    ...credentials,
    minVersion: MIN_TLS_VERSION,
    // maxVersion is intentionally left at Node's default (TLSv1.3)
    // so both TLS 1.2 and TLS 1.3 remain available.
  };
}

module.exports = { MIN_TLS_VERSION, loadTlsCredentials, buildHttpsOptions };

