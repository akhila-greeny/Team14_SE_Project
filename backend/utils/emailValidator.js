const APPROVED_DOMAIN = (process.env.INSTITUTION_EMAIL_DOMAIN || 'stu.pes.edu')
  .trim()
  .replace(/^@/, '')
  .toLowerCase();

/**
 * Normalizes an email address for consistent comparison and duplicate checking.
 * Trims leading/trailing whitespace and converts to lowercase.
 *
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  if (typeof email !== 'string') {
    return '';
  }
  return email.trim().toLowerCase();
}

/**
 * Validates email syntax and enforces restriction to the institution's approved email domain.
 *
 * @param {string} email - The candidate email address to validate.
 * @param {string} [allowedDomain] - Optional override for approved domain (defaults to APPROVED_DOMAIN).
 * @returns {{ isValid: boolean, normalized: string|null, error: string|null }}
 */
function validateInstitutionalEmail(email, allowedDomain = APPROVED_DOMAIN) {
  if (!email || typeof email !== 'string' || !email.trim()) {
    return {
      isValid: false,
      normalized: null,
      error: 'Email is required',
    };
  }

  const normalized = normalizeEmail(email);

  // Validate basic email structure (local-part@domain-part)
  // Ensures single '@', valid characters, no leading/trailing dots or consecutive dots
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+)$/;

  const match = normalized.match(emailRegex);
  if (!match) {
    return {
      isValid: false,
      normalized: null,
      error: 'Malformed email address',
    };
  }

  const domain = match[1];
  const targetDomain = (allowedDomain || APPROVED_DOMAIN)
    .trim()
    .replace(/^@/, '')
    .toLowerCase();

  // Strict domain-boundary equality check (prevents lookalike and suffix-extended domains)
  if (domain !== targetDomain) {
    return {
      isValid: false,
      normalized: null,
      error: `Email domain must be @${targetDomain}`,
    };
  }

  return {
    isValid: true,
    normalized,
    error: null,
  };
}

module.exports = {
  APPROVED_DOMAIN,
  normalizeEmail,
  validateInstitutionalEmail,
};
