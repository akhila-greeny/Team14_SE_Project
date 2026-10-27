const DEFAULT_APPROVED_DOMAINS = ['stu.pes.edu', 'pes.edu'];

const rawEnvDomains = process.env.INSTITUTION_EMAIL_DOMAINS || process.env.INSTITUTION_EMAIL_DOMAIN;

const APPROVED_DOMAINS = rawEnvDomains
  ? rawEnvDomains.split(',').map((d) => d.trim().replace(/^@/, '').toLowerCase()).filter(Boolean)
  : DEFAULT_APPROVED_DOMAINS;

// Primary student domain for backward compatibility
const APPROVED_DOMAIN = APPROVED_DOMAINS[0];

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
 * Validates email syntax and enforces restriction to the institution's approved email domains.
 * Allows both student (@stu.pes.edu) and faculty/teacher (@pes.edu) domains.
 *
 * @param {string} email - The candidate email address to validate.
 * @param {string|string[]} [allowedDomains] - Optional override for approved domains.
 * @returns {{ isValid: boolean, normalized: string|null, error: string|null }}
 */
function validateInstitutionalEmail(email, allowedDomains = APPROVED_DOMAINS) {
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

  // Normalize allowed target domains
  const targetList = Array.isArray(allowedDomains)
    ? allowedDomains
    : [allowedDomains || APPROVED_DOMAIN];

  const targetDomains = targetList
    .map((d) => String(d).trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean);

  // Strict domain-boundary check: exact match against approved domains list
  if (!targetDomains.includes(domain)) {
    const formattedTargets = targetDomains.map((d) => `@${d}`).join(' or ');
    return {
      isValid: false,
      normalized: null,
      error: `Email domain must be ${formattedTargets}`,
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
  APPROVED_DOMAINS,
  normalizeEmail,
  validateInstitutionalEmail,
};
