const { hashPasswordSync } = require('../utils/password');
const { normalizeEmail } = require('../utils/emailValidator');
const { STUDENT, TPO } = require('../utils/roles');

// Temporary in-memory storage for users and pending registrations (Sprint 1 approach).
let users = [];
let nextId = 1;
const pendingRegistrations = new Map();

/**
 * Initializes default seeded accounts for demonstration and testing.
 * Seeded accounts are already verified and not treated as pending.
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
    },
    {
      id: nextId++,
      email: 'tpo@pes.edu',
      passwordHash: hashPasswordSync('tpo123'),
      role: TPO,
      isVerified: true,
      createdAt: new Date().toISOString(),
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
  };

  users.push(user);
  pendingRegistrations.delete(norm);
  return user;
}

/**
 * Resets the in-memory store to its initial seeded state. Useful for test isolation.
 */
function resetStore() {
  nextId = 1;
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
};
