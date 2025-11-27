const axios = require("axios");

const ORS_API_KEY = process.env.OPENROUTESERVICE_API_KEY;
const ORS_BASE_URL = "https://api.openrouteservice.org";

/**
 * Get route between two coordinates
 * @param {Array} startCoords [longitude, latitude]
 * @param {Array} endCoords [longitude, latitude]
 * @returns {Object} Route data with distance, duration, and geometry
 */
const getRoute = async (startCoords, endCoords) => {
  try {
    const response = await axios.post(
      `${ORS_BASE_URL}/v2/directions/driving-car`,
      {
        coordinates: [startCoords, endCoords],
      },
      {
        headers: {
          Authorization: ORS_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const route = response.data.routes[0];
    return {
      distance_meters: route.summary.distance,
      duration_seconds: route.summary.duration,
      geometry: route.geometry,
    };
  } catch (error) {
    console.error(
      "OpenRouteService Error:",
      error.response?.data || error.message
    );
    throw new Error("Failed to calculate route");
  }
};

/**
 * Geocode an address to coordinates
 * @param {String} address Address to geocode
 * @returns {Array} [longitude, latitude]
 */
const geocode = async (address) => {
  try {
    const response = await axios.get(`${ORS_BASE_URL}/geocode/search`, {
      params: {
        api_key: ORS_API_KEY,
        text: address,
      },
    });

    if (response.data.features.length === 0) {
      throw new Error("Address not found");
    }

    return response.data.features[0].geometry.coordinates;
  } catch (error) {
    console.error("Geocoding Error:", error.response?.data || error.message);
    throw new Error("Failed to geocode address");
  }
};

/**
 * Reverse geocode coordinates to address
 * @param {Array} coords [longitude, latitude]
 * @returns {String} Address
 */
const reverseGeocode = async (coords) => {
  try {
    const response = await axios.get(`${ORS_BASE_URL}/geocode/reverse`, {
      params: {
        api_key: ORS_API_KEY,
        "point.lon": coords[0],
        "point.lat": coords[1],
      },
    });

    if (response.data.features.length === 0) {
      throw new Error("Location not found");
    }

    return response.data.features[0].properties.label;
  } catch (error) {
    console.error(
      "Reverse Geocoding Error:",
      error.response?.data || error.message
    );
    throw new Error("Failed to reverse geocode coordinates");
  }
};

module.exports = {
  getRoute,
  geocode,
  reverseGeocode,
};
