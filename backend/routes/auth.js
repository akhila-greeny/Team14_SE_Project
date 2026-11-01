const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validateInstitutionalEmail, normalizeEmail } = require('../utils/emailValidator');
const { hashPassword, verifyPassword } = require('../utils/password');
const {
  findUserByEmail,
  createPendingRegistration,
  getPendingRegistration,
  deletePendingRegistration,
  completeRegistration,
  storeResetToken,
  findResetToken,
  deleteResetToken,
  updateUserPassword,
} = require('../data/usersStore');
const { sendPasswordResetEmail } = require('../utils/emailService');

const router = express.Router();

/** Strict five-minute OTP expiry in milliseconds */
const OTP_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Password-reset token expiry (configurable via env, default 1 hour).
 * RESET_TOKEN_EXPIRY_MS can be overridden in tests by setting the env variable
 * before requiring this module, but the safest override is via the environment.
 */
const RESET_TOKEN_EXPIRY_MS = Number(process.env.RESET_TOKEN_EXPIRY_MS) || 60 * 60 * 1000;

/**
 * The base URL used when constructing reset links.
 * Set RESET_BASE_URL in production (e.g. https://oipp.pes.edu).
 * Falls back to localhost for development.
 */
const RESET_BASE_URL = process.env.RESET_BASE_URL || 'http://localhost:3000';

/**
 * Generates an unpredictable 6-digit numeric OTP using a cryptographically secure random generator.
 *
 * @returns {string} 6-digit OTP string
 */
function generateSecureOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * POST /api/auth/register
 * Initiates student registration and issues a 5-minute OTP.
 */
router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({
      error_code: 'VALIDATION_ERROR',
      message: 'Email is required',
    });
  }

  // Enforce institutional domain restriction & syntax validation (OIPP-SR-003, Issue #28)
  const validation = validateInstitutionalEmail(email);
  if (!validation.isValid) {
    return res.status(400).json({
      error_code: 'INVALID_EMAIL',
      message: validation.error,
    });
  }

  const normalizedEmail = validation.normalized;

  // Prevent duplicate registration for already verified accounts
  if (findUserByEmail(normalizedEmail)) {
    return res.status(409).json({
      error_code: 'EMAIL_ALREADY_REGISTERED',
      message: 'An account with this institutional email is already registered',
    });
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({
      error_code: 'VALIDATION_ERROR',
      message: 'Password must be at least 6 characters long',
    });
  }

  try {
    // Hash password before saving pending registration (OIPP-SR-002, Issue #27)
    const passwordHash = await hashPassword(password);

    // Cryptographically secure OTP with strict 5-minute expiry (OIPP-F-001, Issue #1)
    const otp = generateSecureOtp();
    const expiresAt = Date.now() + OTP_EXPIRY_MS;

    createPendingRegistration(normalizedEmail, passwordHash, otp, expiresAt);

    // Sprint 1 limitation: log OTP to console for development verification without live SMTP
    console.log(`[AUTH OTP DEV] Verification OTP for ${normalizedEmail}: ${otp} (expires in 5 minutes)`);

    // Never return the OTP in ordinary API responses
    return res.status(200).json({
      message: 'OTP sent to institutional email',
    });
  } catch (err) {
    return res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'Failed to process registration request',
    });
  }
});

/**
 * POST /api/auth/verify-otp
 * Verifies submitted OTP and finalizes student account registration.
 */
router.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body;

  if (!email || typeof email !== 'string' || !email.trim() || !otp) {
    return res.status(400).json({
      error_code: 'VALIDATION_ERROR',
      message: 'Email and OTP are required',
    });
  }

  const normalizedEmail = normalizeEmail(email);

  // If already verified, reject redundant verification
  if (findUserByEmail(normalizedEmail)) {
    return res.status(409).json({
      error_code: 'ALREADY_VERIFIED',
      message: 'Account is already verified',
    });
  }

  const pending = getPendingRegistration(normalizedEmail);
  if (!pending) {
    return res.status(400).json({
      error_code: 'INVALID_OTP',
      message: 'No pending registration found for this email',
    });
  }

  // Reject expired OTPs
  if (Date.now() > pending.expiresAt) {
    deletePendingRegistration(normalizedEmail);
    return res.status(400).json({
      error_code: 'OTP_EXPIRED',
      message: 'OTP has expired',
    });
  }

  // Reject incorrect OTPs
  if (String(pending.otp).trim() !== String(otp).trim()) {
    return res.status(400).json({
      error_code: 'INVALID_OTP',
      message: 'Invalid OTP',
    });
  }

  // Verification successful: complete registration and delete pending record (prevents reuse)
  const user = completeRegistration(normalizedEmail);
  if (!user) {
    return res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'Failed to complete registration',
    });
  }

  return res.status(201).json({
    message: 'Registration verified successfully',
    studentId: user.id,
  });
});

