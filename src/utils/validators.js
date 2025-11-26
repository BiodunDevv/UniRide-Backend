const appConfig = require('../config/appConfig');

/**
 * Validate email format
 * @param {string} email
 * @returns {boolean}
 */
const validateEmail = (email) => {
  const emailRegex = /^\S+@\S+\.\S+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number format
 * @param {string} phone
 * @returns {boolean}
 */
const validatePhone = (phone) => {
  const phoneRegex = /^[0-9+\-\s()]+$/;
  return phoneRegex.test(phone);
};

/**
 * Validate matriculation number format
 * @param {string} matricNo
 * @returns {boolean}
 */
const validateMatricNo = (matricNo) => {
  // Example: ABC/2020/12345 or similar patterns
  // Adjust regex based on your institution's format
  if (!matricNo || typeof matricNo !== 'string') return false;
  return matricNo.trim().length > 0;
};

/**
 * Validate student level
 * @param {number} level
 * @returns {boolean}
 */
const validateLevel = (level) => {
  return appConfig.student.allowedLevels.includes(level);
};

/**
 * Validate coordinates [longitude, latitude]
 * @param {array} coordinates
 * @returns {boolean}
 */
const validateCoordinates = (coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return false;
  }

  const [longitude, latitude] = coordinates;

  if (typeof longitude !== 'number' || typeof latitude !== 'number') {
    return false;
  }

  // Longitude: -180 to 180
  // Latitude: -90 to 90
  if (longitude < -180 || longitude > 180) {
    return false;
  }

  if (latitude < -90 || latitude > 90) {
    return false;
  }

  return true;
};

/**
 * Validate GeoJSON Point object
 * @param {object} point
 * @returns {boolean}
 */
const validateGeoJSONPoint = (point) => {
  if (!point || typeof point !== 'object') {
    return false;
  }

  if (point.type !== 'Point') {
    return false;
  }

  return validateCoordinates(point.coordinates);
};

/**
 * Validate password strength
 * @param {string} password
 * @returns {object} - { valid, message }
 */
const validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }

  if (password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters' };
  }

  // Optional: Add more complex requirements
  // const hasUpperCase = /[A-Z]/.test(password);
  // const hasLowerCase = /[a-z]/.test(password);
  // const hasNumber = /[0-9]/.test(password);
  // const hasSpecialChar = /[!@#$%^&*]/.test(password);

  return { valid: true, message: 'Password is valid' };
};

/**
 * Validate Cloudinary URL
 * @param {string} url
 * @returns {boolean}
 */
const validateCloudinaryURL = (url) => {
  if (!url || typeof url !== 'string') return false;
  
  // Check if URL contains cloudinary domain
  const cloudinaryRegex = /^https?:\/\/res\.cloudinary\.com\/.+/;
  return cloudinaryRegex.test(url);
};

/**
 * Validate bank account number (basic validation)
 * @param {string} accountNumber
 * @returns {boolean}
 */
const validateBankAccountNumber = (accountNumber) => {
  if (!accountNumber || typeof accountNumber !== 'string') return false;
  
  // Remove spaces and check if it's numeric
  const cleaned = accountNumber.replace(/\s/g, '');
  const bankAccountRegex = /^\d{10,20}$/; // 10 to 20 digits
  
  return bankAccountRegex.test(cleaned);
};

/**
 * Validate plate number format
 * @param {string} plateNumber
 * @returns {boolean}
 */
const validatePlateNumber = (plateNumber) => {
  if (!plateNumber || typeof plateNumber !== 'string') return false;
  
  // Basic validation - adjust based on local format
  const cleaned = plateNumber.replace(/\s/g, '');
  return cleaned.length >= 3 && cleaned.length <= 20;
};

/**
 * Validate check-in code format (4 digits)
 * @param {string} code
 * @returns {boolean}
 */
const validateCheckInCode = (code) => {
  const codeRegex = /^\d{4}$/;
  return codeRegex.test(code);
};

/**
 * Validate rating (1-5)
 * @param {number} rating
 * @returns {boolean}
 */
const validateRating = (rating) => {
  if (typeof rating !== 'number') return false;
  return rating >= 1 && rating <= 5;
};

/**
 * Sanitize input string (remove potentially harmful characters)
 * @param {string} input
 * @returns {string}
 */
const sanitizeString = (input) => {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove < and >
    .slice(0, 1000); // Limit length
};

/**
 * Validate object ID format (MongoDB ObjectId)
 * @param {string} id
 * @returns {boolean}
 */
const validateObjectId = (id) => {
  if (!id || typeof id !== 'string') return false;
  
  const objectIdRegex = /^[0-9a-fA-F]{24}$/;
  return objectIdRegex.test(id);
};

module.exports = {
  validateEmail,
  validatePhone,
  validateMatricNo,
  validateLevel,
  validateCoordinates,
  validateGeoJSONPoint,
  validatePassword,
  validateCloudinaryURL,
  validateBankAccountNumber,
  validatePlateNumber,
  validateCheckInCode,
  validateRating,
  sanitizeString,
  validateObjectId,
};
