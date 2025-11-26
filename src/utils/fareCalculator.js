const appConfig = require('../config/appConfig');
const logger = require('../config/logger');

/**
 * Calculate fare based on current fare policy
 * @param {object} options - Fare calculation options
 * @param {string} options.mode - Fare mode: 'admin', 'driver', 'distance_auto'
 * @param {number} options.distanceMeters - Distance in meters (for distance_auto mode)
 * @param {number} options.driverFare - Driver-set fare (for driver mode)
 * @param {number} options.adminFare - Admin-set fare (for admin mode)
 * @returns {object} - { fare, source }
 */
const calculateFare = (options = {}) => {
  const {
    mode = appConfig.farePolicy.mode,
    distanceMeters = 0,
    driverFare = null,
    adminFare = null,
  } = options;

  let fare = 0;
  let source = mode;

  try {
    switch (mode) {
      case 'admin':
        // Use admin-provided fare or default
        fare = adminFare || appConfig.farePolicy.defaultFare;
        source = 'admin';
        break;

      case 'driver':
        // Use driver-provided fare or default
        fare = driverFare || appConfig.farePolicy.defaultFare;
        source = 'driver';
        break;

      case 'distance_auto':
        // Calculate based on distance
        if (distanceMeters > 0) {
          fare = appConfig.farePolicy.baseFee + (distanceMeters * appConfig.farePolicy.perMeterRate);
          fare = Math.round(fare); // Round to nearest whole number
        } else {
          fare = appConfig.farePolicy.defaultFare;
        }
        source = 'distance_auto';
        break;

      default:
        logger.warn(`Unknown fare mode: ${mode}. Using default fare.`);
        fare = appConfig.farePolicy.defaultFare;
        source = 'admin';
    }

    // Ensure fare is not negative
    if (fare < 0) {
      fare = appConfig.farePolicy.defaultFare;
    }

    return {
      fare: Math.round(fare),
      source,
    };
  } catch (error) {
    logger.error(`Error calculating fare: ${error.message}`);
    return {
      fare: appConfig.farePolicy.defaultFare,
      source: 'admin',
    };
  }
};

/**
 * Calculate fare based on distance only
 * @param {number} distanceMeters - Distance in meters
 * @returns {number} - Calculated fare
 */
const calculateDistanceBasedFare = (distanceMeters) => {
  if (!distanceMeters || distanceMeters <= 0) {
    return appConfig.farePolicy.defaultFare;
  }

  const fare = appConfig.farePolicy.baseFee + (distanceMeters * appConfig.farePolicy.perMeterRate);
  return Math.round(fare);
};

/**
 * Get fare policy configuration
 * @returns {object} - Current fare policy
 */
const getFarePolicy = () => {
  return {
    mode: appConfig.farePolicy.mode,
    baseFee: appConfig.farePolicy.baseFee,
    perMeterRate: appConfig.farePolicy.perMeterRate,
    defaultFare: appConfig.farePolicy.defaultFare,
  };
};

/**
 * Validate fare amount
 * @param {number} fare - Fare to validate
 * @returns {boolean}
 */
const validateFare = (fare) => {
  if (typeof fare !== 'number' || isNaN(fare)) {
    return false;
  }
  if (fare < 0) {
    return false;
  }
  return true;
};

/**
 * Format fare for display (e.g., add currency symbol)
 * @param {number} fare - Fare amount
 * @param {string} currency - Currency symbol (default: ₦)
 * @returns {string}
 */
const formatFare = (fare, currency = '₦') => {
  return `${currency}${fare.toFixed(2)}`;
};

module.exports = {
  calculateFare,
  calculateDistanceBasedFare,
  getFarePolicy,
  validateFare,
  formatFare,
};
