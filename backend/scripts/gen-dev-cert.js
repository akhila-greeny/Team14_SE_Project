#!/usr/bin/env node
/**
 * Development certificate generator (OIPP-SR-001, Issue #26)
 *
 * Generates a self-signed RSA 2048-bit certificate for local HTTPS testing.
 * Output goes to backend/certs/dev/ which is gitignored.
 *
 * Usage:
 *   node backend/scripts/gen-dev-cert.js
 *
 * Then start the server with:
 *   TLS_CERT_PATH=backend/certs/dev/cert.pem \
 *   TLS_KEY_PATH=backend/certs/dev/key.pem \
 *   node backend/server.js
 *
 * IMPORTANT
 * ---------
 * The generated certificate is self-signed and valid for localhost only.
 * It is NOT suitable for production.  Do not commit the certs/ directory.
 *
 * The key (key.pem) is generated without a passphrase for convenience in
 * development.  It is listed in .gitignore to prevent accidental commits.
 *
 * For production, obtain a certificate from a trusted CA (e.g. Let's Encrypt)
 * and supply the paths via TLS_CERT_PATH / TLS_KEY_PATH.
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CERT_DIR = path.join(__dirname, '..', 'certs', 'dev');
const KEY_PATH = path.join(CERT_DIR, 'key.pem');
const CERT_PATH = path.join(CERT_DIR, 'cert.pem');

// Candidate openssl locations (system first, Git for Windows as fallback).
const OPENSSL_CANDIDATES = [
  'openssl',
  'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
  'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
  '/usr/bin/openssl',
  '/usr/local/bin/openssl',
];

function findOpenssl() {
  for (const candidate of OPENSSL_CANDIDATES) {
    try {
      execSync(`"${candidate}" version`, { stdio: 'pipe' });
      return candidate;
    } catch (_) {
      // not found at this path, try the next one
    }
  }
  return null;
}

function main() {
  const openssl = findOpenssl();
  if (!openssl) {
    console.error(
      'ERROR: openssl not found.\n' +
        'Install OpenSSL (https://slproweb.com/products/Win32OpenSSL.html) or\n' +
        'install Git for Windows (which bundles openssl).'
    );
    process.exit(1);
  }

  fs.mkdirSync(CERT_DIR, { recursive: true });

  console.log(`Using openssl: ${openssl}`);
  console.log(`Output directory: ${CERT_DIR}`);

  // Single command: generate 2048-bit RSA key + self-signed cert (365 days)
  const cmd =
    `"${openssl}" req -x509 -newkey rsa:2048` +
    ` -keyout "${KEY_PATH}"` +
    ` -out "${CERT_PATH}"` +
    ` -days 365 -nodes` +
    ` -subj "/CN=localhost/O=OIPP-Dev/C=IN"` +
    ` -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`;

  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch (err) {
    console.error('ERROR: Certificate generation failed.');
    console.error(err.stderr ? err.stderr.toString() : err.message);
    process.exit(1);
  }

  console.log('\nDevelopment certificate generated successfully.');
  console.log(`  Certificate : ${CERT_PATH}`);
  console.log(`  Private key : ${KEY_PATH}`);
  console.log('\nStart the server with HTTPS:');
  console.log(
    `  TLS_CERT_PATH=${CERT_PATH} TLS_KEY_PATH=${KEY_PATH} node backend/server.js`
  );
  console.log('\nDO NOT commit certs/ to git. It is in .gitignore.');
  console.log('DO NOT use this certificate in production.');
}

main();

