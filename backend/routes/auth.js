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
} = require('../data/usersStore');

const router = express.Router();

/** Strict five-minute OTP expiry in milliseconds */
const OTP_EXPIRY_MS = 5 * 60 * 1000;

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

module.exports = router;
