const { hashPasswordSync } = require('../utils/password');
const { normalizeEmail } = require('../utils/emailValidator');
const { STUDENT, TPO } = require('../utils/roles');
const crypto = require('crypto');

// Temporary in-memory storage for users and pending registrations (Sprint 1 approach).
let users = [];
let nextId = 1;
const pendingRegistrations = new Map();

// In-memory store for password reset tokens (OIPP-F-003, Issue #3).
// Key: SHA-256 hex digest of the raw token.  Value: { tokenHash, userId, expiresAt }.
const passwordResetTokens = new Map();

// ---------------------------------------------------------------------------
// Account lockout constants (OIPP-SR-004, Issue #29)
// ---------------------------------------------------------------------------
/** Maximum consecutive failed login attempts before the account is locked. */
const LOCKOUT_MAX_ATTEMPTS = 5;
/** Lockout duration in milliseconds (15 minutes). */
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/**
 * Initializes default seeded accounts for demonstration and testing.
 * Seeded accounts are already verified and not treated as pending.
 * Each user record also carries lockout tracking fields.
 */
function initSeedAccounts() {
  users = [
    {
      id: nextId++,
      email: 'student@stu.pes.edu',
      passwordHash: hashPasswordSync('student123'),
      role: STUDENT,
      isVerified: true,
      createdAt: new Date().toISOString(),
      // Lockout state (OIPP-SR-004)
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    {
      id: nextId++,
      email: 'tpo@pes.edu',
      passwordHash: hashPasswordSync('tpo123'),
      role: TPO,
      isVerified: true,
      createdAt: new Date().toISOString(),
      // Lockout state (OIPP-SR-004)
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  ];
  pendingRegistrations.clear();
}

// Seed on startup
initSeedAccounts();

/**
 * Finds an active verified user by email.
 *
 * @param {string} email
 * @returns {object|null}
 */
function findUserByEmail(email) {
  const norm = normalizeEmail(email);
  return users.find((u) => u.email === norm && u.isVerified) || null;
}

/**
 * Finds an active verified user by numeric ID.
 *
 * @param {number|string} id
 * @returns {object|null}
 */
function findUserById(id) {
  const numId = Number(id);
  return users.find((u) => u.id === numId && u.isVerified) || null;
}

/**
 * Returns all verified users.
 *
 * @returns {Array}
 */
function listUsers() {
  return users;
}

/**
 * Creates or updates a pending registration with a hashed password and OTP.
 *
 * @param {string} email - Normalized email address.
 * @param {string} passwordHash - bcrypt-hashed password.
 * @param {string} otp - Cryptographically generated OTP.
 * @param {number} expiresAt - Timestamp when the OTP expires.
 * @returns {object}
 */
function createPendingRegistration(email, passwordHash, otp, expiresAt) {
  const norm = normalizeEmail(email);
  const pending = {
    email: norm,
    passwordHash,
    otp: String(otp).trim(),
    expiresAt: Number(expiresAt),
    createdAt: Date.now(),
  };
  pendingRegistrations.set(norm, pending);
  return pending;
}

/**
 * Retrieves a pending registration by email.
 *
 * @param {string} email
 * @returns {object|null}
 */
function getPendingRegistration(email) {
  const norm = normalizeEmail(email);
  return pendingRegistrations.get(norm) || null;
}

/**
 * Removes a pending registration.
 *
 * @param {string} email
 * @returns {boolean}
 */
function deletePendingRegistration(email) {
  const norm = normalizeEmail(email);
  return pendingRegistrations.delete(norm);
}

/**
 * Moves a pending registration into verified users.
 * Automatically deletes the pending record to prevent OTP reuse.
 *
 * @param {string} email
 * @returns {object|null}
 */
function completeRegistration(email) {
  const norm = normalizeEmail(email);
  const pending = pendingRegistrations.get(norm);
  if (!pending) {
    return null;
  }

  const user = {
    id: nextId++,
    email: pending.email,
    passwordHash: pending.passwordHash,
    role: STUDENT,
    isVerified: true,
    createdAt: new Date().toISOString(),
    // Lockout state initialised for new accounts (OIPP-SR-004)
    failedLoginAttempts: 0,
    lockedUntil: null,
  };

  users.push(user);
  pendingRegistrations.delete(norm);
  return user;
}

// ---------------------------------------------------------------------------
// Password reset token helpers (OIPP-F-003, Issue #3)
// ---------------------------------------------------------------------------

/**
 * Computes the SHA-256 hex digest of a raw reset token string.
 * Only the digest is stored; the raw token travels only in the reset URL.
 *
 * @param {string} rawToken
 * @returns {string} SHA-256 hex digest
 */
function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Stores a hashed reset token for a given user ID with an expiry timestamp.
 * Any previous token for the same user is overwritten (one active token per user).
 *
 * @param {number} userId
 * @param {string} rawToken - The raw (unhashed) token; only the hash is stored.
 * @param {number} expiresAt - Unix-ms timestamp when the token expires.
 * @returns {string} The tokenHash that was stored.
 */
function storeResetToken(userId, rawToken, expiresAt) {
  const tokenHash = hashResetToken(rawToken);
  passwordResetTokens.set(tokenHash, {
    tokenHash,
    userId: Number(userId),
    expiresAt: Number(expiresAt),
  });
  return tokenHash;
}

/**
 * Looks up a reset-token record by the raw (unhashed) token value.
 * Returns null if no matching record exists.
 *
 * @param {string} rawToken
 * @returns {{ tokenHash: string, userId: number, expiresAt: number }|null}
 */
function findResetToken(rawToken) {
  const tokenHash = hashResetToken(rawToken);
  return passwordResetTokens.get(tokenHash) || null;
}

/**
 * Deletes the reset-token record identified by its raw token value.
 * Call this after a successful password reset to prevent reuse.
 *
 * @param {string} rawToken
 * @returns {boolean}
 */
function deleteResetToken(rawToken) {
  const tokenHash = hashResetToken(rawToken);
  return passwordResetTokens.delete(tokenHash);
}

/**
 * Updates the passwordHash field on the user object identified by userId.
 * Returns the updated user object or null if not found.
 *
 * @param {number} userId
 * @param {string} newPasswordHash - New bcrypt hash.
 * @returns {object|null}
 */
function updateUserPassword(userId, newPasswordHash) {
  const numId = Number(userId);
  const user = users.find((u) => u.id === numId);
  if (!user) return null;
  user.passwordHash = newPasswordHash;
  return user;
}

// ---------------------------------------------------------------------------
// Account lockout helpers (OIPP-SR-004, Issue #29)
// ---------------------------------------------------------------------------

/**
 * Returns true if the user's account is currently locked.
 * A lock is active when lockedUntil is a future timestamp.
 *
 * @param {object} user - User record from the store.
 * @returns {boolean}
 */
function isAccountLocked(user) {
  if (!user || !user.lockedUntil) return false;
  return Date.now() < user.lockedUntil;
}

/**
 * Returns the remaining lockout duration in milliseconds, or 0 if not locked.
 *
 * @param {object} user
 * @returns {number}
 */
function lockoutRemainingMs(user) {
  if (!isAccountLocked(user)) return 0;
  return user.lockedUntil - Date.now();
}

/**
 * Records a failed login attempt for the given user.
 * If the failure count reaches LOCKOUT_MAX_ATTEMPTS, the account is locked
 * for LOCKOUT_DURATION_MS milliseconds.
 *
 * @param {object} user - Live user record (mutated in place).
 * @returns {{ locked: boolean, attempts: number, lockedUntil: number|null }}
 */
function recordFailedLogin(user) {
  user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

  if (user.failedLoginAttempts >= LOCKOUT_MAX_ATTEMPTS) {
    user.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
  }

  return {
    locked: isAccountLocked(user),
    attempts: user.failedLoginAttempts,
    lockedUntil: user.lockedUntil || null,
  };
}

/**
 * Resets the failed-login counter and clears any active lock.
 * Called on successful authentication.
 *
 * @param {object} user - Live user record (mutated in place).
 */
function resetFailedLogins(user) {
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
}

/**
 * Resets the in-memory store to its initial seeded state. Useful for test isolation.
 */
function resetStore() {
  nextId = 1;
  passwordResetTokens.clear();
  initSeedAccounts();
}

module.exports = {
  findUserByEmail,
  findUserById,
  listUsers,
  createPendingRegistration,
  getPendingRegistration,
  deletePendingRegistration,
  completeRegistration,
  resetStore,
  // Password reset (OIPP-F-003)
  storeResetToken,
  findResetToken,
  deleteResetToken,
  updateUserPassword,
  // Account lockout (OIPP-SR-004)
  LOCKOUT_MAX_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  isAccountLocked,
  lockoutRemainingMs,
  recordFailedLogin,
  resetFailedLogins,
};
