/**
 * Generate a random 6-digit verification code
 * @returns {String} 6-digit code
 */
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

module.exports = generateVerificationCode;