/**
 * POST /api/auth/login
 * Authenticates student or TPO credentials and issues an 8-hour signed JWT.
 * (OIPP-F-002, Issue #2)
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string' || !email.trim() || !password || typeof password !== 'string') {
    return res.status(400).json({
      error_code: 'VALIDATION_ERROR',
      message: 'Email and password are required',
    });
  }

  const normalizedEmail = normalizeEmail(email);
  const user = findUserByEmail(normalizedEmail);

  // Reject missing or unverified accounts with generic 401 message
  if (!user || !user.isVerified) {
    return res.status(401).json({
      error_code: 'UNAUTHORIZED',
      message: 'Invalid credentials',
    });
  }

  // Verify password using bcryptjs against stored hash
  const isMatch = await verifyPassword(password, user.passwordHash);
  if (!isMatch) {
    return res.status(401).json({
      error_code: 'UNAUTHORIZED',
      message: 'Invalid credentials',
    });
  }

  // Issue 8-hour JWT with payload { id, role } per team lead contract
  const secret = process.env.JWT_SECRET || 'dev-secret';
  const token = jwt.sign(
    { id: user.id, role: user.role },
    secret,
    { expiresIn: '8h' }
  );

  // Return standard response conforming to SAD Section 4.3
  return res.status(200).json({
    token,
    studentId: user.id,
    expiresIn: '8h',
  });
});

// ---------------------------------------------------------------------------
// OIPP-F-003 – Password Reset via Time-Limited Link (Issue #3)
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/forgot-password
 *
 * Accepts an institutional email address.  If the address belongs to a
 * registered, verified account a time-limited reset link is sent (or, in
 * development/test mode, printed to the server console).
 *
 * To avoid user-enumeration the response is identical whether or not the
 * email is registered.
 *
 * AC-003 requirement: token must be unpredictable, time-limited and stored
 * only as a cryptographic hash.
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  // Basic validation – always return same generic response to avoid leaking
  // whether the address is registered.
  if (!email || typeof email !== 'string' || !email.trim()) {
    // Still return 200 with generic message to avoid distinguishing invalid
    // input from a missing account.
    return res.status(200).json({
      message: 'If that email address is registered, a reset link has been sent.',
    });
  }

  // Validate & normalize using the existing emailValidator
  const validation = validateInstitutionalEmail(email);
  const normalizedEmail = validation.isValid ? validation.normalized : normalizeEmail(email);

  // Intentionally async – perform all work inside try/catch but still return
  // the same response whether the account exists or not.
  try {
    const user = findUserByEmail(normalizedEmail);

    if (user) {
      // 1. Generate a cryptographically unpredictable 32-byte raw token.
      const rawToken = crypto.randomBytes(32).toString('hex');

      // 2. Store only the SHA-256 hash; the raw token goes in the URL only.
      const expiresAt = Date.now() + RESET_TOKEN_EXPIRY_MS;
      storeResetToken(user.id, rawToken, expiresAt);

      // 3. Construct the reset link (real deployment uses HTTPS + RESET_BASE_URL).
      const resetLink = `${RESET_BASE_URL}/reset-password?token=${rawToken}`;

      // 4. Deliver the link via the email abstraction.
      //    In DEV mode this prints to console; in production it calls the SMTP
      //    transport.  Delivery errors are caught and logged but do not change
      //    the response to the caller.
      await sendPasswordResetEmail(normalizedEmail, resetLink).catch((err) => {
        console.error('[AUTH] Failed to deliver password-reset email:', err.message);
      });
    }
  } catch (err) {
    // Log internal errors but do not expose details in the response.
    console.error('[AUTH] forgot-password internal error:', err.message);
  }

  // Same response regardless of whether the email was found (avoids enumeration).
  return res.status(200).json({
    message: 'If that email address is registered, a reset link has been sent.',
  });
});

/**
 * POST /api/auth/reset-password
 *
 * Validates a reset token submitted by the client, then updates the account
 * password if the token is valid and unexpired.
 *
 * Body: { token: string, newPassword: string }
 *
 * AC-003 requirements verified here:
 *  - Token is validated against the stored hash.
 *  - Expired tokens are rejected.
 *  - The raw token is invalidated (deleted) immediately after use.
 *  - The new password is hashed using the existing hashPassword utility.
 *  - The stored passwordHash is updated on the user record.
 */
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({
      error_code: 'VALIDATION_ERROR',
      message: 'Reset token is required',
    });
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({
      error_code: 'VALIDATION_ERROR',
      message: 'New password must be at least 6 characters long',
    });
  }

  // Look up the token record by hashing the submitted raw token.
  const record = findResetToken(token.trim());

  if (!record) {
    return res.status(400).json({
      error_code: 'INVALID_RESET_TOKEN',
      message: 'Invalid or expired reset token',
    });
  }

  // Reject expired tokens.
  if (Date.now() > record.expiresAt) {
    // Clean up expired token.
    deleteResetToken(token.trim());
    return res.status(400).json({
      error_code: 'RESET_TOKEN_EXPIRED',
      message: 'Invalid or expired reset token',
    });
  }

  try {
    // Hash the new password using the existing utility.
    const newPasswordHash = await hashPassword(newPassword);

    // Update the user's password.
    const updated = updateUserPassword(record.userId, newPasswordHash);
    if (!updated) {
      return res.status(500).json({
        error_code: 'INTERNAL_ERROR',
        message: 'Failed to update password',
      });
    }

    // Invalidate the token immediately to prevent reuse.
    deleteResetToken(token.trim());

    return res.status(200).json({
      message: 'Password has been reset successfully',
    });
  } catch (err) {
    console.error('[AUTH] reset-password internal error:', err.message);
    return res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'Failed to process password reset',
    });
  }
});

module.exports = router;
