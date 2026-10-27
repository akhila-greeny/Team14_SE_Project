const bcrypt = require('bcryptjs');

/**
 * Standard salt rounds for bcrypt hashing.
 * Cost factor 10 provides strong resistance against brute-force attacks
 * while maintaining sub-100ms response times.
 */
const SALT_ROUNDS = 10;

/**
 * Validates whether a given string is a valid bcrypt hash format.
 * Format: $2a$, $2b$, or $2y$ followed by cost factor (2 digits), $, and 53 base64 characters.
 *
 * @param {string} hash
 * @returns {boolean}
 */
function isBcryptHash(hash) {
  if (typeof hash !== 'string') return false;
  return /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash);
}

/**
 * Asynchronously hashes a plaintext password using bcrypt with a generated salt.
 *
 * @param {string} plaintextPassword - The plaintext password to hash.
 * @param {number} [saltRounds=SALT_ROUNDS] - Cost factor for hashing.
 * @returns {Promise<string>} - Resolves to the salted bcrypt hash string.
 * @throws {TypeError} - If plaintextPassword is not a non-empty string.
 */
async function hashPassword(plaintextPassword, saltRounds = SALT_ROUNDS) {
  if (typeof plaintextPassword !== 'string' || plaintextPassword.length === 0) {
    throw new TypeError('Password must be a non-empty string');
  }
  return bcrypt.hash(plaintextPassword, saltRounds);
}

/**
 * Synchronously hashes a plaintext password using bcrypt with a generated salt.
 * Useful for seeding accounts during in-memory store initialization.
 *
 * @param {string} plaintextPassword - The plaintext password to hash.
 * @param {number} [saltRounds=SALT_ROUNDS] - Cost factor for hashing.
 * @returns {string} - The salted bcrypt hash string.
 * @throws {TypeError} - If plaintextPassword is not a non-empty string.
 */
function hashPasswordSync(plaintextPassword, saltRounds = SALT_ROUNDS) {
  if (typeof plaintextPassword !== 'string' || plaintextPassword.length === 0) {
    throw new TypeError('Password must be a non-empty string');
  }
  return bcrypt.hashSync(plaintextPassword, saltRounds);
}

/**
 * Asynchronously verifies a candidate plaintext password against a stored bcrypt hash.
 * Handles invalid or malformed inputs safely by returning false without throwing.
 *
 * @param {string} candidatePassword - The plaintext password submitted during login.
 * @param {string} storedHash - The bcrypt hash stored in the user record.
 * @returns {Promise<boolean>} - Resolves to true if password matches, false otherwise.
 */
async function verifyPassword(candidatePassword, storedHash) {
  if (
    typeof candidatePassword !== 'string' ||
    candidatePassword.length === 0 ||
    typeof storedHash !== 'string' ||
    !storedHash.startsWith('$2')
  ) {
    return false;
  }

  try {
    return await bcrypt.compare(candidatePassword, storedHash);
  } catch (err) {
    return false;
  }
}

/**
 * Synchronously verifies a candidate plaintext password against a stored bcrypt hash.
 *
 * @param {string} candidatePassword - The plaintext password submitted during login.
 * @param {string} storedHash - The bcrypt hash stored in the user record.
 * @returns {boolean} - True if password matches, false otherwise.
 */
function verifyPasswordSync(candidatePassword, storedHash) {
  if (
    typeof candidatePassword !== 'string' ||
    candidatePassword.length === 0 ||
    typeof storedHash !== 'string' ||
    !storedHash.startsWith('$2')
  ) {
    return false;
  }

  try {
    return bcrypt.compareSync(candidatePassword, storedHash);
  } catch (err) {
    return false;
  }
}

/**
 * Sanitizes a user object for safe inclusion in API responses.
 * Strictly strips passwordHash and any sensitive authentication fields.
 *
 * @param {object} user - The user account object.
 * @returns {object} - Safe user object containing only public/client-facing fields.
 */
function sanitizeUser(user) {
  if (!user || typeof user !== 'object') return null;
  const { passwordHash, password, otp, ...safeUser } = user;
  return safeUser;
}

module.exports = {
  SALT_ROUNDS,
  isBcryptHash,
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  verifyPasswordSync,
  sanitizeUser,
};
