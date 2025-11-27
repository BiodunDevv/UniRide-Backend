const FarePolicy = require("../models/FarePolicy");

/**
 * Calculate fare based on distance and duration
 * @param {Number} distanceMeters Distance in meters
 * @param {Number} durationSeconds Duration in seconds
 * @param {String} fareMode Optional fare mode override
 * @returns {Number} Calculated fare
 */
const calculateFare = async (
  distanceMeters,
  durationSeconds,
  fareMode = null
) => {
  try {
    // Get current fare policy
    let farePolicy = await FarePolicy.findOne().sort({ updatedAt: -1 });

    // Create default if none exists
    if (!farePolicy) {
      farePolicy = await FarePolicy.create({
        mode: "admin",
        base_fare: 500,
        per_km_rate: 50,
        per_minute_rate: 10,
        minimum_fare: 200,
      });
    }

    const mode = fareMode || farePolicy.mode;

    // If driver mode is enabled and fareMode is 'driver', return null
    // (driver will set their own fare)
    if (mode === "driver") {
      return null;
    }

    // Calculate fare based on distance and time
    const distanceKm = distanceMeters / 1000;
    const durationMinutes = durationSeconds / 60;

    let calculatedFare = farePolicy.base_fare;
    calculatedFare += distanceKm * farePolicy.per_km_rate;
    calculatedFare += durationMinutes * farePolicy.per_minute_rate;

    // Apply minimum fare
    calculatedFare = Math.max(calculatedFare, farePolicy.minimum_fare);

    // Round to nearest whole number
    return Math.round(calculatedFare);
  } catch (error) {
    console.error("Fare calculation error:", error.message);
    // Return default minimum fare on error
    return 200;
  }
};

/**
 * Get current fare policy
 * @returns {Object} Current fare policy
 */
const getCurrentFarePolicy = async () => {
  let farePolicy = await FarePolicy.findOne().sort({ updatedAt: -1 });

  if (!farePolicy) {
    farePolicy = await FarePolicy.create({
      mode: "admin",
      base_fare: 500,
      per_km_rate: 50,
      per_minute_rate: 10,
      minimum_fare: 200,
    });
  }

  return farePolicy;
};

module.exports = {
  calculateFare,
  getCurrentFarePolicy,
};
