const crypto = require('crypto');

/**
 * Generate a random 4-digit check-in code
 * @returns {string} - 4-digit code
 */
const generateCheckInCode = () => {
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  return code;
};

/**
 * Generate a cryptographically secure 4-digit code
 * @returns {string} - 4-digit code
 */
const generateSecureCheckInCode = () => {
  const randomNum = crypto.randomInt(1000, 10000);
  return randomNum.toString();
};

/**
 * Validate check-in code format
 * @param {string} code - Code to validate
 * @returns {boolean}
 */
const validateCheckInCode = (code) => {
  const codeRegex = /^\d{4}$/;
  return codeRegex.test(code);
};

/**
 * Check if check-in code is expired
 * @param {Date} expiryDate - Expiry date of the code
 * @returns {boolean}
 */
const isCheckInCodeExpired = (expiryDate) => {
  if (!expiryDate) return true;
  return new Date() > new Date(expiryDate);
};

/**
 * Get check-in code expiry time
 * @param {number} expirySeconds - Expiry duration in seconds (default: 600 = 10 minutes)
 * @returns {Date}
 */
const getCheckInCodeExpiry = (expirySeconds = 600) => {
  return new Date(Date.now() + expirySeconds * 1000);
};

module.exports = {
  generateCheckInCode,
  generateSecureCheckInCode,
  validateCheckInCode,
  isCheckInCodeExpired,
  getCheckInCodeExpiry,
};
