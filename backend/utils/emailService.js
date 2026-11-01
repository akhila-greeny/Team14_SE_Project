/**
 * Email delivery abstraction (OIPP-F-003, Issue #3).
 *
 * In Sprint 2, no live SMTP service is configured.  This module provides a
 * pluggable interface so that a real transactional email provider (e.g. SendGrid,
 * AWS SES, Nodemailer + SMTP) can be wired in by setting environment variables
 * without changing any route logic.
 *
 * PRODUCTION CONFIGURATION
 * ========================
 * Set the following environment variables before starting the server:
 *
 *   EMAIL_PROVIDER=smtp          # Currently: only 'smtp' placeholder is defined.
 *   SMTP_HOST=smtp.example.com
 *   SMTP_PORT=587
 *   SMTP_USER=no-reply@pes.edu
 *   SMTP_PASS=<app-password>
 *   EMAIL_FROM=no-reply@pes.edu
 *
 * Until those variables are set, the module falls back to DEV mode: the reset
 * link is written to stdout (server console) prefixed with [EMAIL DEV].  This
 * is intentional and documented in docs/deviations.md.
 *
 * The raw reset token is printed to the console ONLY in dev mode.  In
 * production (when EMAIL_PROVIDER is set) it travels exclusively inside the
 * HTTPS link sent to the user's inbox and is never written to any log.
 */

const DEV_MODE = !process.env.EMAIL_PROVIDER;

/**
 * Sends a password-reset email containing a one-time link.
 *
 * @param {string} toEmail        - Recipient institutional email address.
 * @param {string} resetLink      - Full HTTPS reset URL containing the raw token.
 * @returns {Promise<void>}
 * @throws {Error} If production delivery fails.
 */
async function sendPasswordResetEmail(toEmail, resetLink) {
  if (DEV_MODE) {
    // -----------------------------------------------------------------------
    // DEV / TEST mode: write to console instead of sending real email.
    // The reset link contains the raw token — never log it in production.
    // -----------------------------------------------------------------------
    console.log('[EMAIL DEV] Password-reset link for', toEmail, ':');
    console.log('[EMAIL DEV]', resetLink);
    return;
  }

  // -------------------------------------------------------------------------
  // PRODUCTION stub: integrate a real transactional email library here.
  // Example with nodemailer (install separately if needed):
  //
  //   const nodemailer = require('nodemailer');
  //   const transporter = nodemailer.createTransport({
  //     host: process.env.SMTP_HOST,
  //     port: Number(process.env.SMTP_PORT) || 587,
  //     auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  //   });
  //   await transporter.sendMail({
  //     from: process.env.EMAIL_FROM,
  //     to: toEmail,
  //     subject: 'OIPP – Password Reset',
  //     text: `Use the link below to reset your password (valid for 1 hour):\n\n${resetLink}\n\nIf you did not request this, ignore this email.`,
  //   });
  //
  // -------------------------------------------------------------------------
  throw new Error(
    'EMAIL_PROVIDER is set but no production email transport is configured. ' +
      'Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and implement the transporter.'
  );
}

module.exports = { sendPasswordResetEmail, DEV_MODE };
