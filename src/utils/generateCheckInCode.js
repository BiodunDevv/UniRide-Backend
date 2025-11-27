/**
 * Generate a random 4-digit check-in code
 * @returns {String} 4-digit code
 */
const generateCheckInCode = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

module.exports = generateCheckInCode;
